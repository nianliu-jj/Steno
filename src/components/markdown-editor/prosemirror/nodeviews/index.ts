/**
 * @file NodeView 集合出口
 *
 * Phase 4 已落地：image / task-list-item / html-block / math-block / mermaid-block。
 *
 * table NodeView：直接使用 `prosemirror-tables` 内置的 `tableNodeViews()`，无需自写。
 * 在 Phase 7 `create-editor.ts` 装配时通过 `tableEditing()` 插件启用。
 *
 * code-block NodeView：Phase 5 已落地，内嵌 CodeMirror 6（见 ./code-block）。
 *
 * 参考：D:\Markdown项目\PureMark\src\core\nodeviews\*
 */

export { createImageNodeView } from './image';
export { createTaskItemNodeView } from './task-list-item';
export { createHtmlBlockNodeView } from './html-block';
export { createMathBlockNodeView } from './math-block';
export { createMermaidBlockNodeView } from './mermaid-block';
export { createCodeBlockNodeView } from './code-block';
