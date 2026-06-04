# Markdown 渲染体验修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正笔记详情和笔记列表中的 Markdown 渲染细节：图片点击显示路径、代码块呈现为只读代码块样式、列表卡片展示三行渲染摘要。

**Architecture:** 详情页继续使用 ProseMirror 只读内核，修改 image/code_block NodeView 与基础样式。列表卡片新增专用摘要渲染工具，复用现有 ProseMirror parser/schema 生成安全 HTML，并由卡片样式做三行截断。

**Tech Stack:** Vue 3、ProseMirror、CodeMirror 6、Vitest、jsdom。

---

### Task 1: 图片点击显示原始路径

**Files:**
- Modify: `src/components/markdown-editor/prosemirror/nodeviews/image.ts`
- Test: `src/components/markdown-editor/prosemirror/tests/nodeviews.test.ts`
- Style: `src/components/markdown-editor/prosemirror/view/editor-base.css`

- [ ] 写失败测试：点击图片后出现 `.steno-image-path`，文本为原始 `src`。
- [ ] 运行 `pnpm vitest run src/components/markdown-editor/prosemirror/tests/nodeviews.test.ts --testNamePattern "image NodeView"`，确认失败。
- [ ] 实现图片容器、路径元素、点击切换和 update 同步。
- [ ] 运行同一测试确认通过。

### Task 2: 代码块只读呈现

**Files:**
- Modify: `src/components/markdown-editor/prosemirror/nodeviews/code-block.ts`
- Test: `src/components/markdown-editor/prosemirror/tests/nodeviews.test.ts`
- Style: `src/components/markdown-editor/prosemirror/view/editor-base.css`

- [ ] 写失败测试：只读挂载时 `.steno-code-block` 带 `is-readonly`，代码区为不可编辑结构，仍保留语言标签和复制按钮。
- [ ] 运行相关测试确认失败。
- [ ] 在 NodeView 中根据外层 view editable 状态选择 CodeMirror 编辑态或只读 `<pre><code>` 呈现。
- [ ] 补只读样式：头部、语言标签、复制按钮、行号和代码内容区域。
- [ ] 运行相关测试确认通过。

### Task 3: 笔记列表三行渲染摘要

**Files:**
- Create: `src/utils/notePreview.ts`
- Test: `src/utils/notePreview.test.ts`
- Modify: `src/views/MainView.vue`
- Test: `src/views/MainView.test.ts`

- [ ] 写失败测试：Markdown 语法被渲染为 HTML，语法标记不外露；代码块变成一行摘要；图片不撑开卡片。
- [ ] 运行 `pnpm vitest run src/utils/notePreview.test.ts src/views/MainView.test.ts`，确认失败。
- [ ] 实现 `renderNotePreviewHtml(content)` 并替换 `MainView.vue` 内联 `previewHtml`。
- [ ] 调整 `.note-card-preview` 为最多三行，超出省略，块级内容在卡片里紧凑呈现。
- [ ] 运行相关测试确认通过。

### Task 4: 验证

**Files:**
- Modify: related files only

- [ ] 运行 `pnpm vitest run src/components/markdown-editor/prosemirror/tests/nodeviews.test.ts src/components/MarkdownReadSurface.test.ts src/utils/notePreview.test.ts src/views/MainView.test.ts`。
- [ ] 运行 `pnpm typecheck`。
- [ ] 检查 `git diff`，确认未触碰 `src-tauri/Cargo.toml`。
