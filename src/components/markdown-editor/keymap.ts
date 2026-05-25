/**
 * @file Markdown 编辑器快捷键绑定
 *
 * 为 CodeMirror 6 提供类 Obsidian / VS Code 风格的 Markdown 快捷键。
 * 所有命令返回 `boolean`（按 prosemirror-keymap 风格），
 * 表示是否消费了按键事件，以便链入 `keymap.of([{key, run}])`。
 *
 * **命名约定**：
 * - `wrap(left, right)` — 选区包裹（粗体/斜体/行内代码/删除线/链接）
 * - `setHeading(level)` — 用 `#`...`######` 替换/移除标题前缀
 * - `insertLinePrefix(prefix)` — 行首插入前缀（列表/待办/引用）
 * - `wrapBlock(left, right)` — 选区前后各插入一行（代码块包裹）
 *
 * **`preventDefault` 的作用**：防止浏览器对 `Ctrl+B`（加粗）等快捷键的默认行为
 * （如 Firefox 的书签侧栏），确保快捷键完全由编辑器接管。
 */

import { EditorSelection } from '@codemirror/state';
import type { Command, KeyBinding } from '@codemirror/view';

import { redo, undo } from '@codemirror/commands';

/**
 * 创建选区包裹命令。
 *
 * 选中文本 → 在前后加 `left` / `right`，光标选中原文本区域（方便继续编辑）。
 * 无选区时在光标位置插入 `left + right`，光标落在两者中间。
 *
 * @param left - 左侧包裹文本（如 `**`）
 * @param right - 右侧包裹文本；默认等于 `left`（对称包裹）
 * @returns CodeMirror `Command` 函数
 *
 * @example
 * ```ts
 * wrap('**')           // 选中 "hello" → "**hello**"，光标选中 "hello"
 * wrap('[', '](url)')  // 选中 "link" → "[link](url)"，光标选中 "link"
 * ```
 */
function wrap(left: string, right: string = left): Command {
  return view => {
    const changes = view.state.changeByRange(range => {
      const text = view.state.sliceDoc(range.from, range.to);
      const insert = `${left}${text}${right}`;
      return {
        changes: { from: range.from, to: range.to, insert },
        // 光标选中原文本区域（不包括包裹符号），方便用户继续编辑
        range: EditorSelection.range(
          range.from + left.length,
          range.from + left.length + text.length,
        ),
      };
    });
    view.dispatch(changes);
    view.focus();
    return true;
  };
}

/**
 * 创建标题级别设置命令。
 *
 * 去掉当前行已有的 `#` 前缀，再按 `level` 重新设置。
 * `level=0` 表示取消标题（移除所有 `#` 前缀）。
 *
 * @param level - 标题级别 0–6（0=取消标题）
 * @returns CodeMirror `Command` 函数
 *
 * @example
 * ```ts
 * setHeading(2)  // "### 原H3" → "## 原H3"
 * setHeading(0)  // "## H2" → "H2"（取消标题）
 * ```
 */
function setHeading(level: number): Command {
  return view => {
    const changes = view.state.changeByRange(range => {
      const line = view.state.doc.lineAt(range.head);
      // 先去掉已有的 `#` 前缀，再按 level 重新设置
      const stripped = line.text.replace(/^#{1,6}\s+/, '');
      const next = level === 0 ? stripped : `${'#'.repeat(level)} ${stripped}`;
      // 光标跟随：保持光标在文本中的相对位置
      const cursorOffset = next.length - line.text.length;
      const head = Math.max(line.from, Math.min(line.to + cursorOffset, line.from + next.length));
      return {
        changes: { from: line.from, to: line.to, insert: next },
        range: EditorSelection.cursor(head),
      };
    });
    view.dispatch(changes);
    view.focus();
    return true;
  };
}

/**
 * 创建行首前缀插入命令（列表/待办/引用等）。
 *
 * 在当前行开头插入 `prefix`，光标移到原位置 + prefix 长度处。
 *
 * @param prefix - 行首前缀（如 `'- '`、`'1. '`、`'> '`）
 * @returns CodeMirror `Command` 函数
 */
function insertLinePrefix(prefix: string): Command {
  return view => {
    const changes = view.state.changeByRange(range => {
      const line = view.state.doc.lineAt(range.head);
      return {
        changes: { from: line.from, insert: prefix },
        range: EditorSelection.cursor(range.head + prefix.length),
      };
    });
    view.dispatch(changes);
    view.focus();
    return true;
  };
}

/**
 * 创建块级包裹命令（代码块等）。
 *
 * 在选区前后各插入一行 `left` / `right`，选区内容被包裹在中间。
 *
 * @param left - 前置行文本（如 `'```'`）
 * @param right - 后置行文本（如 `'```'`）
 * @returns CodeMirror `Command` 函数
 *
 * @example
 * ```ts
 * wrapBlock('```', '```')
 * // 选中 "console.log(1)" →
 * // ```
 * // console.log(1)
 * // ```
 * ```
 */
function wrapBlock(left: string, right: string): Command {
  return view => {
    const changes = view.state.changeByRange(range => {
      const text = view.state.sliceDoc(range.from, range.to);
      const insert = `${left}\n${text}\n${right}`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(
          range.from + left.length + 1,
          range.from + left.length + 1 + text.length,
        ),
      };
    });
    view.dispatch(changes);
    view.focus();
    return true;
  };
}

