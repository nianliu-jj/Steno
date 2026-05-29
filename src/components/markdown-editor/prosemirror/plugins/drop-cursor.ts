/**
 * @file prosemirror-dropcursor 薄封装
 *
 * 拖拽插入时显示落点光标。
 */

import { dropCursor } from 'prosemirror-dropcursor';
import type { Plugin } from 'prosemirror-state';

/** 创建 drop cursor 插件。 */
export function createDropCursorPlugin(): Plugin {
  return dropCursor({ color: 'currentColor', width: 2 });
}
