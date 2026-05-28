/**
 * @file Steno ProseMirror Schema 装配入口
 *
 * 由 PureMark (`D:\Markdown项目\PureMark\src\core\schema\index.ts`) 移植；
 * 节点定义见 `./nodes.ts`，标记定义见 `./marks.ts`，内联 HTML 白名单与属性
 * 清洗见 `./html-inline.ts`。
 *
 * Steno 相对 PureMark 的关键差异：
 * - 每个块级节点新增 `startLine` attr（用于 `scrollToLine`）
 * - 新增 `mermaid_block` 节点（PureMark 通过 source-view 处理，Steno 用专属 NodeView）
 * - `code_inline` mark 的 CSS class 从 `puremark-code-inline` 改为 `steno-code-inline`
 * - `syntax_marker` mark 的 CSS class 从 `puremark-syntax` 改为 `steno-syntax`
 */

import { Schema } from 'prosemirror-model';
import { nodes } from './nodes';
import { marks } from './marks';

export { SAFE_INLINE_TAGS, parseHtmlAttrs } from './html-inline';
export { nodes } from './nodes';
export { marks } from './marks';

/** Steno 全平台 Markdown WYSIWYG 内核所用的 ProseMirror schema。 */
export const stenoSchema = new Schema({ nodes, marks });

export type StenoSchema = typeof stenoSchema;
export type StenoNodeName = keyof typeof nodes;
export type StenoMarkName = keyof typeof marks;
