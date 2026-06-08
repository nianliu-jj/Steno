/**
 * @file Steno 即时渲染装饰系统
 *
 * 移植自 PureMark `src/core/decorations/index.ts`（688 行）。
 *
 * 基于 `syntax_marker` mark 的即时渲染装饰系统：语法标记是真实的文本内容，
 * 光标可以在其内部自由移动；装饰只控制显示/隐藏，不改变文档结构。这是
 * `plugins/instant-render.ts` 的核心依赖，提供 `findSyntaxMarkerRegions`
 * 与 `createDecorationPlugin`。
 *
 * Steno 适配说明（相对 PureMark）：
 * - PureMark 的 source-view（源码模式）依赖 `plugins/source-view-transform`
 *   做块级⇄段落转换。Steno 暂不实现 source-view 的块转换，这里只保留
 *   `sourceView` 布尔开关（默认 false），并移除对 source-view-transform 的依赖；
 *   `setSourceView` / `toggleSourceView` 仅切换装饰显隐，不做文档结构转换。
 * - PureMark 行内数学渲染依赖 `nodeviews/math-block` 的 `renderInlineMath`；
 *   Steno 的 math-block NodeView 未导出该函数，这里直接内联调用 KaTeX
 *   （`katex.renderToString`，`throwOnError: false`）。
 * - CSS 类名前缀沿用 PureMark 的 `puremark-*`（与 schema 里 `steno-syntax`
 *   解耦——这些是装饰类，不是 mark 自带类），样式由 Phase 7/8 的编辑器样式表提供。
 * - 全部 `any` 替换为 `unknown` / 具体类型以满足 oxlint 严格模式。
 */

import { Decoration, DecorationSet } from 'prosemirror-view';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { renderToString as katexRenderToString } from 'katex';

/** 装饰插件状态 */
export interface DecorationPluginState {
  decorations: DecorationSet;
  activeRegions: SyntaxMarkerRegion[];
  sourceView: boolean;
  cachedSyntaxRegions: SyntaxMarkerRegion[];
  cachedMathInlineRegions: MathInlineRegion[];
}

/** 语法标记区域 */
export interface SyntaxMarkerRegion {
  from: number;
  to: number;
  syntaxType: string;
}

/** 装饰插件 Key */
export const decorationPluginKey = new PluginKey<DecorationPluginState>('steno-decorations');

/**
 * CSS 类名映射 —— 决定哪些语义 mark 类型会触发"光标进入时显示其语法标记"。
 * 移植自 PureMark `SYNTAX_CLASSES`。
 */
export const SYNTAX_CLASSES: Record<string, string> = {
  strong: 'puremark-strong',
  emphasis: 'puremark-emphasis',
  code_inline: 'puremark-code-inline',
  strikethrough: 'puremark-strikethrough',
  link: 'puremark-link',
  highlight: 'puremark-highlight',
  math_inline: 'puremark-math-inline',
  heading: 'puremark-heading', // 标题
  strong_emphasis: 'puremark-strong-emphasis', // 粗斜体
  escape: 'puremark-escape', // 转义
  sub: 'puremark-sub', // 下标
  sup: 'puremark-sup', // 上标
  html_inline: 'puremark-html-inline' // 行内 HTML
};

/** 语法类型关联映射 - 用于处理嵌套语法 */
const SYNTAX_TYPE_RELATIONS: Record<string, string[]> = {
  strong_emphasis: ['strong', 'emphasis'],
  strong: ['strong', 'strong_emphasis'],
  emphasis: ['emphasis', 'strong_emphasis'],
  highlight: ['highlight'],
  strikethrough: ['strikethrough'],
  code_inline: ['code_inline'],
  link: ['link'],
  math_inline: ['math_inline'],
  heading: ['heading'],
  escape: ['escape'],
  sub: ['sub'],
  sup: ['sup'],
  html_inline: ['html_inline']
};

/**
 * 查找文档中所有的 syntax_marker 区域
 */
export function findSyntaxMarkerRegions(doc: Node): SyntaxMarkerRegion[] {
  const regions: SyntaxMarkerRegion[] = [];

  doc.descendants((node, pos) => {
    if (node.isText) {
      // 局部常量 syntaxMark：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const syntaxMark = node.marks.find(m => m.type.name === 'syntax_marker');
      if (syntaxMark) {
        regions.push({
          from: pos,
          to: pos + node.nodeSize,
          syntaxType: syntaxMark.attrs.syntaxType as string
        });
      }
    }
    return true;
  });

  return regions;
}

/** 行内数学公式区域 */
export interface MathInlineRegion {
  from: number;
  to: number;
  content: string;
  contentFrom: number;
  contentTo: number;
}

/**
 * 查找文档中所有的行内数学公式区域
 */
