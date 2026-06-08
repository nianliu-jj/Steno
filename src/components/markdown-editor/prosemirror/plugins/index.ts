/**
 * @file Steno ProseMirror 插件装配入口
 *
 * Phase 6 —— 集中导出所有插件并提供装配函数 `createEditorPlugins(options)`。
 * 参考 PureMark `src/core/plugins/index.ts` 的导出风格，并加入 Steno 需要的
 * 装配函数（PureMark 的装配散落在 editor 构造处，这里集中提供）。
 *
 * 装配顺序（返回的 Plugin[] 顺序即优先级，靠前优先）：
 *  1. keymap（块级 Enter / 格式化 / Escape / 列表）—— 需先于 history 截获 Enter/Tab
 *  2. history（undo/redo 状态 + 快捷键）
 *  3. input-rules（Markdown 即时转换）
 *  4. syntax-fixer（appendTransaction 修复破损语法）
 *  5. paste（粘贴 Markdown/HTML/图片）
 *  6. instant-render（decorations + 控制插件，Typora 风格显隐）
 *  7. placeholder（空文档占位）
 *  8. dropCursor / gapCursor
 *  9. tableEditing（prosemirror-tables 表格编辑）
 *
 * 注意：表格 NodeView（prosemirror-tables 的 `TableView` 类）与其它 NodeView 的
 * 装配留到 Phase 7 的 create-editor，本文件只导出 `tableEditing` 插件并透传
 * `TableView` 供 Phase 7 注册为 `nodeViews.table`。
 */

import type { Plugin } from 'prosemirror-state';
import type { Schema } from 'prosemirror-model';
import { tableEditing, TableView } from 'prosemirror-tables';
import { stenoSchema } from '../schema';

import { createInstantRenderPlugin } from './instant-render';
import { createInputRulesPlugin } from './input-rules';
import { createSyntaxFixerPlugin } from './syntax-fixer';
import { createPastePlugin, type PasteImageHandler } from './paste';
import { createPlaceholderPlugin } from './placeholder';
import { createKeymapPlugins } from './keymap';
import { createHistoryPlugins } from './history';
import { createDropCursorPlugin } from './drop-cursor';
import { createGapCursorPlugin } from './gap-cursor';

// ============ 重新导出各插件工厂与工具 ============

export {
  createInstantRenderPlugin,
  instantRenderPluginKey,
  enableInstantRender,
  disableInstantRender,
  toggleInstantRender,
  getInstantRenderState,
  getActiveRegionsFromState,
  // 类型 InstantRenderState：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  type InstantRenderState,
  // 类型 InstantRenderConfig：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  type InstantRenderConfig
} from './instant-render';

export { createInputRulesPlugin } from './input-rules';
export { createSyntaxFixerPlugin, syntaxFixerPluginKey } from './syntax-fixer';
export { createPastePlugin, pastePluginKey, type PasteImageHandler, type PastePluginConfig } from './paste';
export { createPlaceholderPlugin, placeholderPluginKey } from './placeholder';
export {
  createKeymapPlugins,
  createBlockEnterKeymap,
  createListKeymap,
  createMarkKeymap,
  // 类型 KeymapConfig：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  type KeymapConfig
} from './keymap';
export { createHistoryPlugins, historyKeymap, history, undo, redo } from './history';
export { createDropCursorPlugin } from './drop-cursor';
export { createGapCursorPlugin } from './gap-cursor';
export * as commands from './commands';

// decorations 相关（instant-render 的核心依赖）
export {
  createDecorationPlugin,
  decorationPluginKey,
  findSyntaxMarkerRegions,
  findMathInlineRegions,
  findSemanticRegionsAt,
  getActiveSemanticRegions,
  computeDecorations,
  toggleSourceView,
  setSourceView,
  SYNTAX_CLASSES,
  // 类型 DecorationPluginState：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  type DecorationPluginState,
  // 类型 SyntaxMarkerRegion：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  type SyntaxMarkerRegion,
  // 类型 MathInlineRegion：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  type MathInlineRegion
} from '../decorations';

// 透传 prosemirror-tables 的表格 NodeView 类（Phase 7 注册为 nodeViews.table 时使用）
export { TableView };

// ============ 装配函数 ============

/** `createEditorPlugins` 选项。 */
export interface EditorPluginsOptions {
  /** 使用的 schema，默认 stenoSchema。 */
  schema?: Schema;
  /** 空文档占位文字。 */
  placeholder?: string;
  /** 图片粘贴存储回调（data URL → 短 URL），透传给 paste 插件。 */
  onPasteImage?: PasteImageHandler;
  /** 初始是否处于源码模式（透传给 decorations 插件）。默认 false。 */
  sourceView?: boolean;
  /** 是否启用列表快捷键。默认 true。 */
  listKeymap?: boolean;
}

/**
 * 装配编辑器插件，返回有序的 Plugin[]。
 *
 * @example
 * const plugins = createEditorPlugins({
 *   placeholder: '开始记录…',
 *   onPasteImage: async dataUrl => await storeImage(dataUrl),
 * });
 * const state = EditorState.create({ schema: stenoSchema, doc, plugins });
 */
export function createEditorPlugins(options: EditorPluginsOptions = {}): Plugin[] {
  // 局部常量 schema：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const schema = options.schema ?? stenoSchema;
  // 局部常量 placeholder：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const placeholder = options.placeholder ?? '';

  const plugins: Plugin[] = [];

  // 1. keymap（块级 Enter / 格式化 / Escape / 列表）
  plugins.push(...createKeymapPlugins(schema, { list: options.listKeymap ?? true }));

  // 2. history（undo/redo）
  plugins.push(...createHistoryPlugins());

  // 3. input-rules
  plugins.push(createInputRulesPlugin(schema));

  // 4. syntax-fixer
  plugins.push(createSyntaxFixerPlugin());

  // 5. paste
  plugins.push(createPastePlugin({ onPasteImage: options.onPasteImage }));

  // 6. instant-render（decorations + 控制插件）
  plugins.push(...createInstantRenderPlugin({ sourceView: options.sourceView ?? false }));

  // 7. placeholder
  plugins.push(createPlaceholderPlugin(placeholder));

  // 8. drop / gap cursor
  plugins.push(createDropCursorPlugin());
  plugins.push(createGapCursorPlugin());

  // 9. 表格编辑（NodeView 装配留到 Phase 7）
  plugins.push(tableEditing());

  return plugins;
}
