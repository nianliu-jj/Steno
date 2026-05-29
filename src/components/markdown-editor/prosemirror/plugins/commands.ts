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
import { toggleMark, setBlockType, wrapIn, lift } from 'prosemirror-commands';

/** ProseMirror 命令类型 */
export type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

/** 切换粗体 */
export function toggleStrong(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const markType = state.schema.marks.strong;
  if (!markType) return false;
  return toggleMark(markType)(state, dispatch);
}

/** 切换斜体 */
export function toggleEmphasis(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const markType = state.schema.marks.emphasis;
  if (!markType) return false;
  return toggleMark(markType)(state, dispatch);
}

/** 切换行内代码 */
export function toggleCodeInline(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const markType = state.schema.marks.code_inline;
  if (!markType) return false;
  return toggleMark(markType)(state, dispatch);
}

/** 切换删除线 */
export function toggleStrikethrough(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const markType = state.schema.marks.strikethrough;
  if (!markType) return false;
  return toggleMark(markType)(state, dispatch);
}

/** 切换高亮 */
export function toggleHighlight(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const markType = state.schema.marks.highlight;
  if (!markType) return false;
  return toggleMark(markType)(state, dispatch);
}

/** 设置标题级别 */
export function setHeading(level: number): Command {
  return (state, dispatch) => {
    const nodeType = state.schema.nodes.heading;
    if (!nodeType) return false;
    return setBlockType(nodeType, { level })(state, dispatch);
  };
}

/** 设置为段落 */
export function setParagraph(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const nodeType = state.schema.nodes.paragraph;
  if (!nodeType) return false;
  return setBlockType(nodeType)(state, dispatch);
}

/** 设置为代码块 */
export function setCodeBlock(language = ''): Command {
  return (state, dispatch) => {
    const nodeType = state.schema.nodes.code_block;
    if (!nodeType) return false;
    return setBlockType(nodeType, { language })(state, dispatch);
  };
}

/** 包装为引用块 */
export function wrapInBlockquote(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const nodeType = state.schema.nodes.blockquote;
  if (!nodeType) return false;
  return wrapIn(nodeType)(state, dispatch);
}

/** 包装为无序列表 */
export function wrapInBulletList(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const nodeType = state.schema.nodes.bullet_list;
  if (!nodeType) return false;
  return wrapIn(nodeType)(state, dispatch);
}

/** 包装为有序列表 */
export function wrapInOrderedList(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const nodeType = state.schema.nodes.ordered_list;
  if (!nodeType) return false;
  return wrapIn(nodeType)(state, dispatch);
}

/** 取消包装（提升） */
export function liftBlock(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  return lift(state, dispatch);
}

/** 插入分隔线 */
export function insertHorizontalRule(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
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
    const markType = state.schema.marks.link;
    if (!markType) return false;
    const { from, to, empty } = state.selection;

    if (dispatch) {
      const mark = markType.create({ href, title });
      let tr = state.tr;
      if (empty) {
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
  removeLink,
};
