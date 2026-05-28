/**
 * @file DOMPurify 出口 XSS 过滤。
 *
 * 设计要点：
 * - 默认白名单已涵盖大多数 HTML/SVG/MathML 标签，包括 KaTeX 用到的 `<math>` 系列与 `<svg>`
 * - 显式 ALLOWED_ATTR 加入 `class`、`style`、`id` 与所有 `data-*`，让 shiki 双主题
 *   样式属性、mermaid 占位 `data-source`、复制按钮 `data-code`、容器 class 都能保留
 * - 禁止 `<script>`、`<iframe>`、`<object>`、`<embed>`、`<form>` 与所有 `on*` 事件属性
 * - 渲染管线出口（`renderer.renderMarkdown` 末尾）调用一次
 */

import DOMPurify, { type Config as PurifyConfig } from 'dompurify';

/** 在 jsdom 与 Tauri WebView 中都可用。 */
const PURIFY_CONFIG: PurifyConfig = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  ADD_TAGS: ['mark'],
  // 允许 shiki/mermaid 输出所需的 style/class/data-* 属性
  ADD_ATTR: ['style', 'class', 'data-source', 'data-code', 'data-lang', 'data-heading-id'],
  // 禁止任何脚本/iframe/对象嵌入
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
  // 禁止所有内联事件
  FORBID_ATTR: [
    'onerror',
    'onload',
    'onclick',
    'onmouseover',
    'onmouseout',
    'onfocus',
    'onblur',
    'onsubmit',
    'onchange',
    'oninput',
  ],
};

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, PURIFY_CONFIG) as unknown as string;
}
