/**
 * @file 笔记列表卡片 Markdown 摘要渲染。
 *
 * 列表卡片需要展示"渲染后的样子"，但不能让大图片、完整代码块或原始
 * Markdown 语法把卡片撑开；因此这里复用 ProseMirror parser/schema 得到
 * 基础 HTML，再把不适合卡片的块级内容压缩为轻量摘要。
 */

import { DOMSerializer } from 'prosemirror-model';

import { parseMarkdown } from '@/components/markdown-editor/prosemirror/parser';
import { stenoSchema } from '@/components/markdown-editor/prosemirror/schema';
import { sanitizeHtml } from '@/utils/markdown/sanitize';

const MAX_CODE_PREVIEW_CHARS = 96;

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

function replaceElement(target: Element, replacement: HTMLElement): void {
  target.replaceWith(replacement);
}

function normalizePreviewDom(container: HTMLElement): void {
  for (const marker of Array.from(container.querySelectorAll('.steno-syntax'))) {
    marker.remove();
  }

  for (const pre of Array.from(container.querySelectorAll('pre'))) {
    const code = document.createElement('code');
    code.className = 'note-preview-code';
    code.textContent = truncateText(pre.textContent ?? '', MAX_CODE_PREVIEW_CHARS);
    replaceElement(pre, code);
  }

  for (const image of Array.from(container.querySelectorAll('img'))) {
    const src = image.getAttribute('src') ?? '';
    const alt = image.getAttribute('alt') ?? '';
    const placeholder = document.createElement('span');
    placeholder.className = 'note-preview-image';
    placeholder.textContent = src || alt || '图片';
    replaceElement(image, placeholder);
  }

  for (const htmlBlock of Array.from(container.querySelectorAll('.html-block'))) {
    const span = document.createElement('span');
    span.className = 'note-preview-html';
    span.textContent = stripHtmlNoise(htmlBlock.textContent ?? '');
    replaceElement(htmlBlock, span);
  }

  for (const textNode of Array.from(container.querySelectorAll('p, h1, h2, h3, h4, h5, h6'))) {
    const children = Array.from(textNode.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) {
        child.textContent = child.textContent?.replace(/\s+/g, ' ') ?? '';
      }
    }
    const first = children.find(child => (child.textContent ?? '').length > 0);
    const last = [...children].reverse().find(child => (child.textContent ?? '').length > 0);
    if (first?.nodeType === Node.TEXT_NODE) {
      first.textContent = first.textContent?.trimStart() ?? '';
    }
    if (last?.nodeType === Node.TEXT_NODE) {
      last.textContent = last.textContent?.trimEnd() ?? '';
    }
  }
}

export function renderNotePreviewHtml(content: string): string {
  if (!content.trim()) return '';

  try {
    const { doc } = parseMarkdown(content);
    const serializer = DOMSerializer.fromSchema(stenoSchema);
    const fragment = serializer.serializeFragment(doc.content);
    const container = document.createElement('div');
    container.appendChild(fragment);
    normalizePreviewDom(container);
    return sanitizeHtml(container.innerHTML);
  } catch (error) {
    console.error('[note-preview] render failed:', error);
    return sanitizeHtml(truncateText(content, 160));
  }
}
