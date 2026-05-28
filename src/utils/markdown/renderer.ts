/**
 * @file markdown-it 渲染装配。
 *
 * 此模块负责把 markdown-it 与各插件、自定义规则装配为最终渲染函数。
 *
 * **当前阶段**：Phase 2 — 接入插件、覆写 fence/code_inline/image 规则。
 * 代码块只做转义降级，Shiki 高亮在 Phase 3 替换；
 * Mermaid 仅输出占位，实际渲染由 `mermaid.ts` 在 onMounted 中接管；
 * 出口 sanitize 在 Phase 6 接入。
 */

import katex from '@vscode/markdown-it-katex';
import MarkdownIt from 'markdown-it';
import mark from 'markdown-it-mark';
import taskLists from 'markdown-it-task-lists';

import { resolveImageSrc } from './images';
import { sanitizeHtml } from './sanitize';
import { highlightCode } from './shiki';

export interface RenderOptions {
  /** 当前笔记所在目录的绝对路径（document 类型可用，text 类型为空）。 */
  noteDir?: string;
}

/**
 * 把 mermaid 源码进行 base64 编码后塞进 `data-source`，避免 HTML 注入与多行换行问题。
 */
function encodeMermaidSource(source: string): string {
  // btoa 仅支持 latin-1，先经 encodeURIComponent → 转字节流 → btoa
  try {
    const utf8 = new TextEncoder().encode(source);
    let binary = '';
    for (const byte of utf8) binary += String.fromCharCode(byte);
    return typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(binary, 'binary').toString('base64');
  } catch {
    return '';
  }
}

/** 转义 HTML 危险字符，用于代码块降级路径。 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: false,
    typographer: false,
  });

  md.use(taskLists, { enabled: false, label: true });
  md.use(mark);
  // 启用 $...$ 与 $$...$$；不启用 enableFencedBlocks 以免拦截其它语言的围栏代码块
  md.use(katex, { throwOnError: false, enableBareBlocks: true });

  /**
   * 覆写围栏代码块：
   * - `mermaid` → 输出占位，由前端 onMounted 钩子渲染
   * - 其它语言 → 委托 Shiki（未就绪时返回 escaped 文本）
   */
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = (token.info || '').trim();
    const lang = info.split(/\s+/)[0] || '';
    const source = token.content ?? '';

    if (lang === 'mermaid') {
      const encoded = encodeMermaidSource(source);
      return `<pre class="mermaid-placeholder" data-source="${encoded}"></pre>\n`;
    }

    const highlighted = highlightCode(source, lang);
    if (highlighted) {
      return highlighted;
    }

    // 降级：输出基础 `<pre><code>` + 转义；保留 lang 属性方便样式定位
    const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
    return `<pre class="shiki-block shiki-fallback"${langAttr}><code>${escapeHtml(source)}</code></pre>\n`;
  };

  /** 行内代码：加 class 方便样式定位。 */
  md.renderer.rules.code_inline = (tokens, idx) => {
    const content = escapeHtml(tokens[idx].content);
    return `<code class="md-inline-code">${content}</code>`;
  };

  /** 图片：通过 env.noteDir 把相对路径拼接为 Tauri asset URL。 */
  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const srcAttr = token.attrGet('src');
    if (srcAttr) {
      const noteDir = (env as { noteDir?: string } | undefined)?.noteDir;
      const resolved = resolveImageSrc(srcAttr, noteDir);
      if (resolved !== srcAttr) token.attrSet('src', resolved);
    }
    if (defaultImage) {
      return defaultImage(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options);
  };

  return md;
}

const md = createMarkdownIt();

export function renderMarkdown(content: string, opts: RenderOptions = {}): string {
  if (!content) {
    return '';
  }
  const raw = md.render(content, { noteDir: opts.noteDir });
  return sanitizeHtml(raw);
}
