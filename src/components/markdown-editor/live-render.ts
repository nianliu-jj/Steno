// Live-render ViewPlugin：把 CodeMirror 当作"原位渲染"的 Markdown 编辑器。
//
// 工作流程：
//   1. 遍历可见范围内的 lezer 语法树。
//   2. 对块级节点（标题 / 引用 / 列表项）给整行加 line decoration，
//      让 CSS 控制字号、粗细、缩进等样式。
//   3. 对内联节点（粗体 / 斜体 / 行内代码 / 删除线）给整段加 mark decoration，
//      让 CSS 应用对应样式。
//   4. 对语法标记符号（HeaderMark / EmphasisMark / CodeMark / 列表前缀），
//      若光标不在该 mark 所在行就用 Decoration.replace 隐藏，光标进入该行后
//      自动显示，便于继续编辑——这是 Obsidian Live Preview / PureMark 的同路做法。
//
// 不在本插件处理的事：
//   - 代码块语法高亮（交给 @codemirror/language 的 syntaxHighlighting）
//   - 链接 / 图片的折叠（首版仅做样式标记，未来再迭代）
//   - 水平线 / 表格 / 任务列表的渲染（首版交给默认行为）
import type { Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

const HEADING_NAME_RE = /^ATXHeading([1-6])$/;

const headingLineDecorations = [
  Decoration.line({ attributes: { class: 'cm-md-h1' } }),
  Decoration.line({ attributes: { class: 'cm-md-h2' } }),
  Decoration.line({ attributes: { class: 'cm-md-h3' } }),
  Decoration.line({ attributes: { class: 'cm-md-h4' } }),
  Decoration.line({ attributes: { class: 'cm-md-h5' } }),
  Decoration.line({ attributes: { class: 'cm-md-h6' } }),
];

const quoteLineDecoration = Decoration.line({ attributes: { class: 'cm-md-quote' } });
const listItemLineDecoration = Decoration.line({ attributes: { class: 'cm-md-list-item' } });

const strongMark = Decoration.mark({ class: 'cm-md-strong' });
const emphasisMark = Decoration.mark({ class: 'cm-md-em' });
const strikeMark = Decoration.mark({ class: 'cm-md-strike' });
const inlineCodeMark = Decoration.mark({ class: 'cm-md-inline-code' });
const linkMark = Decoration.mark({ class: 'cm-md-link' });

const hideMark = Decoration.replace({});

const HIDE_NODE_NAMES = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
]);

function buildDecorations(view: EditorView): DecorationSet {
  const builder: Range<Decoration>[] = [];
  const selection = view.state.selection.main;
  const cursorLineNumber = view.state.doc.lineAt(selection.head).number;
  const seenLines = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        const { name, from: nodeFrom, to: nodeTo } = node;

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

        if (name === 'Link' || name === 'Image') {
          builder.push(linkMark.range(nodeFrom, nodeTo));
          return;
        }

        if (HIDE_NODE_NAMES.has(name)) {
          const markLine = view.state.doc.lineAt(nodeFrom);
          if (markLine.number !== cursorLineNumber) {
            builder.push(hideMark.range(nodeFrom, nodeTo));
          }
        }
      },
    });
  }

  return Decoration.set(builder, true);
}

export const liveRenderPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: v => v.decorations,
  },
);
