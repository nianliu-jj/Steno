## Context

**当前状态**：
- `MarkdownEditor.vue` 基于 CodeMirror 6 + Lezer + 自建 `live-render.ts`，本质上是"源码视图 + 装饰器高亮"，不是真正的 WYSIWYG。
  - 列表 `-` / `1.` 不会渲染为 `<ul>` / `<ol>` 圆点；表格 `|A|B|` 显示为字面管道符；HR `---` 显示为三短横线；链接 `[a](url)` 显示为字面；内联 HTML 标签如 `<u>`、`<mark>`、`<del>` 不被识别。
  - 用户体验远低于 PureMark / milkup / Typora。
- `MarkdownReadSurface.vue` 基于 markdown-it 渲染 → `v-html` 注入，渲染规则与编辑态不一致；切换编辑/只读时视觉错位。
- 已完成的 `redesign-markdown-rendering-pipeline` change 让 markdown-it 管线达到可用状态，但只服务于只读视图。
- 项目已经有 `prosemirror-*` 依赖（用于一个早期 `MarkdownRichEditor.vue` 探索版），可直接复用。

**参考项目**：
- `D:\Markdown项目\PureMark`：Tauri + Vue 3 + ProseMirror，Typora 风格 WYSIWYG。`src/core/` 包含 `schema/parser/serializer/nodeviews/plugins/decorations/commands/keymap/types`，4000+ 行核心代码，决策清晰。
- `D:\Markdown项目\milkup`：同一作者的早期版本，同样 ProseMirror 内核 + CodeMirror 嵌入代码块；架构与 PureMark 同构。
- 两者都验证了"ProseMirror 主编辑器 + CodeMirror 作为代码块 NodeView 内嵌"的可行方案。

**约束**：
- Tauri 2 WebView2（Windows）/ WKWebView（macOS）/ WebKitGTK（Linux）兼容性，特别是 IME 中文输入。
- 数据库 schema、磁盘 `.md` 文件格式 **保持不变**（始终以原始 Markdown 字符串读写）。
- 现有 `useAutosave`、`useMarkdownOutline`、`extractHeadings`、`useMarkdown.countWords/extractTags` **不动**。
- `MarkdownEditor` 与 `MarkdownReadSurface` 的对外 props/events/exposed API **不破坏**。
- KaTeX、Mermaid、Shiki、DOMPurify 已经在项目中且工作良好，需要复用而不是重做。

## Goals / Non-Goals

