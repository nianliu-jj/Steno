## Why

Steno 当前的 Markdown 体验由两条管线拼接而成：
- **编辑态** `MarkdownEditor.vue` —— CodeMirror 6 + 自建 `live-render.ts` 装饰器，对源码做"原位高亮"，但无法 WYSIWYG 渲染列表 bullet、表格、HR、链接、内联 HTML 标签等，与 PureMark / milkup（Typora 风格）效果差距明显。
- **只读态** `MarkdownReadSurface.vue` —— markdown-it + v-html 注入，HTML 字符串渲染。

两条管线渲染规则不一致，用户在编辑态看到大量原始 Markdown 字符（`|A|B|`、`---`、`[a](url)`、`>foo`），切换到只读才看到"正确"结果。我们要把两侧统一到与 PureMark / milkup 一致的 **ProseMirror 原位 WYSIWYG 内核**，把"看到的就是渲染后的样子"做扎实，让编辑态本身就长得像截图二。

## What Changes

- **新增** 共用的 ProseMirror 内核 `src/components/markdown-editor/prosemirror/`：schema / parser / serializer / nodeviews / plugins / 样式，参考 `D:\Markdown项目\PureMark\src\core\` 与 `D:\Markdown项目\milkup` 的同构架构。
- **重写** `MarkdownEditor.vue` 内核：CodeMirror 6 + `live-render.ts` → ProseMirror EditorView。对外 `v-model:modelValue` / `focus()` / `scrollToLine` / `@focus` / `@blur` / `placeholder` / `autofocus` API 不变。
- **重写** `MarkdownReadSurface.vue` 内核：v-html + markdown-it → ProseMirror EditorView（`editable: () => false`）+ 同一套 schema / parser / nodeviews。
- **保留** 现有 markdown-it 工具链作为后续导出/打印/复制为 HTML 的兜底（不再用于 UI 渲染）；KaTeX、Mermaid、Shiki、DOMPurify 在 NodeView 内复用。
- **删除** `src/components/markdown-editor/live-render.ts` 与对应测试；`src/utils/markdown` 仅保留 `renderMarkdown`（供导出）+ `sanitizeHtml`（供粘贴 HTML 时清洗）。
- **保持** 数据库 schema、磁盘 `.md` 文件格式、`useMarkdownOutline.ts`、`extractHeadings.ts`、`useMarkdown.countWords/extractTags` 不变 —— 入库与磁盘文本始终是纯 Markdown。
- **不引入** Tiptap / Lexical，直接用 ProseMirror 原生 API，与参考项目对齐以最大化代码复用空间。

## Capabilities

### New Capabilities
- `markdown-wysiwyg-editor`: Steno 全平台 Markdown 编辑与渲染面板的统一 ProseMirror WYSIWYG 内核，覆盖：可编辑/只读两种模式、GFM 子集（标题/blockquote/列表/任务列表/HR/表格/围栏代码块/链接/图片/删除线/粗体/斜体/行内代码/高亮）、内联 HTML 标签（`<u>` / `<mark>` / `<del>` / `<kbd>` 等）、KaTeX 行内/块级公式、Mermaid 块、Shiki 代码高亮、相对路径图片解析、复制按钮、出口 DOMPurify 清洗。

### Modified Capabilities
<!-- 无：本次不修改既有 spec 行为。文档大纲、字数统计等是 capability 外的纯工具。 -->

## Impact

- **代码新增**：`src/components/markdown-editor/prosemirror/` 整个子树（schema / parser / serializer / nodeviews / plugins / styles / tests），约 30+ 文件。
- **代码替换**：`src/components/MarkdownEditor.vue`、`src/components/MarkdownReadSurface.vue` 内部实现彻底换内核，对外接口保持。
- **代码删除**：`src/components/markdown-editor/live-render.ts`、`src/components/markdown-editor/live-render.test.ts`（及关联样式），`src/utils/markdown/` 中 `mermaid.ts`、`shiki.ts`、`images.ts` 的"作为 markdown-it 插件"的接入方式 → 改为被 ProseMirror NodeView 直接调用的工具函数。
- **依赖新增**：`prosemirror-dropcursor`、`prosemirror-gapcursor`、`prosemirror-tables`、`prosemirror-transform`（其它 `prosemirror-*` 包已在 `package.json` 中）。
- **依赖移除**：`@codemirror/lang-markdown`、`@codemirror/search`、`@lezer/highlight`（用于编辑器内核，迁移后不再依赖；CodeMirror 仍保留供代码块 NodeView 内嵌使用 → 保留 `@codemirror/state` / `view` / `commands` / `language` / `language-data`）。
- **测试影响**：`MarkdownEditor.test.ts`、`MarkdownReadSurface.test.ts` 需重写；新增 parser/serializer/instant-render/nodeviews 的单元测试。
- **风险**：ProseMirror 学习曲线 + 自建 parser/serializer 的边界情况（嵌套列表、表格、HTML inline）；对 IME 中文输入、Tauri WebView2 兼容性需重点验证。
