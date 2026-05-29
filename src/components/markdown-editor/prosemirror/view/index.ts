/**
 * @file Steno ProseMirror 视图层出口（Phase 7）
 *
 * 导出视图工厂与桥接，供 Phase 8 的 MarkdownEditor.vue 接入。
 */

export { createEditor, type CreateEditorOptions } from './create-editor';
export {
  createEditorBridge,
  type EditorBridge,
  type EditorBridgeOptions,
} from './editor-bridge';
