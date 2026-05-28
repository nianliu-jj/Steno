/**
 * @file Shiki 代码高亮单例与同步高亮 API。
 *
 * 设计要点：
 * - Shiki 创建是 async，但 markdown-it 渲染是同步；故采用 lazy warmup + 同步查询。
 * - `warmupShiki()` 在应用启动入口被调用，后台异步加载 highlighter；未就绪期间
 *   `highlightCode` 返回空字符串，由 renderer 走 fallback `<pre><code>` 转义降级。
 * - 双主题输出（github-light / github-dark）+ `defaultColor: false`，让一次 HTML
 *   产物同时包含两套 token 着色，主题切换通过 CSS class 切换零成本完成。
 * - 代码块外层包装 `.shiki-block` 容器 + 头部（语言标签 + 复制按钮）；
 *   行号通过 CSS counter 在样式表中实现，HTML 内不重复写编号。
 */

import { createHighlighter, type Highlighter } from 'shiki';

const LANGS = [
  'markdown',
  'javascript',
  'typescript',
  'tsx',
  'jsx',
  'vue',
  'rust',
  'python',
  'go',
  'shell',
  'bash',
  'json',
  'yaml',
  'toml',
  'html',
  'css',
  'scss',
  'sql',
  'java',
  'kotlin',
  'swift',
  'c',
  'cpp',
  'csharp',
  'php',
  'ruby',
  'xml',
  'diff',
] as const;

const THEMES = ['github-light', 'github-dark'] as const;

let highlighter: Highlighter | null = null;
let warmupPromise: Promise<void> | null = null;

/**
 * 应用启动入口调用：异步加载 Shiki highlighter。
 * 多次调用安全（返回同一个 promise）。
 */
export function warmupShiki(): Promise<void> {
  if (warmupPromise) {
    return warmupPromise;
  }
  warmupPromise = createHighlighter({
    themes: [...THEMES],
    langs: [...LANGS],
  })
    .then((h) => {
      highlighter = h;
    })
    .catch((err) => {
      console.error('[shiki] warmup failed:', err);
      // 失败后允许下次重试
      warmupPromise = null;
    });
  return warmupPromise;
}

/**
 * Shiki 是否已就绪。供调用方决定是否需要重渲染。
 */
export function isShikiReady(): boolean {
  return highlighter !== null;
}

/** 把原始代码用 base64 编码塞进 data-code（避免 HTML 注入与转义问题）。 */
function encodeCode(code: string): string {
  try {
    const utf8 = new TextEncoder().encode(code);
    let binary = '';
    for (const byte of utf8) binary += String.fromCharCode(byte);
    return typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(binary, 'binary').toString('base64');
  } catch {
    return '';
  }
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * 同步高亮一段代码。
 *
 * @param code 代码原文
 * @param lang 语言标识（来自 Markdown 围栏的 info string）
 * @returns 已渲染的 HTML（含 `.shiki-block` 容器与头部）；未就绪 / 不支持语言时返回空字符串，由调用方走降级路径
 */
export function highlightCode(code: string, lang: string): string {
  if (!highlighter) {
    // 触发后台 warmup（即使首次未生效，后续调用就有了）
    void warmupShiki();
    return '';
  }

  if (!lang) {
    return '';
  }

  const loaded = highlighter.getLoadedLanguages();
  if (!loaded.includes(lang)) {
    return '';
  }

  let inner: string;
  try {
    inner = highlighter.codeToHtml(code, {
      lang,
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    });
  } catch (err) {
    console.error('[shiki] highlight failed:', err);
    return '';
  }

  const encoded = encodeCode(code);
  const safeLang = escapeAttr(lang);
  return `<div class="shiki-block" data-lang="${safeLang}">`
    + `<div class="shiki-head">`
    + `<span class="shiki-lang">${safeLang}</span>`
    + `<button class="shiki-copy" type="button" data-code="${encoded}" aria-label="copy code">复制</button>`
    + `</div>`
    + inner
    + `</div>\n`;
}
