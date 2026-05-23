// Markdown 编辑器的命令式快捷键集合。
//
// 命名约定：
//   - wrap:  把选区包裹在 left/right 之间（粗体、斜体、行内代码、删除线、链接）
//   - setHeading: 用 `#`...`######` 替换/移除当前行的标题前缀
//   - insertPrefix: 在当前行行首插入 prefix（列表、待办、引用、有序列表）
//   - wrapBlock: 在选区前后各插入一行（代码块、引用块）
//
// 所有命令都返回 boolean——按 prosemirror-keymap 风格表示是否消费按键，便于将来
// 链入 keymap.of([{key, run}])。
import { EditorSelection } from '@codemirror/state';
import type { Command, KeyBinding } from '@codemirror/view';

import { redo, undo } from '@codemirror/commands';

function wrap(left: string, right: string = left): Command {
  return view => {
    const changes = view.state.changeByRange(range => {
      const text = view.state.sliceDoc(range.from, range.to);
      const insert = `${left}${text}${right}`;
      return {
        changes: { from: range.from, to: range.to, insert },
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

function setHeading(level: number): Command {
  return view => {
    const changes = view.state.changeByRange(range => {
      const line = view.state.doc.lineAt(range.head);
      const stripped = line.text.replace(/^#{1,6}\s+/, '');
      const next = level === 0 ? stripped : `${'#'.repeat(level)} ${stripped}`;
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
