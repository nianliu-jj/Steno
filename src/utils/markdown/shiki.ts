/**
 * @file Shiki 代码高亮单例与同步高亮 API。
 *
 * Phase 3 实施：lazy `createHighlighter()` + 双主题（github-light / github-dark）+ 同步 `highlightCode`。
 *
 * 当前为骨架：返回空字符串作为「未就绪」信号，让调用方走降级路径输出转义 `<pre><code>`。
 */

export function highlightCode(_code: string, _lang: string): string {
  return '';
}