/**
 * Markdown 快捷键绑定列表。
 *
 * **`Mod` 键说明**：CodeMirror 的 `Mod` 在 macOS 上映射为 `Cmd`，
 * 在 Windows/Linux 上映射为 `Ctrl`。保证跨平台一致性。
 *
 * **快捷键总览**：
 * | 快捷键 | 功能 | 对应命令 |
 * |--------|------|----------|
 * | `Mod+B` | 粗体 | `wrap('**')` |
 * | `Mod+I` | 斜体 | `wrap('*')` |
 * | `Mod+Shift+S` | 删除线 | `wrap('~~')` |
 * | `Mod+\`` | 行内代码 | `wrap('\`')` |
 * | `Mod+K` | 链接 | `wrap('[', '](url)')` |
 * | `Mod+0` | 取消标题 | `setHeading(0)` |
 * | `Mod+1`–`6` | H1–H6 | `setHeading(1..6)` |
 * | `Mod+Shift+7` | 有序列表 | `insertLinePrefix('1. ')` |
 * | `Mod+Shift+8` | 无序列表 | `insertLinePrefix('- ')` |
 * | `Mod+Shift+9` | 待办事项 | `insertLinePrefix('- [ ] ')` |
 * | `Mod+Shift+Q` | 引用 | `insertLinePrefix('> ')` |
 * | `Mod+Shift+C` | 代码块 | `wrapBlock('\`\`\`', '\`\`\`')` |
 * | `Mod+Z` | 撤销 | `undo` |
 * | `Mod+Shift+Z` / `Mod+Y` | 重做 | `redo` |
 */
export const markdownKeyBindings: readonly KeyBinding[] = [
  { key: 'Mod-b', preventDefault: true, run: wrap('**') },
  { key: 'Mod-i', preventDefault: true, run: wrap('*') },
  { key: 'Mod-Shift-s', preventDefault: true, run: wrap('~~') },
  { key: 'Mod-`', preventDefault: true, run: wrap('`') },
  { key: 'Mod-k', preventDefault: true, run: wrap('[', '](url)') },
  { key: 'Mod-0', preventDefault: true, run: setHeading(0) },
  { key: 'Mod-1', preventDefault: true, run: setHeading(1) },
  { key: 'Mod-2', preventDefault: true, run: setHeading(2) },
  { key: 'Mod-3', preventDefault: true, run: setHeading(3) },
  { key: 'Mod-4', preventDefault: true, run: setHeading(4) },
  { key: 'Mod-5', preventDefault: true, run: setHeading(5) },
  { key: 'Mod-6', preventDefault: true, run: setHeading(6) },
  { key: 'Mod-Shift-7', preventDefault: true, run: insertLinePrefix('1. ') },
  { key: 'Mod-Shift-8', preventDefault: true, run: insertLinePrefix('- ') },
  { key: 'Mod-Shift-9', preventDefault: true, run: insertLinePrefix('- [ ] ') },
  { key: 'Mod-Shift-q', preventDefault: true, run: insertLinePrefix('> ') },
  { key: 'Mod-Shift-c', preventDefault: true, run: wrapBlock('```', '```') },
  { key: 'Mod-z', preventDefault: true, run: undo },
  { key: 'Mod-Shift-z', preventDefault: true, run: redo },
  { key: 'Mod-y', preventDefault: true, run: redo },
];
