/**
 * @file Live Render ViewPlugin — CodeMirror 6 原位 WYSIWYG Markdown 渲染
 *
 * 核心思想：利用 CM6 的 Decoration API，在编辑器内直接渲染 Markdown 样式，
 * 而不是分屏显示编辑/预览。用户看到的是"渲染后的样子"，但光标进入对应行时
 * 语法标记符号（`#`、`**`、`*` 等）会重新显示，便于继续编辑。
 *
 * **工作流程**：
 * 1. 遍历可见范围内的 Lezer 语法树节点
 * 2. 块级节点（标题/引用/列表项）→ `Decoration.line` 整行添加 CSS class
 * 3. 内联节点（粗体/斜体/行内代码/删除线）→ `Decoration.mark` 添加 CSS class
 * 4. 语法标记符号（`HeaderMark`/`EmphasisMark`/`CodeMark`）：
 *    光标不在该行时 → `Decoration.replace` 隐藏；光标进入后自动显示
 *
 * **设计参考**：Obsidian Live Preview / PureMark 的同路做法。
 *
 * **不在本插件处理的事**：
 * - 链接跳转/图片编辑控件 → 首版仅做预览，未来再迭代
 * - 水平线/表格/任务列表 → 交给 CM6 默认行为
 */
import { StateEffect, type Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import {
  Decoration,
  WidgetType,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

import { stenoAssetDisplaySrc } from '@/utils/stenoAssets';

/**
 * 匹配 Lezer Markdown 语法树中的 `ATXHeading1` ~ `ATXHeading6` 节点名。
 * group 1 = 标题级别 1–6。
 */
const HEADING_NAME_RE = /^ATXHeading([1-6])$/;

/**
 * 标题行装饰器数组，按级别索引（`decorations[level - 1]`）。
 *
 * 使用 `Decoration.line` 而非 `Decoration.mark` 是为了让 CSS 可以
 * 控制整行样式（`font-size`、`font-weight` 等），而非仅文本段。
 *
 * **为什么预创建而不是每次 `buildDecorations` 里新建**：
 * `Decoration.line` / `Decoration.mark` 是无状态对象，可以安全复用。
 * 预创建减少每次渲染时的 GC 压力。
 */
const headingLineDecorations = [
  Decoration.line({ attributes: { class: 'cm-md-h1' } }),
  Decoration.line({ attributes: { class: 'cm-md-h2' } }),
  Decoration.line({ attributes: { class: 'cm-md-h3' } }),
  Decoration.line({ attributes: { class: 'cm-md-h4' } }),
  Decoration.line({ attributes: { class: 'cm-md-h5' } }),
  Decoration.line({ attributes: { class: 'cm-md-h6' } }),
];

/** 引用块行装饰器 — 左边框 + 背景色。 */
const quoteLineDecoration = Decoration.line({ attributes: { class: 'cm-md-quote' } });
/** 列表项行装饰器 — 左侧缩进。 */
const listItemLineDecoration = Decoration.line({ attributes: { class: 'cm-md-list-item' } });
/** Fenced code block 行装饰器 — 连续背景 + 等宽字体。 */
const codeBlockStartLineDecoration = Decoration.line({
  attributes: { class: 'cm-md-code-block cm-md-code-fence-line cm-md-code-block-start' },
});
const codeBlockContentLineDecoration = Decoration.line({
  attributes: { class: 'cm-md-code-block cm-md-code-content-line' },
});
const codeBlockLastContentLineDecoration = Decoration.line({
  attributes: { class: 'cm-md-code-block cm-md-code-content-line cm-md-code-block-end' },
});
const codeBlockEndLineDecoration = Decoration.line({
  attributes: { class: 'cm-md-code-block cm-md-code-fence-line cm-md-code-block-end' },
});
const codeBlockSingleLineDecoration = Decoration.line({
  attributes: {
    class: 'cm-md-code-block cm-md-code-fence-line cm-md-code-block-start cm-md-code-block-end',
  },
});

// 内联 mark 装饰器 — 对文本段应用 CSS class
const strongMark = Decoration.mark({ class: 'cm-md-strong' });
const emphasisMark = Decoration.mark({ class: 'cm-md-em' });
const strikeMark = Decoration.mark({ class: 'cm-md-strike' });
const inlineCodeMark = Decoration.mark({ class: 'cm-md-inline-code' });
const linkMark = Decoration.mark({ class: 'cm-md-link' });
const codeInfoMark = Decoration.mark({ class: 'cm-md-code-info' });
const codeFenceMark = Decoration.mark({ class: 'cm-md-code-fence-mark' });

/**
 * 隐藏装饰器 — `Decoration.replace({})` 将匹配范围替换为空内容。
 *
 * 用于隐藏语法标记符号（`#`、`**`、`*` 等），实现 WYSIWYG 效果。
 * 光标进入该行时不应用此装饰器，标记符号重新显示。
 */
const hideMark = Decoration.replace({});

const IMAGE_MARKDOWN_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

export const refreshLiveRenderEffect = StateEffect.define<void>();

class ImagePreviewWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }

  eq(other: ImagePreviewWidget) {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-md-image-preview';
    const image = document.createElement('img');
    image.src = stenoAssetDisplaySrc(this.src);
    image.alt = this.alt || 'pasted image';
    wrap.append(image);
    return wrap;
  }
}

