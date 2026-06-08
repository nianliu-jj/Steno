/**
 * @file Steno 编辑器命令
 *
 * 移植自 PureMark `src/core/commands/index.ts`（602 行）的核心子集。
 * 仅保留 keymap / 工具栏所需的常用命令：粗体/斜体/行内代码/删除线/高亮、
 * 标题/段落切换、引用/列表包裹、链接增删、分隔线/图片插入。
 *
 * Steno 适配说明（裁剪点）：
 * - PureMark 的整套表格命令（addRow/addColumn/insertMarkdownTableRowAfterCurrent 等）
 *   未移植 —— Steno 表格编辑统一走 prosemirror-tables 的命令（Phase 7 装配 NodeView）。
 * - 与 PureMark 一致使用 prosemirror-commands 的 toggleMark/setBlockType/wrapIn/lift。
 * - `any` 替换为 `Transaction` / 具体类型。
 */

import type { EditorState, Transaction } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';
import type { MarkType, NodeType, Node } from 'prosemirror-model';
import { toggleMark, setBlockType, wrapIn, lift } from 'prosemirror-commands';

/** ProseMirror 命令类型 */
export type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ---------------------------------------------------------------------------
// 行内格式 toggle —— 产生与 input-rules / parser 完全一致的文档结构：
//   marker(syntax_marker{type} + 语义 mark) + 内容(语义 mark) + marker(syntax_marker{type} + 语义 mark)
// 这样快捷键创建的格式与手动输入一致：序列化保留标记、重新加载不失效；再次按
// 同一快捷键可取消（移除语义 mark 并删除两侧 marker 文本）。
// ---------------------------------------------------------------------------

/** 选区是否已包含该 markType。 */
function selectionHasMark(state: EditorState, markType: MarkType): boolean {
  const { from, to, empty, $from } = state.selection;
  if (empty) {
    return !!markType.isInSet(state.storedMarks || $from.marks());
  }
  return state.doc.rangeHasMark(from, to, markType);
}

/** 找到包含 pos 的、parent 内 markType 连续区域的文档绝对范围。 */
function findMarkRegionAt(
  parent: Node,
  parentStart: number,
  markType: MarkType,
  pos: number
): { from: number; to: number } | null {
  let offset = parentStart;
  let runStart = -1;
  let runEnd = -1;
  let result: { from: number; to: number } | null = null;

  parent.forEach(child => {
    // 局部常量 start：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const start = offset;
    // 局部常量 end：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const end = offset + child.nodeSize;
    offset = end;
    if (child.marks.some(m => m.type === markType)) {
      if (runStart < 0) runStart = start;
      runEnd = end;
    } else {
      if (result === null && runStart >= 0 && pos >= runStart && pos <= runEnd) {
        result = { from: runStart, to: runEnd };
      }
      runStart = -1;
      runEnd = -1;
    }
  });
  if (result === null && runStart >= 0 && pos >= runStart && pos <= runEnd) {
    result = { from: runStart, to: runEnd };
  }
  return result;
}

/** 给选区包裹一对 marker（含 syntax_marker + 语义 mark），保留选区内已有结构。 */
function applyInlineSyntax(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  markType: MarkType,
  syntaxType: string,
  marker: string
): boolean {
  const { from, to } = state.selection;
  if (from === to) return false;

  // 局部常量 syntaxMarkerType：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const syntaxMarkerType = state.schema.marks.syntax_marker;
  // 局部常量 semanticMark：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const semanticMark = markType.create();
  // 局部常量 markerMarks：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const markerMarks = syntaxMarkerType ? [syntaxMarkerType.create({ syntaxType }), semanticMark] : [semanticMark];

  let tr = state.tr;
  // 1. 选区内容加语义 mark（保留嵌套的其他 mark / 结构）
  tr = tr.addMark(from, to, semanticMark);
  // 2. 先在 to 处插入后缀 marker，再在 from 处插入前缀 marker（from < to，互不串扰）
  tr = tr.insert(to, state.schema.text(marker, markerMarks));
  tr = tr.insert(from, state.schema.text(marker, markerMarks));
  // 3. 选区落在内容（两 marker 之间），便于继续编辑 / 再次 toggle
  tr = tr.setSelection(TextSelection.create(tr.doc, from + marker.length, to + marker.length));
  dispatch(tr.scrollIntoView());
  return true;
}

