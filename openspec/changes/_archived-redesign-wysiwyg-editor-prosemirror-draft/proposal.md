## Why

当前 `MarkdownEditor.vue` 基于 **CodeMirror 6 + Lezer + 自建装饰器** 的 live-render 方案，只能对部分语法做"原位高亮"，对 **HTML 内联标签**（如 `<u>Phase 4</u>` 被原样显示）、**列表标记符号**（`- a` `- v` 显示为原始连字符）、**GFM 表格**（`|A|B|` 显示为原始管道符）、**水平分隔线**（`---` 显示为原始连字符）、**链接语法**（`[a](hh)` 显示为原始方括号 + 圆括号）以及 **无空格 blockquote**（`>foo` 不被识别）等均**未做渲染**，与用户期望的 WYSIWYG 体验差距巨大。

参考项目 `D:\Markdown项目\PureMark` 与 `D:\Markdown项目\milkup` 都基于 **ProseMirror** 构建了真正的 WYSIWYG Markdown 编辑器：自定义 schema 把每种 Markdown 语法映射为一个节点/标记，自定义 parser 把源码解析为 ProseMirror 文档树，自定义 serializer 把文档树重新输出为 Markdown，并通过 `instant-render` 等插件控制语法标记的显隐。该架构是当前能达到图二渲染效果的成熟工业方案。

本次变更将参考 PureMark/milkup 的架构，把 `MarkdownEditor.vue` 内核从 CodeMirror 6 **完整迁移到 ProseMirror**，并对各类 Markdown 语法实现完整的 WYSIWYG 渲染，对齐图二效果。

## What Changes

- **BREAKING**：移除 `MarkdownEditor.vue` 对 CodeMirror 6 的依赖（包括 `@codemirror/*`、`@lezer/*`、`src/components/markdown-editor/extensions.ts`、`src/components/markdown-editor/live-render.ts`、`src/components/markdown-editor/keymap.ts`），改为基于 **ProseMirror** 的全新编辑器内核。
- **BREAKING**：`MarkdownEditor.vue` 公开 API 保持兼容（`v-model:modelValue`、`focus`、`scrollToLine`、`@focus`、`@blur` 不变），但内部 DOM 结构与 CSS class 全部更换为 ProseMirror 的 `.ProseMirror` 根 + 自定义 schema 渲染产物；调用方无需修改。
- 新增依赖：`prosemirror-state`、`prosemirror-view`、`prosemirror-model`、`prosemirror-commands`、`prosemirror-keymap`、`prosemirror-history`、`prosemirror-inputrules`、`prosemirror-dropcursor`、`prosemirror-gapcursor`、`prosemirror-schema-list`、`prosemirror-transform`。
- 新增 `src/components/markdown-editor/core/` 子目录，参考 milkup `src/core/` 的拆分：
  - `schema/index.ts` — 节点 + Mark 定义（paragraph、heading、blockquote、code_block、horizontal_rule、bullet_list、ordered_list、list_item、task_list、task_item、table、table_row、table_cell、table_header、image、html_block、math_block、container；strong、emphasis、code_inline、strikethrough、link、highlight、html_inline、math_inline、sub、sup、syntax_marker）
  - `parser/index.ts` — Markdown 源文本 → ProseMirror Node 树（保留 syntax_marker 作为可见文本节点，让光标能在源码标记内移动）
  - `serializer/index.ts` — ProseMirror Node 树 → Markdown 源文本
  - `plugins/instant-render.ts` — 即时渲染插件（追踪光标行，控制语法标记的显隐 Decoration）
  - `plugins/syntax-fixer.ts` — 光标离开后自动修复破损语法（如未闭合的 `**`）
  - `plugins/input-rules.ts` — 输入即触发的转换规则（`# ` → 标题、`> ` → blockquote、`- ` → 列表等）
  - `plugins/paste.ts` — 粘贴 Markdown / 图片 / HTML 处理
  - `plugins/placeholder.ts` — 空文档占位文字
  - `nodeviews/code-block.ts`、`nodeviews/image.ts`、`nodeviews/list.ts`、`nodeviews/math-block.ts`、`nodeviews/html-block.ts` — 复杂节点的 NodeView（代码块语法高亮、图片预览、列表渲染等）
  - `keymap/index.ts` — 快捷键体系（`Ctrl+B` 粗体、`Ctrl+I` 斜体、`Ctrl+K` 链接 等）
  - `decorations/index.ts` — 语法标记的 Decoration 渲染辅助
