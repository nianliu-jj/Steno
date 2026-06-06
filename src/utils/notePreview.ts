/**
 * @file 笔记列表卡片 Markdown 摘要渲染。
 *
 * 列表卡片需要展示"渲染后的样子"，但不能让大图片、完整代码块或原始
 * Markdown 语法把卡片撑开；因此这里复用 ProseMirror parser/schema：
 *
 * - 逐个遍历块级节点，把每个"逻辑行"（段落、标题、列表项、引用段落…）
 *   折叠成一行行内 HTML，并用 `<br>` 连接，从而在卡片里体现原文换行
 *   （卡片容器用 `-webkit-line-clamp` 限高，依赖行内内容 + `<br>` 计行）。
 * - 表格、图片、公式、图表等"非文本块"无法在一行里有意义地展示，统一压缩
 *   成中括号占位（`[表格]`、`[图片]` 等）。
 * - 代码块压缩成单行截断预览；HTML 块剥离标签后保留可读文本。
 */

import { DOMSerializer, type Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';

import { parseMarkdown } from '@/components/markdown-editor/prosemirror/parser';
import { stenoSchema } from '@/components/markdown-editor/prosemirror/schema';
import { sanitizeHtml } from '@/utils/markdown/sanitize';

const MAX_CODE_PREVIEW_CHARS = 96;

/** 非文本块级节点 → 中括号占位描述。 */
const BLOCK_PLACEHOLDERS: Record<string, string> = {
  table: '表格',
  image: '图片',
  math_block: '公式',
  mermaid_block: '图表',
};

function compactText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncateText(text: string, maxLength: number): string {
  const compact = compactText(text);
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
}

function stripHtmlNoise(text: string): string {
  return compactText(
    text
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/<[^>]+>/g, ' '),
  );
}

/** 把纯文本转义为可安全注入的 HTML 文本。 */
function escapeHtml(text: string): string {
  const holder = document.createElement('div');
  holder.textContent = text;
  return holder.innerHTML;
}

let cachedSerializer: DOMSerializer | null = null;
function getSerializer(): DOMSerializer {
  if (!cachedSerializer) cachedSerializer = DOMSerializer.fromSchema(stenoSchema);
  return cachedSerializer;
}

/**
 * 序列化一个文本块（段落/标题）的行内内容为 HTML，并剥离 Typora 风格的
 * `.steno-syntax` 语法标记，避免 `**`、`` ` ``、`#` 等原始符号出现在摘要里。
 */
function serializeInline(node: ProseMirrorNode): string {
  const fragment = getSerializer().serializeFragment(node.content);
  const holder = document.createElement('div');
  holder.appendChild(fragment);
  for (const marker of Array.from(holder.querySelectorAll('.steno-syntax'))) {
    marker.remove();
  }
  return holder.innerHTML.trim();
}

/** 中括号占位元素（带类名以便统一弱化样式）。 */
function placeholder(label: string): string {
  return `<span class="note-preview-block">[${label}]</span>`;
}

/**
 * 递归遍历块级节点，把每个"逻辑行"折叠进 `lines`：
 * - 段落/标题 → 行内 HTML（保留 strong/em/code/链接/下划线等 mark）
 * - 引用/列表/容器 → 递归，使每个子块单独成行
 * - 表格/图片/公式/图表 → 中括号占位
 * - 代码块 → 单行截断预览；HTML 块 → 剥离标签后的可读文本
 */
function collectPreviewLines(fragment: Fragment, lines: string[]): void {
  fragment.forEach((node) => {
    const name = node.type.name;

    const placeholderLabel = BLOCK_PLACEHOLDERS[name];
    if (placeholderLabel) {
      lines.push(placeholder(placeholderLabel));
      return;
    }

    switch (name) {
      case 'heading': {
        const html = serializeInline(node);
        if (html) lines.push(`<h${node.attrs.level}>${html}</h${node.attrs.level}>`);
        break;
      }
      case 'paragraph': {
        const html = serializeInline(node);
        if (html) lines.push(html);
        break;
      }
      case 'code_block': {
        const code = truncateText(node.textContent, MAX_CODE_PREVIEW_CHARS);
        if (code) lines.push(`<code class="note-preview-code">${escapeHtml(code)}</code>`);
        break;
      }
      case 'html_block': {
        const text = stripHtmlNoise(node.textContent);
        if (text) lines.push(escapeHtml(text));
        break;
      }
      case 'horizontal_rule':
        // 分隔线对摘要无信息量，跳过
        break;
      case 'blockquote':
      case 'container':
      case 'bullet_list':
      case 'ordered_list':
      case 'task_list':
      case 'list_item':
      case 'task_item':
        collectPreviewLines(node.content, lines);
        break;
      default: {
        // 兜底：未知文本块按行内渲染，其余容器继续递归
        if (node.isTextblock) {
          const html = serializeInline(node);
          if (html) lines.push(html);
        } else if (node.childCount > 0) {
          collectPreviewLines(node.content, lines);
        }
      }
    }
  });
}

export function renderNotePreviewHtml(content: string): string {
  if (!content.trim()) return '';

  try {
    const { doc } = parseMarkdown(content);
    const lines: string[] = [];
    collectPreviewLines(doc.content, lines);
    return sanitizeHtml(lines.join('<br>'));
  } catch (error) {
    console.error('[note-preview] render failed:', error);
    return sanitizeHtml(truncateText(content, 160));
  }
}