/** 取消选区所在区域的行内格式：移除语义 mark 并删除该类型的 marker 文本。 */
function removeInlineSyntax(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  markType: MarkType,
  syntaxType: string
): boolean {
  const { from, to } = state.selection;
  const $from = state.doc.resolve(from);
  // 局部常量 parent：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const parent = $from.parent;
  // 局部常量 parentStart：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const parentStart = $from.start();

  // 局部常量 region：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const region = findMarkRegionAt(parent, parentStart, markType, from);
  if (!region) {
    // 兜底：直接移除选区范围内的语义 mark
    dispatch(state.tr.removeMark(from, to, markType).scrollIntoView());
    return true;
  }

  // 收集区域内节点：剔除本类型的 syntax_marker 文本（成对 marker），其余移除语义 mark 后保留
  // （内层嵌套的其他格式标记 / mark 原样保留）。
  const kept: Node[] = [];
  let offset = parentStart;
  parent.forEach(child => {
    // 局部常量 start：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const start = offset;
    // 局部常量 end：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const end = offset + child.nodeSize;
    offset = end;
    if (start < region.from || end > region.to) return;
    // 局部常量 isOwnSyntaxMarker：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const isOwnSyntaxMarker =
      child.isText && child.marks.some(m => m.type.name === 'syntax_marker' && m.attrs.syntaxType === syntaxType);
    if (isOwnSyntaxMarker) return;
    kept.push(child.mark(child.marks.filter(m => m.type !== markType)));
  });

  dispatch(state.tr.replaceWith(region.from, region.to, kept).scrollIntoView());
  return true;
}

/** 通用行内格式 toggle 命令工厂。 */
function toggleInlineSyntax(markName: string, syntaxType: string, marker: string): Command {
  return (state, dispatch) => {
    // 局部常量 markType：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const markType = state.schema.marks[markName];
    if (!markType) return false;

    // 空选区：无法插入成对标记文本，沿用 prosemirror 的 storedMark 行为（继续输入时生效）
    if (state.selection.empty) {
      return toggleMark(markType)(state, dispatch);
    }

    if (!dispatch) return true;

    if (selectionHasMark(state, markType)) {
      return removeInlineSyntax(state, dispatch, markType, syntaxType);
    }
    return applyInlineSyntax(state, dispatch, markType, syntaxType, marker);
  };
}

/** 切换粗体 */
export const toggleStrong: Command = toggleInlineSyntax('strong', 'strong', '**');

/** 切换斜体 */
export const toggleEmphasis: Command = toggleInlineSyntax('emphasis', 'emphasis', '*');

/** 切换行内代码 */
export const toggleCodeInline: Command = toggleInlineSyntax('code_inline', 'code_inline', '`');

/** 切换删除线 */
export const toggleStrikethrough: Command = toggleInlineSyntax('strikethrough', 'strikethrough', '~~');

/** 切换高亮 */
export const toggleHighlight: Command = toggleInlineSyntax('highlight', 'highlight', '==');

// ---------------------------------------------------------------------------
// 块级标题 —— 与行内同理，heading 的 "#" 也作为 syntax_marker 文本保留在节点内，
// 使快捷键创建的标题与手动输入 "# " 完全一致，并支持再次按下取消（toggle 回段落）。
// ---------------------------------------------------------------------------

/** 块首若为 heading 的 "#" 标记，返回其字符长度（含紧随的一个分隔空格），否则 0。 */
function headingMarkerLength(block: Node): number {
  if (block.childCount === 0) return 0;
  // 局部常量 first：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const first = block.child(0);
  if (!first.isText || !first.text) return 0;
  // 局部常量 isHeadingMarker：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const isHeadingMarker = first.marks.some(m => m.type.name === 'syntax_marker' && m.attrs.syntaxType === 'heading');
  if (!isHeadingMarker) return 0;
  let len = first.text.length; // "#" 的数量
  if (block.childCount > 1) {
    // 局部常量 second：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const second = block.child(1);
    if (second.isText && second.text && second.text.startsWith(' ')) {
      len += 1; // 与 parser 输出的 "# " 一致，仅算一个分隔空格
    }
  }
  return len;
}

/**
 * 把光标所在块转换为目标块类型，并维护 heading 的 "# " 标记：
 * - 先移除原有的 heading 标记（若有）
 * - 目标为 heading 时，按 level 重新插入 "#"（带 syntax_marker）+ 普通空格
 */