- 重写 `src/components/MarkdownEditor.vue`：内部用 ProseMirror 装配 schema + parser + serializer + plugins，对外保留双向绑定与 `scrollToLine` 等 expose 接口；保留图片粘贴回调、placeholder、autofocus 等 props。
- 保留 `src/components/MarkdownReadSurface.vue` 不变（继续走 `markdown-it` 管线，因为只读视图不需要 WYSIWYG 编辑能力，纯渲染输出即可，避免影响最近完成的 redesign-markdown-rendering-pipeline 工作）。
- 复用现有的：`shiki`（代码高亮，给 NodeView 用）、`katex`（数学公式渲染）、`mermaid`（图表渲染）、`dompurify`（出口过滤，给 HTML 块用）。
- 新增样式表 `src/styles/markdown-editor.css`（从 milkup `src/core/styles/*.css` 抽取并按 `--app-*` 变量改写），覆盖 WYSIWYG 渲染样式。

## Capabilities

### New Capabilities

- `markdown-wysiwyg-editor`：定义 Steno 笔记主编辑器在 WYSIWYG 模式下对 Markdown 源文本的渲染、编辑、序列化契约，包括所有受支持的 Markdown 语法、光标行为、键盘交互、粘贴行为、与 v-model 的契约等。

### Modified Capabilities

<!-- 不修改现有 specs。
  - markdown-rendering（来自 redesign-markdown-rendering-pipeline）只描述只读预览面板，与本次 WYSIWYG 编辑器无关。
  - main-list-type-filtering / text-document-entry-model / workspace-group-browser 都与编辑器内核无关。
-->

## Impact

- **代码**：
  - 删除：`src/components/markdown-editor/extensions.ts`、`src/components/markdown-editor/live-render.ts`、`src/components/markdown-editor/keymap.ts`（CodeMirror 内核）
  - 重写：`src/components/MarkdownEditor.vue`（CM6 → ProseMirror）、`src/components/MarkdownEditor.test.ts`
  - 新增：`src/components/markdown-editor/core/{schema,parser,serializer,plugins/*,nodeviews/*,keymap,decorations}.ts`、`src/styles/markdown-editor.css`、对应 `__tests__/*.spec.ts`
  - 不变：`src/components/MarkdownReadSurface.vue`、`src/utils/markdown/*`、`src/composables/useMarkdown.ts`、`src/views/NoteEditorView.vue`（仍以 `v-model` 接入 `MarkdownEditor`）
- **依赖**：
  - 新增 npm 包：`prosemirror-state`、`prosemirror-view`、`prosemirror-model`、`prosemirror-commands`、`prosemirror-keymap`、`prosemirror-history`、`prosemirror-inputrules`、`prosemirror-dropcursor`、`prosemirror-gapcursor`、`prosemirror-schema-list`、`prosemirror-transform`
  - 移除 npm 包：`@codemirror/state`、`@codemirror/view`、`@codemirror/commands`、`@codemirror/lang-markdown`、`@codemirror/language`、`@codemirror/language-data`、`@lezer/highlight`、`@lezer/common`（如无其它消费方）
  - 利用现有：`shiki`、`katex`、`@vscode/markdown-it-katex`（可继续在 NodeView 内部使用 katex 渲染，无需新增）、`mermaid`、`dompurify`、`markdown-it`（仅供 ReadSurface 用）
- **构建/产物**：ProseMirror 多包合计体积小于当前 CodeMirror 6 全家桶；预期 bundle 略减小。
- **测试**：
  - 新增 `src/components/markdown-editor/core/__tests__/{parser,serializer,schema,instant-render}.spec.ts`，覆盖：
    - parser：常用 Markdown 语法到 Node 树的转换正确性（heading、list、blockquote、table、HR、HTML 内联、链接、image、code block、math block、container、task list 等）
    - serializer：Node 树到 Markdown 的回写保真性（round-trip 不丢字符）
    - instant-render：光标进入/离开语法块时 Decoration 显隐的行为契约
  - 重写 `src/components/MarkdownEditor.test.ts`：覆盖 v-model 双向绑定、focus/blur、scrollToLine、图片粘贴回调
- **主题**：复用现有 `useDark` 与 `--app-*` CSS 变量；新增样式表通过 `:root.dark` / `:root` 适配亮暗双主题。
- **数据兼容**：迁移完全在前端编辑层，不动数据库 schema、不动本地文件存储格式（仍以原始 Markdown 字符串保存），对老数据零影响。
- **回滚成本**：中等；CodeMirror 与 ProseMirror 是两套独立内核，回滚需恢复整套 `markdown-editor/` 目录与 npm 依赖；通过保留 git 完整提交粒度（按 Phase 拆分提交）降低回滚成本。