export function findMathInlineRegions(doc: Node): MathInlineRegion[] {
  const regions: MathInlineRegion[] = [];

  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      // 在文本块中查找 math_inline mark 区域
      let offset = pos + 1; // +1 跳过节点开始标记
      let currentRegion: MathInlineRegion | null = null;

      for (let i = 0; i < node.childCount; i++) {
        // 局部常量 child：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const child = node.child(i);
        // 局部常量 childStart：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const childStart = offset;
        // 局部常量 childEnd：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const childEnd = offset + child.nodeSize;

        // 局部常量 hasMathMark：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const hasMathMark = child.marks.some(m => m.type.name === 'math_inline');
        // 局部常量 hasSyntaxMark：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const hasSyntaxMark = child.marks.some(
          m => m.type.name === 'syntax_marker' && m.attrs.syntaxType === 'math_inline'
        );

        if (hasMathMark) {
          if (currentRegion === null) {
            currentRegion = {
              from: childStart,
              to: childEnd,
              content: '',
              contentFrom: childStart,
              contentTo: childEnd
            };
          } else {
            currentRegion.to = childEnd;
          }

          // 如果不是语法标记，则是内容
          if (!hasSyntaxMark && child.isText) {
            if (currentRegion.content === '') {
              currentRegion.contentFrom = childStart;
            }
            currentRegion.content += child.text ?? '';
            currentRegion.contentTo = childEnd;
          }
        } else if (currentRegion !== null) {
          regions.push(currentRegion);
          currentRegion = null;
        }

        offset = childEnd;
      }

      // 不要忘记最后一个区域
      if (currentRegion !== null) {
        regions.push(currentRegion);
      }
    }
    return true;
  });

  return regions;
}

/** 语义区域 */
interface SemanticRegion {
  type: string;
  from: number;
  to: number;
}

/**
 * 查找包含指定位置的所有语义 Mark 区域
 * 用于判断光标是否在某个语法结构内，返回所有相关的语义区域（支持嵌套语法）
 */
export function findSemanticRegionsAt(doc: Node, pos: number): SemanticRegion[] {
  const $pos = doc.resolve(pos);
  // 局部常量 parent：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const parent = $pos.parent;

  if (!parent.isTextblock) return [];

  // 局部常量 parentStart：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const parentStart = $pos.start();
  let offset = parentStart;
  const regions: SemanticRegion[] = [];
  // 局部常量 foundTypes：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const foundTypes = new Set<string>();

  for (let i = 0; i < parent.childCount; i++) {
    // 局部常量 child：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const child = parent.child(i);
    // 局部常量 childStart：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const childStart = offset;
    // 局部常量 childEnd：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const childEnd = offset + child.nodeSize;

    if (pos >= childStart && pos <= childEnd) {
      // 检查这个节点的所有 marks
      for (const mark of child.marks) {
        if (mark.type.name !== 'syntax_marker' && SYNTAX_CLASSES[mark.type.name] && !foundTypes.has(mark.type.name)) {
          // 找到语义 mark，现在需要找到整个区域
          const region = findFullMarkRegion(parent, mark.type.name, childStart, parentStart);
          if (region) {
            regions.push(region);
            foundTypes.add(mark.type.name);
          }
        }
      }
    }

    offset = childEnd;
  }

  return regions;
}

/**
 * 找到完整的 mark 区域（包括相邻的同类型 mark 节点）
 * 确保找到包含 startHint 位置的连续区域
 */
function findFullMarkRegion(
  parent: Node,
  markType: string,
  startHint: number,
  parentOffset: number
): SemanticRegion | null {
  // 收集所有有该 mark 的连续区域
  const regions: Array<{ from: number; to: number }> = [];
  let currentRegion: { from: number; to: number } | null = null;
  let offset = parentOffset;

  for (let i = 0; i < parent.childCount; i++) {
    // 局部常量 child：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const child = parent.child(i);
    // 局部常量 childStart：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const childStart = offset;
    // 局部常量 childEnd：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const childEnd = offset + child.nodeSize;

    // 局部常量 hasMark：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const hasMark = child.marks.some(m => m.type.name === markType);

    if (hasMark) {
      if (currentRegion === null) {
        currentRegion = { from: childStart, to: childEnd };
      } else {
        currentRegion.to = childEnd;
      }
    } else if (currentRegion !== null) {
      regions.push(currentRegion);
      currentRegion = null;
    }

    offset = childEnd;
  }

  if (currentRegion !== null) {
    regions.push(currentRegion);
  }

  // 找到包含 startHint 的区域
  for (const region of regions) {
    if (startHint >= region.from && startHint <= region.to) {
      return { type: markType, from: region.from, to: region.to };
    }
  }

  // 兜底：返回第一个区域
  if (regions.length > 0) {
    return { type: markType, from: regions[0].from, to: regions[0].to };
  }

  return null;
}