/**
 * 当光标不在该节点所在行时应当隐藏的语法节点名集合。
 *
 * Lezer Markdown 语法树中这些节点代表纯粹的"标记符号"，
 * 隐藏它们不影响文本内容，只影响视觉呈现。
 */
const HIDE_NODE_NAMES = new Set([
  'HeaderMark',         // `#`、`##` 等标题前缀
  'EmphasisMark',       // `*`、`**` 等强调标记
  'StrikethroughMark',  // `~~` 删除线标记
  'CodeMark',           // `` ` `` 行内代码标记；代码块围栏单独处理
]);

function isInsideFencedCode(node: { node: { parent: { name: string } | null } }): boolean {
  return node.node.parent?.name === 'FencedCode';
}

function hasClosingCodeFence(node: { node: { getChildren: (type: string) => unknown[] } }): boolean {
  return node.node.getChildren('CodeMark').length > 1;
}

function codeBlockDecorationForLine(
  lineNumber: number,
  startLineNumber: number,
  endLineNumber: number,
  hasClosingFence: boolean,
): Decoration {
  const isStart = lineNumber === startLineNumber;
  const isEnd = lineNumber === endLineNumber;

  if (isStart && isEnd) return codeBlockSingleLineDecoration;
  if (isStart) return codeBlockStartLineDecoration;
  if (hasClosingFence && isEnd) return codeBlockEndLineDecoration;
  if (!hasClosingFence && isEnd) return codeBlockLastContentLineDecoration;
  return codeBlockContentLineDecoration;
}

function decorateFencedCodeBlock(
  view: EditorView,
  builder: Range<Decoration>[],
  node: { from: number; to: number; node: { getChildren: (type: string) => unknown[] } },
  visibleFrom: number,
  visibleTo: number,
) {
  const doc = view.state.doc;
  const blockEndPos = Math.max(node.from, node.to - 1);
  const startLine = doc.lineAt(node.from);
  const endLine = doc.lineAt(blockEndPos);
  const firstLine = doc.lineAt(Math.max(node.from, visibleFrom));
  const lastLine = doc.lineAt(Math.min(blockEndPos, Math.max(visibleFrom, visibleTo - 1)));
  const hasClosingFence = hasClosingCodeFence(node);

  for (let lineNumber = firstLine.number; lineNumber <= lastLine.number; lineNumber += 1) {
    const line = doc.line(lineNumber);
    builder.push(
      codeBlockDecorationForLine(
        lineNumber,
        startLine.number,
        endLine.number,
        hasClosingFence,
      ).range(line.from),
    );
  }
}

/**
 * 构建当前视口的 DecorationSet。
 *
 * 每次文档变更、视口滚动或光标移动时重新计算。
 * 仅对**可见范围**（`view.visibleRanges`）内的节点做装饰，
 * 视口外的不处理 — 这是性能优化的关键。
 *
 * **`seenLines` 的作用**：块级装饰（标题/引用）是行级装饰，
 * 但 Lezer 的 `Blockquote` 节点可能跨多行。用 `seenLines` 保证
 * 同一行不会被重复添加装饰器。
 *
 * @param view - 当前编辑器视图
 * @returns 新计算的 DecorationSet
 */
