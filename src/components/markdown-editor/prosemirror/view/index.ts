/**
 * @file Steno ProseMirror 视图层出口（Phase 7）
 *
 * 导出视图工厂与桥接，供 Phase 8 的 MarkdownEditor.vue 接入。
 */

export { createEditor, type CreateEditorOptions } from './create-editor';
export {
  createEditorBridge,
  // 类型 EditorBridge：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  type EditorBridge,
  // 类型 EditorBridgeOptions：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  type EditorBridgeOptions
} from './editor-bridge';