/**
 * 获取光标所在的所有语义区域
 * 包括行内 marks 和块级节点（如标题）
 */
export function getActiveSemanticRegions(doc: Node, cursorPos: number): SemanticRegion[] {
  const regions: SemanticRegion[] = [];

  // 首先检查行内 mark 区域
  const inlineRegions = findSemanticRegionsAt(doc, cursorPos);
  regions.push(...inlineRegions);

  // 检查块级节点（如标题）
  const $pos = doc.resolve(cursorPos);
  // 局部常量 parent：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const parent = $pos.parent;

  if (parent.type.name === 'heading') {
    // 局部常量 start：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const start = $pos.start();
    // 局部常量 end：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const end = $pos.end();
    regions.push({ type: 'heading', from: start, to: end });
  }

  return regions;
}

/**
 * 检查语法类型是否与语义区域类型相关
 */
function isSyntaxTypeRelated(syntaxType: string, semanticType: string): boolean {
  // 局部常量 relatedTypes：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const relatedTypes = SYNTAX_TYPE_RELATIONS[syntaxType] ?? [syntaxType];
  return relatedTypes.includes(semanticType);
}

/** 内联渲染 KaTeX —— 替代 PureMark 的 `renderInlineMath`。渲染失败返回空串。 */
function renderInlineMath(content: string): string {
  try {
    return katexRenderToString(content, { throwOnError: false, displayMode: false });
  } catch {
    return '';
  }
}

/** computeDecorations 的返回 */
interface ComputeResult {
  decorations: DecorationSet;
  activeRegions: SyntaxMarkerRegion[];
  syntaxRegions: SyntaxMarkerRegion[];
  mathInlineRegions: MathInlineRegion[];
}

/**
 * 计算装饰集
 */
export function computeDecorations(
  doc: Node,
  cursorPos: number,
  sourceView: boolean,
  precomputedSyntaxRegions?: SyntaxMarkerRegion[],
  precomputedMathRegions?: MathInlineRegion[]
): ComputeResult {
  // 源码模式下跳过所有装饰计算：
  // - 语法标记通过 mark 自带的 `steno-syntax` 类已有正确样式
  // - 无需 hidden/visible 装饰切换，也无需行内数学渲染 widget
  if (sourceView) {
    return {
      decorations: DecorationSet.empty,
      activeRegions: [],
      syntaxRegions: precomputedSyntaxRegions ?? [],
      mathInlineRegions: precomputedMathRegions ?? []
    };
  }

  // 局部常量 syntaxRegions：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const syntaxRegions = precomputedSyntaxRegions ?? findSyntaxMarkerRegions(doc);
  // 局部常量 mathInlineRegions：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const mathInlineRegions = precomputedMathRegions ?? findMathInlineRegions(doc);
  const decorations: Decoration[] = [];

  // 获取光标所在的所有语义区域
  const activeSemanticRegions = getActiveSemanticRegions(doc, cursorPos);

  for (const region of syntaxRegions) {
    // 判断这个语法标记是否应该显示
    let shouldShow = false;

    if (region.syntaxType === 'escape') {
      // escape 类型特殊处理：当光标在 `\` 或紧邻的被转义字符上时显示
      if (cursorPos >= region.from && cursorPos <= region.to + 1) {
        shouldShow = true;
      }
    } else if (activeSemanticRegions.length > 0) {
      // 如果光标在某个语义区域内，显示该区域的所有语法标记
      for (const activeRegion of activeSemanticRegions) {
        if (isSyntaxTypeRelated(region.syntaxType, activeRegion.type)) {
          // 检查位置是否在语义区域内（严格检查）
          if (region.from >= activeRegion.from && region.to <= activeRegion.to) {
            shouldShow = true;
            break;
          }
        }
      }
    }

    if (!shouldShow) {
      // 检查光标是否直接在这个 syntax_marker 内
      if (cursorPos >= region.from && cursorPos <= region.to) {
        shouldShow = true;
      }
    }

    if (!shouldShow) {
      // 隐藏语法标记
      if (region.syntaxType === 'heading') {
        // 标题语法标记特殊处理：只隐藏 # 字符，保留尾部空格可见
        const text = doc.textBetween(region.from, region.to);
        // 局部常量 hashEnd：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const hashEnd = text.search(/[^#]/);
        if (hashEnd > 0 && hashEnd < text.length) {
          decorations.push(
            Decoration.inline(region.from, region.from + hashEnd, {
              class: 'puremark-syntax-hidden',
              contenteditable: 'false',
              'aria-hidden': 'true'
            })
          );
        } else {
          decorations.push(
            Decoration.inline(region.from, region.to, {
              class: 'puremark-syntax-hidden',
              contenteditable: 'false',
              'aria-hidden': 'true'
            })
          );
        }
      } else {
        decorations.push(
          Decoration.inline(region.from, region.to, {
            class: 'puremark-syntax-hidden',
            contenteditable: 'false',
            'aria-hidden': 'true'
          })
        );
      }
    } else {
      // 显示语法标记
      decorations.push(
        Decoration.inline(region.from, region.to, {
          class: 'puremark-syntax-visible'
        })
      );
    }
  }

  // 为行内数学公式添加渲染装饰
  for (const mathRegion of mathInlineRegions) {
    // 局部常量 cursorInMath：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const cursorInMath = cursorPos >= mathRegion.from && cursorPos <= mathRegion.to;

    if (!cursorInMath && mathRegion.content.trim()) {
      // 光标不在公式内：隐藏源码，显示渲染结果
      decorations.push(
        Decoration.inline(mathRegion.from, mathRegion.to, {
          class: 'puremark-math-source-hidden'
        })
      );

      // 局部常量 renderedHtml：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const renderedHtml = renderInlineMath(mathRegion.content);
      if (renderedHtml) {
        // 局部常量 widget：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const widget = document.createElement('span');
        widget.className = 'puremark-math-rendered';
        widget.innerHTML = renderedHtml;
        decorations.push(Decoration.widget(mathRegion.to, widget, { side: -1 }));
      }
    }
  }

  return {
    decorations: DecorationSet.create(doc, decorations),
    activeRegions: syntaxRegions.filter(r => cursorPos >= r.from && cursorPos <= r.to),
    syntaxRegions,
    mathInlineRegions
  };
}

