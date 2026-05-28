/**
 * @file markdown-it 渲染装配。
 *
 * 此模块负责把 markdown-it 与各插件、自定义规则装配为最终渲染函数。
 *
 * **阶段**：Phase 1 提供 GFM 基线（仅 markdown-it 内核），
 * 后续 Phase 2-6 增量注入任务列表、锚点、KaTeX、Shiki、Mermaid、Tauri 图片、DOMPurify。
 */

import MarkdownIt from 'markdown-it';

export interface RenderOptions {
  /** 当前笔记所在目录的绝对路径（document 类型需要，text 类型为空）。 */
  noteDir?: string;
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

export function renderMarkdown(content: string, _opts: RenderOptions = {}): string {
  if (!content) {
    return '';
  }
  return md.render(content);
}
