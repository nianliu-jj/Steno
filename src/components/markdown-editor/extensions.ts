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
import { Facet, Prec, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightSpecialChars,
  keymap,
  placeholder as placeholderExtension,
} from '@codemirror/view';

import { liveRenderPlugin } from './live-render';
import { markdownKeyBindings } from './keymap';

const IMAGE_MIME_PREFIX = 'image/';
const pasteImageStorageFacet = Facet.define<
  ((dataUrl: string) => Promise<string>) | undefined,
  ((dataUrl: string) => Promise<string>) | undefined
>({
  combine: values => values.find(Boolean),
});

/** `createMarkdownExtensions` 的可选配置。 */
export interface CreateExtensionsOptions {
  /** Placeholder 文字（编辑器为空时显示）。 */
  placeholder?: string;
  /** 文档内容变更回调 — 用于驱动 `v-model` 双向绑定。 */
  onDocChange?: (next: string) => void;
  /** 焦点变更回调 — 用于组件的 `focus` / `blur` emit。 */
  onFocusChange?: (focused: boolean) => void;
  /** 图片粘贴存储回调；返回 Markdown 中应写入的短 URL。 */
  onPasteImage?: (dataUrl: string) => Promise<string>;
}

function isImageFile(file: File): boolean {
  return file.type.toLowerCase().startsWith(IMAGE_MIME_PREFIX);
}

function clipboardFileKey(file: File): string {
  return `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
}

export function getClipboardImageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];

  const files: File[] = [];
  const seen = new Set<string>();
  const push = (file: File | null) => {
    if (!file || !isImageFile(file)) return;
    const key = clipboardFileKey(file);
    if (seen.has(key)) return;
    seen.add(key);
    files.push(file);
  };

  Array.from(data.files ?? []).forEach(push);
  Array.from(data.items ?? []).forEach(item => {
    if (item.kind === 'file' && item.type.toLowerCase().startsWith(IMAGE_MIME_PREFIX)) {
      push(item.getAsFile());
    }
  });

  return files;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('pasted image could not be read as a data URL'));
      }
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('failed to read pasted image'));
    });
    reader.readAsDataURL(file);
  });
}

export function buildImagePasteMarkdown(dataUrls: string[]): string {
  return dataUrls.map(dataUrl => `![pasted image](${dataUrl})`).join('\n\n');
}

export async function buildStoredImagePasteMarkdown(
  files: File[],
  storeImage?: (dataUrl: string) => Promise<string>,
): Promise<string> {
  const dataUrls = await Promise.all(files.map(readFileAsDataUrl));
  const urls = storeImage
    ? await Promise.all(dataUrls.map(async dataUrl => {
        try {
          return await storeImage(dataUrl);
        } catch (error) {
          console.error('[markdown-editor] failed to store pasted image:', error);
          return dataUrl;
        }
      }))
    : dataUrls;
  return buildImagePasteMarkdown(urls);
}

function insertionWithBlockSpacing(view: EditorView, imageMarkdown: string): string {
  const range = view.state.selection.main;
  const before = view.state.doc.sliceString(Math.max(0, range.from - 2), range.from);
  const after = view.state.doc.sliceString(range.to, Math.min(view.state.doc.length, range.to + 2));
  const prefix = range.from === 0 || before.endsWith('\n\n')
    ? ''
    : before.endsWith('\n') ? '\n' : '\n\n';
  const suffix = range.to === view.state.doc.length || after.startsWith('\n\n')
    ? ''
    : after.startsWith('\n') ? '\n' : '\n\n';

  return `${prefix}${imageMarkdown}${suffix}`;
}

function imagePasteExtension(): Extension {
  return Prec.highest(
    EditorView.domEventHandlers({
      paste(event, view) {
        const files = getClipboardImageFiles(event.clipboardData);
        if (files.length === 0) return false;

        event.preventDefault();
        const storeImage = view.state.facet(pasteImageStorageFacet);
        void buildStoredImagePasteMarkdown(files, storeImage)
          .then(pastedMarkdown => {
            const imageMarkdown = insertionWithBlockSpacing(view, pastedMarkdown);
            view.dispatch(view.state.replaceSelection(imageMarkdown), {
              userEvent: 'input.paste',
            });
          })
          .catch(error => {
            console.error('[markdown-editor] failed to paste image:', error);
          });

        return true;
      },
    }),
  );
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
    imagePasteExtension(),                                     // 粘贴图片为 Markdown 图片语法
    liveRenderPlugin,                                          // 原位 WYSIWYG 渲染
    EditorView.lineWrapping,                                   // 长行自动换行
  ];

  if (options.onPasteImage) {
    extensions.push(pasteImageStorageFacet.of(options.onPasteImage));
  }

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
