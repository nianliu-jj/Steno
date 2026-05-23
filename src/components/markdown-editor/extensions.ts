// 拼装 CodeMirror 6 扩展集，给 MarkdownEditor.vue 使用。
//
// 包含：
//   - markdown 语言（@codemirror/lang-markdown）+ GFM 子集
//   - 历史栈、默认编辑命令（@codemirror/commands）
//   - 行包裹、空白选区高亮、行号关闭等视觉细节
//   - Markdown 命令式快捷键
//   - live-render 装饰器
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

export interface CreateExtensionsOptions {
  placeholder?: string;
  onDocChange?: (next: string) => void;
  onFocusChange?: (focused: boolean) => void;
}

export function createMarkdownExtensions(options: CreateExtensionsOptions = {}): Extension[] {
  const extensions: Extension[] = [
    history(),
    drawSelection(),
    highlightSpecialChars(),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    markdown({}),
    keymap.of([...markdownKeyBindings, ...defaultKeymap, ...historyKeymap]),
    liveRenderPlugin,
    EditorView.lineWrapping,
  ];

  if (options.placeholder) {
    extensions.push(placeholderExtension(options.placeholder));
  }

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