function reformatBlock(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  toType: NodeType,
  level?: number
): boolean {
  const { $from } = state.selection;
  // 局部常量 block：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const block = $from.parent;

  // 非文本块（如表格单元格上下文）回退给 prosemirror 的 setBlockType
  if (!block.isTextblock) {
    return setBlockType(toType, level != null ? { level } : undefined)(state, dispatch);
  }

  if (!dispatch) return true;

  // 局部常量 contentStart：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const contentStart = $from.start();
  // 局部常量 syntaxMarkerType：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const syntaxMarkerType = state.schema.marks.syntax_marker;
  // 局部常量 headingType：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const headingType = state.schema.nodes.heading;

  let tr = state.tr;
  // 1. 移除旧的 heading "# " 标记（若当前块是带标记的 heading）
  const markerLen = headingMarkerLength(block);
  if (markerLen > 0) {
    tr = tr.delete(contentStart, contentStart + markerLen);
  }
  // 2. 切换块类型
  if (toType === headingType) {
    // 局部常量 lv：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const lv = level ?? 1;
    tr = tr.setBlockType(contentStart, contentStart, toType, { level: lv });
    // 3. 插入新的 "# " 标记：# 带 syntax_marker(heading)，空格为普通文本（与 parser 一致）
    const hashes = '#'.repeat(lv);
    // 局部常量 markerMarks：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const markerMarks = syntaxMarkerType ? [syntaxMarkerType.create({ syntaxType: 'heading' })] : [];
    tr = tr.insert(contentStart, state.schema.text(hashes, markerMarks));
    tr = tr.insert(contentStart + hashes.length, state.schema.text(' '));
  } else {
    tr = tr.setBlockType(contentStart, contentStart, toType);
  }
  dispatch(tr.scrollIntoView());
  return true;
}

/** 设置标题级别（再次对同级标题执行则取消，回退为段落）。 */
export function setHeading(level: number): Command {
  return (state, dispatch) => {
    // 局部常量 headingType：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const headingType = state.schema.nodes.heading;
    // 局部常量 paragraphType：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const paragraphType = state.schema.nodes.paragraph;
    if (!headingType || !paragraphType) return false;

    // 局部常量 block：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const block = state.selection.$from.parent;
    if (block.type !== headingType && block.type !== paragraphType) return false;

    // toggle：已是同级标题 → 回退为段落（取消标题）
    if (block.type === headingType && block.attrs.level === level) {
      return reformatBlock(state, dispatch, paragraphType);
    }
    return reformatBlock(state, dispatch, headingType, level);
  };
}

/** 设置为段落（若原为标题则一并移除 "# " 标记）。 */
export function setParagraph(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  // 局部常量 paragraphType：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType) return false;
  return reformatBlock(state, dispatch, paragraphType);
}

/** 设置为代码块 */
export function setCodeBlock(language = ''): Command {
  return (state, dispatch) => {
    // 局部常量 nodeType：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nodeType = state.schema.nodes.code_block;
    if (!nodeType) return false;
    return setBlockType(nodeType, { language })(state, dispatch);
  };
}

/** 包装为引用块 */
export function wrapInBlockquote(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  // 局部常量 nodeType：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const nodeType = state.schema.nodes.blockquote;
  if (!nodeType) return false;
  return wrapIn(nodeType)(state, dispatch);
}

/** 包装为无序列表 */
export function wrapInBulletList(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  // 局部常量 nodeType：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const nodeType = state.schema.nodes.bullet_list;
  if (!nodeType) return false;
  return wrapIn(nodeType)(state, dispatch);
}

/** 包装为有序列表 */
export function wrapInOrderedList(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  // 局部常量 nodeType：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const nodeType = state.schema.nodes.ordered_list;
  if (!nodeType) return false;
  return wrapIn(nodeType)(state, dispatch);
}

/** 取消包装（提升） */
export function liftBlock(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  return lift(state, dispatch);
}

/** 插入分隔线 */
export function insertHorizontalRule(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  // 局部常量 nodeType：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const nodeType = state.schema.nodes.horizontal_rule;
  if (!nodeType) return false;
  if (dispatch) {
    dispatch(state.tr.replaceSelectionWith(nodeType.create()).scrollIntoView());
  }
  return true;
}

/** 插入链接（选中文本则加 mark，否则插入文本后加 mark） */
export function insertLink(href: string, title = ''): Command {
  return (state, dispatch) => {
    // 局部常量 markType：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const markType = state.schema.marks.link;
    if (!markType) return false;
    const { from, to, empty } = state.selection;

    if (dispatch) {
      // 局部常量 mark：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const mark = markType.create({ href, title });
      let tr = state.tr;
      if (empty) {
        // 局部常量 text：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const text = title || href;
        tr = tr.insertText(text, from);
        tr = tr.addMark(from, from + text.length, mark);
      } else {
        tr = tr.addMark(from, to, mark);
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** 移除链接 */
export function removeLink(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  // 局部常量 markType：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const markType = state.schema.marks.link;
  if (!markType) return false;
  const { from, to } = state.selection;
  if (dispatch) {
    dispatch(state.tr.removeMark(from, to, markType));
  }
  return true;
}

/** 命令集合（便于工具栏与 keymap 引用） */
export const commands = {
  toggleStrong,
  toggleEmphasis,
  toggleCodeInline,
  toggleStrikethrough,
  toggleHighlight,
  setHeading,
  setParagraph,
  setCodeBlock,
  wrapInBlockquote,
  wrapInBulletList,
  wrapInOrderedList,
  liftBlock,
  insertHorizontalRule,
  insertLink,
  removeLink
};