/**
 * 创建装饰插件
 */
export function createDecorationPlugin(initialSourceView = false): Plugin<DecorationPluginState> {
  return new Plugin<DecorationPluginState>({
    key: decorationPluginKey,

    state: {
      init(_, state) {
        const { decorations, activeRegions, syntaxRegions, mathInlineRegions } = computeDecorations(
          state.doc,
          state.selection.head,
          initialSourceView
        );
        return {
          decorations,
          activeRegions,
          sourceView: initialSourceView,
          cachedSyntaxRegions: syntaxRegions,
          cachedMathInlineRegions: mathInlineRegions
        };
      },

      apply(tr, pluginState, oldState, newState) {
        // 局部常量 selectionChanged：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const selectionChanged = !oldState.selection.eq(newState.selection);
        // 局部常量 docChanged：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const docChanged = tr.docChanged;

        // 局部常量 meta：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const meta = tr.getMeta(decorationPluginKey) as { sourceView?: boolean } | undefined;
        // 局部常量 sourceView：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const sourceView = meta?.sourceView ?? pluginState.sourceView;

        if (docChanged || selectionChanged || meta?.sourceView !== undefined) {
          // 仅在文档变化或源码模式切换时重新扫描区域，选区变化时复用缓存
          const needRescan = docChanged || meta?.sourceView !== undefined;
          // 局部常量 syntaxRegions：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
          const syntaxRegions = needRescan ? undefined : pluginState.cachedSyntaxRegions;
          // 局部常量 mathRegions：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
          const mathRegions = needRescan ? undefined : pluginState.cachedMathInlineRegions;

          const {
            decorations,
            activeRegions,
            syntaxRegions: newSyntax,
            mathInlineRegions: newMath
          } = computeDecorations(newState.doc, newState.selection.head, sourceView, syntaxRegions, mathRegions);
          return {
            decorations,
            activeRegions,
            sourceView,
            cachedSyntaxRegions: newSyntax,
            cachedMathInlineRegions: newMath
          };
        }

        return pluginState;
      }
    },

    props: {
      decorations(state) {
        return this.getState(state)?.decorations ?? DecorationSet.empty;
      }
    }
  });
}

/**
 * 切换源码视图（仅切换装饰显隐，不做块级结构转换 —— Steno 适配）
 */
export function toggleSourceView(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  // 局部常量 pluginState：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const pluginState = decorationPluginKey.getState(state);
  if (!pluginState) return false;

  // 局部常量 newSourceView：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const newSourceView = !pluginState.sourceView;

  if (dispatch) {
    // 局部常量 tr：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const tr = state.tr.setMeta(decorationPluginKey, { sourceView: newSourceView }).setMeta('addToHistory', false);
    dispatch(tr);
  }

  return true;
}

/**
 * 设置源码视图状态
 */
export function setSourceView(state: EditorState, enabled: boolean, dispatch?: (tr: Transaction) => void): boolean {
  if (dispatch) {
    // 局部常量 tr：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const tr = state.tr.setMeta(decorationPluginKey, { sourceView: enabled }).setMeta('addToHistory', false);
    dispatch(tr);
  }

  return true;
}