**Goals:**
- 把 `MarkdownEditor.vue`（编辑态）与 `MarkdownReadSurface.vue`（只读态）统一为同一个 **ProseMirror 内核** + 同一套 schema / parser / serializer / nodeviews。
- 编辑态达到 Typora 风格 WYSIWYG：列表渲染 bullet、表格渲染 grid、HR 渲染分隔线、链接显示蓝色、blockquote 显示左竖线、内联 HTML `<u>` / `<mark>` 等正确呈现；光标进入对应节点时显示语法标记符号（`**`、`>`、`-` 等），离开后隐藏。
- 只读态同样走 ProseMirror（`editable: () => false`），共享所有 NodeView 渲染规则，与编辑态视觉一致。
- 完整覆盖 GFM 子集：标题（ATX h1-h6）、blockquote（含无空格 `>foo`）、bullet list、ordered list、task list（`- [ ]` / `- [x]`）、HR、表格、围栏代码块（含语言标签 + Shiki 高亮 + 复制按钮）、行内代码、链接、图片（含 Tauri 相对路径解析）、删除线、粗体、斜体、`==高亮==`、KaTeX 行内（`$...$`）/块级（`$$...$$`）、Mermaid（``` ```mermaid ```）、内联 HTML 标签白名单（`<u>` / `<mark>` / `<del>` / `<kbd>` / `<sub>` / `<sup>` / `<br>` 等）。
- 出口 HTML（用于剪贴板"复制为 HTML"、未来导出）走 DOMPurify 清洗。
- 单元测试覆盖 parser / serializer 的来回往返（`markdown → doc → markdown` 等价），以及 instant-render 的光标进入/离开行为。

**Non-Goals:**
- 不实现 SourceView（裸 Markdown 源码视图）。Steno 当前只需要 WYSIWYG + 只读两种态，PureMark 的"源码切换"留作后续 change。
- 不实现协同编辑、Y.js 集成、版本时光机。
- 不实现搜索/替换面板（CodeMirror 自带 → 迁移后需要专门实现，作为后续 change）。
- 不实现 `:::container` 自定义容器、`[!NOTE]` blockquote alert 等扩展语法。
- 不修改数据库 schema、磁盘 `.md` 文件格式、`useMarkdownOutline` / `extractHeadings` / `useAutosave` 等无关模块。
- 不引入 Tiptap / Lexical / Slate 等高层封装。
- 不在此 change 内提供 PDF / Word 导出（仍由后续 change 处理，复用本次产出的"ProseMirror Node → HTML"通道）。

## Decisions

### 决策 1：编辑器内核选 ProseMirror 原生 API（不是 Tiptap / Lexical）

**选择**：直接使用 `prosemirror-state` / `prosemirror-view` / `prosemirror-model` 等原生包，与 PureMark / milkup 对齐。

**理由**：
- 两个参考项目都是 ProseMirror 原生，代码可大段对照搬运。
- Tiptap 默认走 `prosemirror-markdown`，其 schema 不保留语法标记符号（无法做 Typora 那种"光标进入显示 `**`、离开隐藏"的体验），自定义反而比 raw ProseMirror 更难。
- Lexical 生态薄，Markdown 支持弱。
- ProseMirror 学习成本高，但 PureMark 已经把绝大多数难点（自建 parser / serializer / instant-render / NodeView）解决，我们做"对照搬运 + Steno 适配"即可。

**备选**：
- Tiptap：抽象层多，自定义 schema 反而麻烦。
- Lexical：生态、Markdown 支持都不够。
- 继续 CodeMirror + 装饰器：达不到图二效果，工作量也不小。

### 决策 2：自建 Markdown parser / serializer（不用 `prosemirror-markdown`）

**选择**：照搬 PureMark `src/core/parser/index.ts` 与 `src/core/serializer/index.ts` 的结构，自建解析器与序列化器。

**理由**：
- `prosemirror-markdown` 把语法标记吃掉（`**bold**` 直接变 `<strong>bold</strong>`，源码标记符号 `**` 不进文档），光标无法在源码位置内移动 → 与 Typora 风格 WYSIWYG 不兼容。
- PureMark 的 parser 把 `**` 作为携带 `syntax_marker` 标志的文本节点保留进文档，配合 `instant-render` 插件用 Decoration 隐藏 / 显示标记符号，是公认的 Typora 风格实现路径。
- 我们要 **完整复制** PureMark parser 的语法规则表（INLINE_SYNTAXES + BLOCK 解析），仅在解析器入口适配 Steno 的 schema 命名。

### 决策 3：内联 HTML 标签作为 `html_inline` 节点保留

**选择**：白名单内的内联 HTML 标签（`<u>`、`<mark>`、`<del>`、`<kbd>`、`<sub>`、`<sup>`、`<br>` 等）解析为带 `tag`/`attrs` 属性的 `html_inline` 节点（leaf 节点 + DOM 序列化为对应标签）。

**理由**：
- 截图二明显支持 `<u>Phase 4</u>` 直接渲染为下划线。
- 安全考虑：白名单只放语义/排版相关标签，禁止 `<script>` / `<iframe>` / `<object>` 等；属性过滤掉 `on*` 事件 + `javascript:` 协议（与现有 DOMPurify 规则一致）。
- PureMark `src/core/schema/index.ts` 已经提供 `SAFE_INLINE_TAGS` 与 `parseHtmlAttrs`，可直接复用。

### 决策 4：代码块 NodeView 内嵌 CodeMirror 6

**选择**：围栏代码块用 ProseMirror NodeView 渲染，NodeView 内挂 CodeMirror 6 EditorView（参考 PureMark `src/core/nodeviews/code-block.ts`）。

**理由**：
- 代码块需要语法高亮、行号、Tab 缩进 → CodeMirror 是行业标准，自己在 ProseMirror 里写一遍不现实。
- PureMark 已有完整的 CM 嵌入方案：内外 EditorView 的 selection / focus / undo / IME 协同。
- Shiki 仍用于"序列化为 HTML 时的双主题高亮"（复制 / 导出），CodeMirror 用于编辑时的实时高亮。两者分工互补。

### 决策 5：编辑/只读公用 EditorView，靠 `editable` 切换

**选择**：`MarkdownReadSurface.vue` 同样创建 `EditorView`，传入 `editable: () => false` + `attributes.spellcheck="false"` + 隐藏光标 CSS。

**理由**：
- 共享所有 NodeView → 编辑态与只读态视觉 100% 一致，杜绝"编辑看到的和导出/只读看到的不一样"的老问题。
- 复制选区 → 复用 ProseMirror 的 `clipboardTextSerializer` 输出 Markdown 文本，复用 `clipboardSerializer` 输出 HTML。
- 只读态的额外能力（heading 锚点点击、复制代码按钮）通过插件层附加，不污染共享 schema。

**备选**：
- 只读态继续用 markdown-it + v-html：视觉不一致；HR / 表格 / 列表样式需要再写一套 CSS 对齐。
- 只读态用 ProseMirror 的 `serializeFragment` 转 HTML 再 v-html 注入：失去 NodeView 能力（Mermaid / KaTeX / 复制按钮需重做）。

### 决策 6：分层与目录结构

```
src/components/markdown-editor/prosemirror/
  schema/
    index.ts            # 整套 Schema 装配
    nodes.ts            # NodeSpec：doc/paragraph/heading/blockquote/list/table/code_block/...
    marks.ts            # MarkSpec：strong/em/code/strike/link/highlight/html_inline_mark
    html-inline.ts      # 内联 HTML 白名单 + attr 清洗
  parser/
    index.ts            # markdown → ProseMirror Doc（保留 syntax_marker）
    inline.ts           # 行内规则（参考 PureMark INLINE_SYNTAXES）
    block.ts            # 块级规则（heading / blockquote / list / table / code / hr / math）
  serializer/
    index.ts            # Doc → markdown（与 parser 来回一致）
    node-serializers.ts
    mark-serializers.ts
  nodeviews/
    code-block.ts       # 内嵌 CodeMirror 6
    image.ts            # 相对路径解析 + 失败占位
    math-block.ts       # KaTeX 渲染
    mermaid-block.ts    # Mermaid 异步渲染（复用 utils/markdown/mermaid.ts）
    task-list-item.ts   # 复选框交互
    table.ts            # 表格行/列操作（首版只渲染）
    index.ts
  plugins/
    instant-render.ts   # 光标进入/离开时显隐 syntax_marker（核心）
    input-rules.ts      # `# `、`> `、`- `、`1. ` 等触发即时转换
    syntax-fixer.ts     # 光标离开后修复破损语法
    paste.ts            # 粘贴 HTML/图片处理
    placeholder.ts      # 占位文字
    keymap.ts           # 快捷键
    history.ts          # undo/redo（prosemirror-history 包装）
    drop-cursor.ts      # 拖拽指示
    gap-cursor.ts       # block 间空白光标
    index.ts            # 装配
  view/
    create-editor.ts    # 工厂：装配 schema/plugins/nodeviews，返回 EditorView
    editor-bridge.ts    # 与 Vue 组件的双向绑定 + scrollToLine + focus
  styles/
    base.css            # 编辑器壳容器
    typography.css      # 文本样式（h1-h6/p/blockquote/ul/ol/...）
    table.css
    code-block.css
    syntax-marker.css   # 隐藏/显示 syntax_marker 的过渡
  tests/
    parser.test.ts
    serializer.test.ts
    instant-render.test.ts
    nodeviews.test.ts
