/**
 * @file CodeMirror 6 扩展集装配
 *
 * 为 MarkdownEditor.vue 组装完整的 CM6 扩展栈，包括：
 * - Markdown 语言支持（`@codemirror/lang-markdown`）含 GFM 子集
 * - 历史栈与默认编辑快捷键（`@codemirror/commands`）
 * - 语法高亮、行包裹、选区绘制等视觉细节
 * - 自定义 Markdown 快捷键（`Ctrl+B` 粗体等，见 `./keymap.ts`）
 * - 原位 Live Render 装饰器（`./live-render.ts`，标题/粗体/斜体 WYSIWYG 渲染）
 * - placeholder 占位文字
 * - 文档变更 / 焦点变更回调
 */

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightSpecialChars,
  keymap,
  placeholder as placeholderExtension,
} from '@codemirror/view';

import { liveRenderPlugin } from './live-render';
import { markdownKeyBindings } from './keymap';

/** `createMarkdownExtensions` 的可选配置。 */
export interface CreateExtensionsOptions {
  /** Placeholder 文字（编辑器为空时显示）。 */
  placeholder?: string;
  /** 文档内容变更回调 — 用于驱动 `v-model` 双向绑定。 */
  onDocChange?: (next: string) => void;
  /** 焦点变更回调 — 用于组件的 `focus` / `blur` emit。 */
  onFocusChange?: (focused: boolean) => void;
}

/**
 * 创建 CodeMirror 6 的完整扩展数组。
 *
 * **扩展加载顺序说明**：
 * `keymap.of` 中 `markdownKeyBindings` 排在 `defaultKeymap` 前面 —
 * CM6 按数组顺序匹配快捷键，自定义绑定优先于默认绑定。
 * 例如 `Ctrl+B` 在默认 keymap 中可能触发别的行为，但我们希望它做 Markdown 粗体包裹。
 *
 * **为什么用 `EditorView.updateListener` 而不是 `EditorState.transactionFilter`**：
 * `updateListener` 在每次 state update 后触发，可以同时拿到 `docChanged` 和
 * `focusChanged`，适合驱动 Vue 的 `v-model` + `focus/blur` emit。
 *
 * @param options - 可选配置
 * @returns CM6 `Extension` 数组，可直接传入 `EditorState.create({ extensions })`
 *
 * @example
 * ```ts
 * const state = EditorState.create({
 *   doc: '# Hello',
 *   extensions: createMarkdownExtensions({
 *     placeholder: '开始写作…',
 *     onDocChange: (text) => emit('update:modelValue', text),
 *   }),
 * });
 * ```
 */
export function createMarkdownExtensions(options: CreateExtensionsOptions = {}): Extension[] {
  const extensions: Extension[] = [
    history(),                                                 // 撤销/重做栈
    drawSelection(),                                           // 光标与选区绘制
    highlightSpecialChars(),                                   // 不可见字符高亮
    indentOnInput(),                                           // 回车自动缩进
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }), // 代码块语法高亮
    markdown({}),                                              // Markdown 语言模式（GFM）
    keymap.of([...markdownKeyBindings, ...defaultKeymap, ...historyKeymap]), // 快捷键
    liveRenderPlugin,                                          // 原位 WYSIWYG 渲染
    EditorView.lineWrapping,                                   // 长行自动换行
  ];

  // placeholder 文字
  if (options.placeholder) {
    extensions.push(placeholderExtension(options.placeholder));
  }

  // 文档/焦点变更回调 — 驱动 Vue 的 v-model 和 focus/blur emit
  extensions.push(
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        options.onDocChange?.(update.state.doc.toString());
      }
      if (update.focusChanged) {
        options.onFocusChange?.(update.view.hasFocus);
      }
    }),
  );

  return extensions;
}
