/**
 * @file Steno 粘贴处理插件
 *
 * 移植自 PureMark `src/core/plugins/paste.ts`（346 行）。
 * 处理粘贴的 Markdown 文本、外部 HTML 与图片。
 *
 * Steno 适配说明（关键裁剪点）：
 * - PureMark 的图片粘贴走 Tauri `writeTempImage` + `imagePathPlugin`，并依赖
 *   localStorage 配置（local/remote）。Steno 改为走组件已有的存储约定：
 *   `onPasteImage(dataUrl) => Promise<shortUrl>`（由 MarkdownEditor.vue 注入，
 *   内部转调 `db.savePastedImage`），把 File 读成 data URL 再交给回调。未配置
 *   回调时直接用 data URL 兜底。
 * - PureMark 的源码模式（sourceView）图片走文本段落分支；Steno 暂不实现 source-view
 *   的块转换，但保留 `decorationPluginKey` 的 sourceView 守卫：源码模式下不解析
 *   Markdown，让默认处理器插入纯文本。
 * - 外部 HTML 粘贴：用 Steno 已有的 `sanitizeHtml`（DOMPurify）清洗，避免 XSS；
 *   清洗后若不含 Markdown 语法则作为纯文本插入，保持与 PureMark「外部 HTML 转纯文本」
 *   的稳健行为一致。
 * - 表格行粘贴（insertMarkdownTableRowAfterCurrent）依赖 commands；Steno 的表格
 *   编辑走 prosemirror-tables，这里只保留 Markdown 文本解析路径，不做表格行特判。
 * - `any` 替换为具体类型。
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import { Slice } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { parseMarkdown } from '../parser';
import { decorationPluginKey } from '../decorations';
import { sanitizeHtml } from '@/utils/markdown/sanitize';

/** 插件 Key */
export const pastePluginKey = new PluginKey('steno-paste');

/** 图片存储回调：接收 data URL，返回应写入 Markdown 的（短）URL。 */
export type PasteImageHandler = (dataUrl: string) => Promise<string>;

/** 粘贴插件配置 */
export interface PastePluginConfig {
  /** 图片粘贴存储回调（与组件 extensions 的 onPasteImage 同形）。 */
  onPasteImage?: PasteImageHandler;
}

/** 将 File 读为 data URL（与 extensions.readFileAsDataUrl 一致的实现）。 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('pasted image could not be read as a data URL'));
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('failed to read pasted image'));
    });
    reader.readAsDataURL(file);
  });
}

/**
 * 创建粘贴处理插件
 */
export function createPastePlugin(config: PastePluginConfig = {}): Plugin {
  return new Plugin({
    key: pastePluginKey,

    props: {
      handlePaste(view, event) {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        // 是否处于源码模式
        const decoState = decorationPluginKey.getState(view.state);
        const isSourceView = decoState?.sourceView ?? false;

        // 图片
        const files = clipboardData.files;
        if (files && files.length > 0) {
          const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
          if (imageFiles.length > 0) {
            void handleImagePaste(view, imageFiles, config);
            return true;
          }
        }

        const text = clipboardData.getData('text/plain');
        if (!text) return false;

        // 源码模式：所有文本作为纯文本插入，不解析 Markdown
        if (isSourceView) return false;

        // 不含 Markdown 语法
        if (!containsMarkdownSyntax(text)) {
          // 外部 HTML（非编辑器内部复制）→ 清洗后作为纯文本插入，避免 ProseMirror 解析 HTML marks
          const html = clipboardData.getData('text/html');
          if (html && !html.includes('data-pm-slice')) {
            // sanitizeHtml 仅用于 XSS 清洗校验（剥离 script 等），最终仍按纯文本插入
            sanitizeHtml(html);
            view.dispatch(view.state.tr.insertText(text));
            return true;
          }
          return false;
        }

        // 编辑器内部复制（ProseMirror HTML 含 data-pm-slice）→ 交给默认处理
        const html = clipboardData.getData('text/html');
        if (html && html.includes('data-pm-slice')) return false;

        // 解析 Markdown
        const { doc } = parseMarkdown(text);
        const content = doc.content;
        if (content.size === 0) return false;

        // 延迟到下一帧插入，确保 ProseMirror 完成粘贴事件处理后再更新视图，
        // 让装饰系统能正确重算所有语法标记的显隐状态。
        requestAnimationFrame(() => {
          const pasteSlice = new Slice(content, 1, 1);
          view.dispatch(view.state.tr.replaceSelection(pasteSlice));
        });

        return true;
      },
    },
  });
}

/**
 * 处理图片粘贴：把每个图片读成 data URL，经 onPasteImage 存储为短 URL 后插入 image 节点。
 */
async function handleImagePaste(
  view: EditorView,
  files: File[],
  config: PastePluginConfig,
): Promise<void> {
  const schema = view.state.schema;
  const imageType = schema.nodes.image;
  if (!imageType) return;

  for (const file of files) {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      let src = dataUrl;
      if (config.onPasteImage) {
        try {
          src = await config.onPasteImage(dataUrl);
        } catch (error) {
          console.error('[steno-prosemirror] failed to store pasted image:', error);
          src = dataUrl;
        }
      }

      const imageNode = imageType.createAndFill({ src, alt: file.name, title: '' });
      if (imageNode) {
        const { $from } = view.state.selection;
        view.dispatch(view.state.tr.insert($from.pos, imageNode));
      }
    } catch (error) {
      console.error('[steno-prosemirror] failed to process pasted image:', error);
    }
  }
}

/**
 * 检查文本是否包含 Markdown 语法
 */
function containsMarkdownSyntax(text: string): boolean {
  const patterns = [
    /^#{1,6}\s/m, // 标题
    /\*\*[^*]+\*\*/, // 粗体
    /\*[^*]+\*/, // 斜体
    /~~[^~]+~~/, // 删除线
    /`[^`]+`/, // 行内代码
    /^```/m, // 代码块
    /\[[^\]]+\]\([^)]*\)/, // 链接（允许空 URL）
    /!\[[^\]]*\]\([^)]+\)/, // 图片
    /^>\s?/m, // 引用
    /^[-*+]\s/m, // 无序列表
    /^\d+\.\s/m, // 有序列表
    /^[-*_]{3,}\s*$/m, // 分隔线
    /==[^=]+==/, // 高亮
    /^\s*\$\$/m, // 数学块（支持缩进）
    /\$[^$]+\$/, // 行内数学
    /<su[bp]>.+?<\/su[bp]>/, // sub/sup
    /<[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?>.*?<\/[a-zA-Z][a-zA-Z0-9]*>/, // 行内 HTML
    /^- \[[ xX]\]/m, // 任务列表
    /^\|.+\|$/m, // 表格
  ];

  return patterns.some(pattern => pattern.test(text));
}
