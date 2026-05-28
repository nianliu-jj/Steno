## Why

当前 Steno 的笔记预览渲染极简：仅靠 `marked@16` 输出 HTML 后通过 `v-html` 注入，缺少代码高亮、数学公式、Mermaid 图表与 XSS 过滤；样式硬编码、未对接主题变量，暗色模式下可读性差。这与参考项目 `D:\Markdown项目\PureMark` 所展示的现代 Markdown 渲染效果（彩色 inline code、左边框引用、带语言标识/复制按钮/行号的高亮代码块、KaTeX 公式、Mermaid 图等）差距明显，无法满足"专业速记/笔记应用"的基本预期，亦阻碍后续高级笔记功能落地。

## What Changes

- **BREAKING**：移除 `marked@16` 依赖（包含 `useMarkdown` 与 `MarkdownReadSurface` 的 marked 调用），改为基于 `markdown-it@14` 的渲染管线。
- 新增依赖：`shiki`（代码高亮，双主题 github-light / github-dark）、`@vscode/markdown-it-katex` + `katex`（数学公式）、`mermaid@11`（图表）、`markdown-it-task-lists`（任务列表）、`markdown-it-anchor`（标题锚点）、`dompurify`（XSS 防护）。
- 拆分渲染逻辑：新增 `src/utils/markdown/` 子模块（`renderer.ts` 装配 markdown-it、`shiki.ts` 双主题代码高亮、`mermaid.ts` 主题派生、`images.ts` Tauri 路径处理、`sanitize.ts` DOMPurify 白名单）。
- 重写 `src/composables/useMarkdown.ts`：保留对外 `renderHtml(content)` 接口，但内部走新管线，输出可直接 `v-html` 注入的 sanitized HTML 字符串（不含异步内容）；mermaid / shiki 主题切换通过 DOM 后处理。
- 重写 `src/components/MarkdownReadSurface.vue`：移除硬编码 `color: #2a2a2a`，引入新增样式表 `src/styles/markdown-render.css`（从 PureMark `puremark.css` 抽取只读相关规则，按 `--app-*` 变量改写），mermaid/复制按钮挂载逻辑迁入组件 `onMounted`。
- 复刻 PureMark 关键能力到 Steno：`getMermaidThemeVariables()`（CSS 变量 → mermaid theme）、`imagePathPlugin`（`convertFileSrc` + 相对路径基于当前笔记目录）。
- 不变更编辑侧：`MarkdownEditor.vue` 与 `markdown-editor/live-render.ts` 维持原状。

## Capabilities

### New Capabilities

- `markdown-rendering`：定义 Steno 笔记预览面板对 Markdown 源文本的渲染契约，包括 GFM 基础语法、代码高亮、数学公式、Mermaid 图表、Tauri 图片路径、主题适配与安全过滤等行为要求。

### Modified Capabilities

<!-- 现有 specs（main-list-type-filtering / text-document-entry-model / workspace-group-browser）均不涉及"如何渲染正文 Markdown"的需求，本次改动不触及它们的 spec 级行为，故不在此列出。 -->

## Impact

- **代码**：
  - 修改：`src/composables/useMarkdown.ts`、`src/components/MarkdownReadSurface.vue`
  - 新增：`src/utils/markdown/{renderer,shiki,mermaid,images,sanitize}.ts`、`src/styles/markdown-render.css`
  - 不变：`src/components/MarkdownEditor.vue`、`src/components/markdown-editor/*`、`src/views/NoteEditorView.vue`（仅依赖 `useMarkdown.renderHtml` 的现有签名）
- **依赖**：
  - 新增 npm 包：`shiki`、`katex`、`@vscode/markdown-it-katex`、`mermaid`、`markdown-it-task-lists`、`markdown-it-anchor`、`dompurify`、`@types/markdown-it`、`@types/dompurify`
  - 移除 npm 包：`marked`
  - 利用现有：`markdown-it`（先前已声明但未启用）
- **构建/产物**：shiki + mermaid 体积较大；通过动态 `import()` 切分异步 chunk，避免冷启动首屏受影响。
- **测试**：新增 `src/utils/markdown/__tests__/renderer.spec.ts`、`src/composables/__tests__/useMarkdown.spec.ts`，覆盖 GFM、高亮、KaTeX、mermaid 占位、sanitize、Tauri 图片路径。
- **主题**：暗/亮主题切换驱动 shiki 类名切换 + mermaid 重渲染，需要 `useDark` 观察。
- **回滚成本**：低；新管线由 `useMarkdown` 单入口封装，回退即恢复 `marked` 依赖与原文件。