```

`MarkdownEditor.vue` 与 `MarkdownReadSurface.vue` 变得很薄：调用 `createEditor({ editable, initialValue })`，监听 `onChange`，往父组件 emit。

### 决策 7：增量迁移策略（保留对外 API）

**选择**：保持两个 Vue 组件的 props / emits / exposed 完全一致，把内部实现替换。

- `MarkdownEditor.vue`：props `modelValue`/`autofocus`/`placeholder`，emits `update:modelValue`/`focus`/`blur`，exposed `focus()`/`scrollToLine(line)`。
- `MarkdownReadSurface.vue`：props `title`/`content`，exposed `scrollToHeading(id)`（已存在的话）。
- `scrollToLine` 实现：parser 阶段在每个块级节点 attrs 里记录 `startLine`，`scrollToLine` 遍历 doc 找最近的 `startLine ≤ line` 的节点，调用 `view.coordsAtPos` 滚动。
- 上游 `useAutosave` / `useMarkdownOutline` / `NoteEditorView` / `FloatingEditor` 均**无需修改**。

### 决策 8：测试策略

- **parser 单测**：对 30+ 典型 Markdown 输入验证生成的 doc 结构（用 `doc.toString()` 快照或显式断言节点路径）。
- **serializer 单测**：从 doc 出发序列化为 markdown，与原始输入字符串相等（来回 round-trip）。
- **instant-render 单测**：在 EditorView 上模拟 selection 变更，断言 Decoration 的添加/移除（用 jsdom + `@vue/test-utils` 已配）。
- **NodeView 单测**：mount 单个 NodeView，断言 DOM 输出结构。
- **集成测试**：把 proposal 中"图二"对应的 Markdown 输入塞进编辑器，断言 DOM 结构包含 `<ul>` / `<table>` / `<hr>` / `<a>` 等。

## Risks / Trade-offs

- **[ProseMirror 学习曲线高] → 缓解**：90% 代码可对照 PureMark 搬运；为复杂模块（parser / instant-render / code-block NodeView）单独写 ADR 注释，标注源出处。
- **[parser / serializer 来回不等价] → 缓解**：测试用例覆盖嵌套列表、表格对齐、HTML inline、math、code 等边界；引入 `roundtrip(md) === md` 断言；不通过则定位规则缺陷。
- **[IME 中文输入异常] → 缓解**：ProseMirror 原生对 IME 支持成熟；在 NodeView（特别是 code-block 嵌套 CM）里需特殊处理 `compositionstart`/`compositionend`；PureMark 已有现成实现。
- **[CodeMirror 在 NodeView 内嵌的 selection 抖动] → 缓解**：照搬 PureMark `code-block.ts` 中的 forward / backward selection 同步逻辑；增加专项测试。
- **[v-model 双向同步死循环] → 缓解**：保留现有 `suppressNextDocSync` 思路；ProseMirror dispatch 路径单一，比 CodeMirror 更容易控制。
- **[Tauri WebView2 兼容性] → 缓解**：开发期开 Tauri dev，每个 NodeView 完工后跑一次实机；列出"必跑场景"清单（粘贴富文本、拖拽图片、IME 中英混输、长文档滚动）。
- **[长文档性能] → 缓解**：ProseMirror 自带视口渲染优化；NodeView 的昂贵渲染（Mermaid、Shiki）懒加载 + 缓存（已有 `mermaid.ts` 缓存逻辑）。
- **[迁移期 PR 太大] → 缓解**：分 Phase 提交（schema → parser → serializer → 基本 nodeviews → instant-render → 复杂 nodeviews → MarkdownEditor 接入 → MarkdownReadSurface 接入 → 删除旧代码 → 测试与文档），每个 Phase 一次中文 commit，每次都让仓库可编译。

## Migration Plan

按 Phase 推进，每个 Phase 完成后做一次中文 commit；Phase 末尾跑 `pnpm typecheck && pnpm lint && pnpm test`。

1. **Phase 0 — 依赖与目录**：新增 `prosemirror-dropcursor` / `prosemirror-gapcursor` / `prosemirror-tables` / `prosemirror-transform`；创建 `src/components/markdown-editor/prosemirror/` 空壳目录。
2. **Phase 1 — Schema**：移植 PureMark `schema/`；输出 `puremarkSchema`-like 实例。
3. **Phase 2 — Parser**：移植 `parser/`；通过基础 round-trip 测试。
4. **Phase 3 — Serializer**：移植 `serializer/`；通过 round-trip 测试。
5. **Phase 4 — 基础 NodeView**：image、task-list-item、html-block、math-block、mermaid-block。
6. **Phase 5 — 代码块 NodeView**：内嵌 CodeMirror 6（含 Shiki 主题切换、复制按钮）。
7. **Phase 6 — Plugins**：instant-render / input-rules / syntax-fixer / paste / placeholder / keymap / history / drop-cursor / gap-cursor。
8. **Phase 7 — 视图工厂 + 桥接**：`create-editor.ts`、`editor-bridge.ts`，含 `scrollToLine`、`focus`、`editable` 切换。
9. **Phase 8 — MarkdownEditor.vue 接入**：替换内核；保持 props/emits/exposed；删除旧的 `live-render.ts` 与关联测试；E2E 验证图二样例。
10. **Phase 9 — MarkdownReadSurface.vue 接入**：替换内核；移除 `v-html` + markdown-it；保留 heading 锚点 `id` 注入。
11. **Phase 10 — 清理**：从 `package.json` 移除不再需要的 `@codemirror/lang-markdown` / `@codemirror/search` / `@lezer/highlight`（确认无残留引用）；从 `src/utils/markdown` 仅保留 `renderMarkdown`（剪贴板 HTML 兜底）+ `sanitizeHtml`。
12. **Phase 11 — 文档与归档**：更新 `docs/`；OpenSpec `archive` 本 change。

**回滚策略**：每个 Phase 一次 commit，回滚到迁移前用 `git revert` 系列 commit 即可；MVP Phase 8 接入完成前老 `MarkdownEditor.vue` 路径仍可用（通过 `git checkout`）。

## Open Questions

- **复制为 HTML 是否要 inline CSS**？当前 `MarkdownReadSurface` 走 `<v-html>` + 全局 markdown-body class；ProseMirror 出口 HTML 默认带类名，需要在剪贴板序列化时把类名展开为 inline style 吗？→ 初步决定 **不展开**，由消费方（如未来的导出 PDF/Word change）按需处理。
- **表格首版是否支持编辑**（增删行列）？参考项目都支持。本次实现"渲染 + 简单单元格编辑"，"右键菜单增删行列"挂到后续 change。
- **拖拽 .md 文件进编辑器**：是当成纯文本插入还是替换全文？→ 与图片粘贴一致，作为附件/链接插入；不替换全文。
- **是否给 ProseMirror DOM 输出统一加 `markdown-body` class**：是。复用现有 `markdown-render.css` 的样式变量。
