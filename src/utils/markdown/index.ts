/**
 * @file Markdown 渲染管线对外聚合入口。
 *
 * 子模块职责：
 * - `renderer` — 装配 markdown-it 与所有插件，提供 `renderMarkdown`
 * - `shiki`    — Shiki 单例与双主题代码高亮
 * - `mermaid`  — Mermaid 占位识别、主题派生与异步渲染
 * - `images`   — Tauri 相对路径图片转换
 * - `sanitize` — DOMPurify 白名单与出口过滤
 *
 * 详细决策见 openspec/changes/redesign-markdown-rendering-pipeline/design.md。
 */

export { renderMarkdown } from './renderer';
export { renderMermaidPlaceholders } from './mermaid';
export { sanitizeHtml } from './sanitize';
export { resolveImageSrc } from './images';