function buildDecorations(view: EditorView): DecorationSet {
  const builder: Range<Decoration>[] = [];
  const selection = view.state.selection.main;
  // 光标所在行号 — 这一行的语法标记符号不隐藏
  const cursorLineNumber = view.state.doc.lineAt(selection.head).number;
  const seenLines = new Set<number>();

  // 只遍历可见范围 — 这是性能的关键
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        const { name, from: nodeFrom, to: nodeTo } = node;

        if (name === 'Image') {
          const imageSource = view.state.doc.sliceString(nodeFrom, nodeTo);
          const match = IMAGE_MARKDOWN_RE.exec(imageSource);
          if (match) {
            builder.push(
              Decoration.replace({
                widget: new ImagePreviewWidget(match[2], match[1]),
                block: false,
              }).range(nodeFrom, nodeTo),
            );
            return;
          }
        }

        // --- 块级节点：行装饰 ---
        const headingMatch = HEADING_NAME_RE.exec(name);
        if (headingMatch) {
          const level = Number(headingMatch[1]);
          const line = view.state.doc.lineAt(nodeFrom);
          if (!seenLines.has(line.number)) {
            builder.push(headingLineDecorations[level - 1].range(line.from));
            seenLines.add(line.number);
          }
          return;
        }

        if (name === 'Blockquote') {
          // Blockquote 可能跨多行，逐行添加装饰
          for (let pos = nodeFrom; pos < nodeTo;) {
            const line = view.state.doc.lineAt(pos);
            if (!seenLines.has(line.number)) {
              builder.push(quoteLineDecoration.range(line.from));
              seenLines.add(line.number);
            }
            if (line.to + 1 > nodeTo) break;
            pos = line.to + 1;
          }
          return;
        }

        if (name === 'ListItem') {
          const line = view.state.doc.lineAt(nodeFrom);
          if (!seenLines.has(line.number)) {
            builder.push(listItemLineDecoration.range(line.from));
            seenLines.add(line.number);
          }
          return;
        }

        if (name === 'FencedCode') {
          decorateFencedCodeBlock(view, builder, node, from, to);
          return;
        }

        // --- 内联节点：mark 装饰 ---
        if (name === 'StrongEmphasis') {
          builder.push(strongMark.range(nodeFrom, nodeTo));
          return;
        }

        if (name === 'Emphasis') {
          builder.push(emphasisMark.range(nodeFrom, nodeTo));
          return;
        }

        if (name === 'Strikethrough') {
          builder.push(strikeMark.range(nodeFrom, nodeTo));
          return;
        }

        if (name === 'InlineCode') {
          builder.push(inlineCodeMark.range(nodeFrom, nodeTo));
          return;
        }

        if (name === 'CodeInfo' && isInsideFencedCode(node)) {
          builder.push(codeInfoMark.range(nodeFrom, nodeTo));
          return;
        }

        if (name === 'CodeMark' && isInsideFencedCode(node)) {
          const markLine = view.state.doc.lineAt(nodeFrom);
          if (markLine.number !== cursorLineNumber) {
            builder.push(hideMark.range(nodeFrom, nodeTo));
          } else {
            builder.push(codeFenceMark.range(nodeFrom, nodeTo));
          }
          return;
        }

        if (name === 'Link' || name === 'Image') {
          builder.push(linkMark.range(nodeFrom, nodeTo));
          return;
        }

        // --- 语法标记符号：条件隐藏 ---
        // 仅当光标不在该行时才隐藏标记符号
        if (HIDE_NODE_NAMES.has(name)) {
          const markLine = view.state.doc.lineAt(nodeFrom);
          if (markLine.number !== cursorLineNumber) {
            builder.push(hideMark.range(nodeFrom, nodeTo));
          }
        }
      },
    });
  }

  // `true` = 对重叠装饰做排序/过滤，确保 decoration 顺序正确
  return Decoration.set(builder, true);
}

/**
 * Live Render ViewPlugin — 核心导出。
 *
 * 使用 `ViewPlugin.fromClass` 创建 CM6 插件类：
 * - `constructor` → 初始构建 decorations
 * - `update` → 文档变更/视口滚动/光标移动时重建 decorations
 * - `decorations` getter → CM6 用此获取当前 DecorationSet
 *
 * **性能注意**：`update` 只在 `docChanged || viewportChanged || selectionSet`
 * 时重建 — 纯光标移动（不跨行）不会触发 decoration 重建。
 */
export const liveRenderPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      const shouldRefreshAssets = update.transactions.some(transaction =>
        transaction.effects.some(effect => effect.is(refreshLiveRenderEffect)),
      );
      if (
        update.docChanged
        || update.viewportChanged
        || update.selectionSet
        || shouldRefreshAssets
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: v => v.decorations,
  },
);
