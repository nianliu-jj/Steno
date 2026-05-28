/**
 * @file DOMPurify 白名单与出口过滤。
 *
 * Phase 6 实施：保留 KaTeX、Shiki、Mermaid 输出所需标签与属性，
 * 移除 `<script>`、`<iframe>` 与所有 `on*` 事件属性。
 */

export function sanitizeHtml(html: string): string {
  // Phase 6 实施
  return html;
}
