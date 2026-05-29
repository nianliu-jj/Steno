/**
 * @file prosemirror-gapcursor 薄封装
 *
 * 允许光标停在块级节点之间的「间隙」（如两个 image/code_block 之间），
 * 便于在没有可编辑文本处定位光标。需配合 `prosemirror-gapcursor/style/gapcursor.css`
 * （样式由编辑器装配处引入）。
 */

import { gapCursor } from 'prosemirror-gapcursor';
import type { Plugin } from 'prosemirror-state';

/** 创建 gap cursor 插件。 */
export function createGapCursorPlugin(): Plugin {
  return gapCursor();
}
