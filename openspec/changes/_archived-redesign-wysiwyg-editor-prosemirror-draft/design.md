## Context

Steno 是基于 Tauri 2 + Vue 3 的桌面速记/笔记应用，主要内容载体是 Markdown 笔记（`text` 直存数据库，`document` 落盘 .md 文件）。当前 `MarkdownEditor.vue` 基于 CodeMirror 6 + Lezer + 自建 `live-render.ts` 装饰器，对 Markdown 源文本做"原位高亮"，但实现残缺：

- HTML 内联标签（如 `<u>Phase 4</u>`、`<mark>...</mark>`、`<del>...</del>`）显示为原始文本
- 列表标记（`-` / `*` / `+` / `1.`）显示为字符，而非渲染为 `<ul>` / `<ol>` 圆点
- GFM 表格（`|A|B|` + `|--|--|`）显示为原始管道符
- 水平分隔线 `---` / `***` / `___` 显示为字符
- 链接 `[a](url)` 显示为原始方括号 + 圆括号
- Blockquote 仅支持 `> foo` 带空格，不支持 `>foo` 无空格（与 CommonMark 不完全对齐）

参考项目 `D:\Markdown项目\PureMark` 与 `D:\Markdown项目\milkup` 都是基于 **ProseMirror** 的真正 WYSIWYG Markdown 编辑器（Typora 风格）。两者架构高度相似：

- `core/schema/index.ts` — 自定义节点 + Mark
- `core/parser/index.ts` — 自建 Markdown → ProseMirror Node 解析器（**保留语法标记作为可见文本节点**，让光标能在源码标记内移动）
- `core/serializer/index.ts` — Node → Markdown 序列化
- `core/plugins/instant-render.ts` — 追踪光标位置、控制语法标记的显隐 Decoration
- `core/plugins/input-rules.ts` — `# `、`> `、`- ` 等触发即时转换
- `core/plugins/syntax-fixer.ts` — 光标离开语法块后修复破损
- `core/nodeviews/*.ts` — 复杂节点（code-block、image、list、math-block、html-block）的独立渲染

本次改动只关心 `MarkdownEditor.vue` 的内核（write/edit mode），不动 `MarkdownReadSurface.vue`（read mode，仍走最近完成的 markdown-it 管线）。

## Goals / Non-Goals

**Goals:**
- 把 `MarkdownEditor.vue` 内核从 CodeMirror 6 完整迁移到 ProseMirror，实现与图二一致的 WYSIWYG 渲染
- 支持完整的 GFM 子集：标题（ATX）、blockquote（含无空格）、bullet/ordered list、task list、fenced code block、HR、表格、行内/块级数学公式、行内/块级 HTML、`==高亮==`、链接、图片、删除线、粗体/斜体
- 对外保持 `<MarkdownEditor v-model:modelValue>` 的接口契约（双向绑定 + `focus()` + `scrollToLine(line)` + `@focus` / `@blur` + `placeholder` + `autofocus`）
- 复用现有 `katex`、`mermaid`、`shiki`、`dompurify` 渲染能力（在 NodeView 内调用）
- 单元测试覆盖 parser / serializer / instant-render 行为契约
- 不动数据库 schema、不动磁盘文件格式（仍以原始 Markdown 字符串存储）

**Non-Goals:**
- 不动 `MarkdownReadSurface.vue`（只读视图仍走 markdown-it 管线）
- 不动 `useMarkdownOutline.ts`（基于源文本正则提取，与编辑器内核无关）
- 不引入 `prosemirror-markdown`（其默认 schema 不支持 syntax_marker，无法满足 Typora 风格的"光标进入显示符号、离开隐藏符号"需求；自建 parser/serializer 是必需的）
- 不引入 Tiptap / Lexical / Slate 等高层封装（增加抽象层，源码维护负担变重；直接用 ProseMirror 原生 API 与 milkup/PureMark 对齐）
- 不实现协同编辑、版本历史、AI 补全等高级功能（留作后续 change）
- 不实现 SourceView 模式切换（milkup/PureMark 有，Steno 暂不需要——`MarkdownReadSurface` 已担当只读渲染）
- 不实现 search/replace 面板（CodeMirror 自带，迁移 ProseMirror 后可作为后续 change 单独提供）
- 不在本次启用 `:::container` 自定义容器、`[!NOTE]` blockquote alert 等高级语法（保留 schema 节点位置，但解析/序列化暂不实现，避免范围蔓延）

## Decisions

### 决策 1：编辑器内核选 ProseMirror（不是 Tiptap / Lexical）

**选择**：直接使用 ProseMirror 原生 API（`prosemirror-state` / `prosemirror-view` / `prosemirror-model` 等），与 milkup/PureMark 对齐。

**理由**：
- milkup 与 PureMark 已经验证 ProseMirror 可以做出 Typora 风格的 WYSIWYG 编辑器，且代码可直接参考
- Tiptap 是 ProseMirror 的 Vue/React 风格 wrapper，增加额外抽象层，但其对"语法标记保留为可见文本"的方案支持不佳（Tiptap 默认走 prosemirror-markdown）
- Lexical 是 Facebook 系，生态弱、Markdown 支持薄
- 直接用 ProseMirror 原生 API 让我们能完全照搬 milkup 的实现，最大化复用现有代码

**备选**：
- Tiptap：抽象层太多，自定义 schema/parser 难度反而上升
- Lexical：生态、Markdown 支持都不如 ProseMirror

### 决策 2：自建 Markdown parser / serializer（不用 prosemirror-markdown）

**选择**：把 milkup `src/core/parser/index.ts`、`src/core/serializer/index.ts` 整体搬入 Steno，按 Steno 项目结构做必要重命名（`milkupSchema` → `stenoEditorSchema`）。

**理由**：
- `prosemirror-markdown` 把语法标记作为 mark 附在文本上，渲染时直接吃掉源码标记。这无法满足 Typora 式 WYSIWYG —— 我们需要光标进入 `**粗体**` 时显示 `**`，离开时隐藏 `**`。这要求语法标记作为**可见文本节点**存在，由 Decoration 控制显隐。
- milkup 的 parser 已经把这种模式实现得很完善（每个 `text` 节点带 `syntax_marker` mark + `syntax_open`/`syntax_close` 状态），实测在 PureMark 项目中表现稳定。
- 自建 parser 让我们能精确控制：哪些 mark 用何种正则、入栈顺序、嵌套规则——这是 prosemirror-markdown 完全做不到的。

**备选**：
- prosemirror-markdown：开箱即用但失去 syntax_marker，无法做 Typora 式渲染
- 用 remark/markdown-it AST → ProseMirror Node：转换层复杂，调试困难，与 milkup 已有方案重复造轮子

### 决策 3：Schema 在 milkup 基础上精简

**选择**：复用 milkup schema 的全部节点 + Mark，但暂不启用 `container` 节点的输入/序列化逻辑（schema 中保留以便后续启用）。本次启用的节点/Mark 清单：

**节点（block）**：`doc` / `paragraph` / `heading` / `blockquote` / `code_block` / `horizontal_rule` / `bullet_list` / `ordered_list` / `list_item` / `task_list` / `task_item` / `table` / `table_row` / `table_cell` / `table_header` / `math_block` / `html_block` / `image`

**节点（inline）**：`text` / `hard_break`

**Mark**：`syntax_marker`（最高优先级）/ `strong` / `emphasis` / `code_inline` / `strikethrough` / `link` / `highlight` / `html_inline` / `math_inline` / `sub` / `sup`

**理由**：上述清单覆盖图二所有语法 + 当前 Steno 已支持的 KaTeX、Mermaid（在 code_block NodeView 中识别）、shiki（同样 NodeView 内）。`container` / `footnote` / `directive` 留作后续。

### 决策 4：插件清单按 milkup 复用，但裁掉 search / source-view / AI 相关

**启用**（参考 milkup `core/index.ts`）：
- `history()` — 撤销/重做（来自 `prosemirror-history`）
- `dropCursor()` / `gapCursor()`（拖拽/边界光标）
- `keymap(baseKeymap)` + 自定义 `keymap(stenoBindings)` — 快捷键
- `createInstantRenderPlugin()` — 即时渲染（光标追踪 + 语法标记 Decoration）
- `createInputRulesPlugin()` — `# `、`> `、`- ` 等输入规则
- `createSyntaxFixerPlugin()` — 光标离开后修复破损语法
- `createSyntaxDetectorPlugin()` — 文档变更后异步检测语法变化
- `createHeadingSyncPlugin()` — 标题级别变化时同步 attrs
- `createImageSyncPlugin()` — 图片节点变化时刷新预览
- `createMathBlockSyncPlugin()` — 块级数学公式刷新
- `createHtmlBlockSyncPlugin()` — HTML 块刷新
- `createPlaceholderPlugin()` — 占位文字
- `createLineNumbersPlugin()` — 代码块行号（可选启用）
- `createPastePlugin()` — 粘贴 Markdown / 图片 / HTML 处理（图片走 Steno 的 `db.savePastedImage`）

**裁掉**：
- `createSearchPlugin()` —— 留作后续 change
- `createSourceViewTransformPlugin()` —— Steno 只读视图已由 MarkdownReadSurface 担当
- `createAICompletionPlugin()` —— Steno 暂无此需求
- `createBlockquoteAlertSyncPlugin()` —— 后续 change

### 决策 5：NodeView 清单按 milkup 复用

**启用**：
- `CodeBlockView` — fenced code block，集成 shiki 高亮 + mermaid 渲染 + 复制按钮
- `ImageView` — 图片预览（点击放大 / 编辑 alt/src 等）
- `MathBlockView` — `$$...$$` 块级公式，集成 KaTeX
- `HtmlBlockView` — HTML 块的安全渲染（DOMPurify 过滤）
- `BulletListView` / `OrderedListView` / `ListItemView` — 列表渲染（处理嵌套缩进与项目符号）
- `TaskListView` / `TaskItemView` — `- [ ]` / `- [x]` 任务列表

**理由**：这些是 milkup/PureMark 已经实现且对外效果稳定的核心 NodeView，直接搬过来即可。`milkup/src/core/nodeviews/` 目录的代码可整体复制并按 Steno 的依赖路径（`@/utils/...`）调整 import。

### 决策 6：v-model 双向绑定通过 `dispatchTransaction` 实现

**选择**：在 `MarkdownEditor.vue` 中：

1. `props.modelValue` 变化 → `watch` → 用 `parser.parse(next)` 解析为新 Node → `view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content))`
2. 编辑器内每次 transaction → `dispatchTransaction(tr) → view.updateState(view.state.apply(tr))` 后取 `serializer.serialize(view.state.doc)` → `emit('update:modelValue', md)`

**防死循环**：与现有 CodeMirror 版本相同思路 —— 设 `suppressNextDocSync` 标志，由 `watch` 触发的 dispatch 跳过本次 emit。

**性能**：每次 keystroke 都序列化整篇文档可能在大文档下卡顿；引入 **节流** —— `emit('update:modelValue', md)` 经 `requestAnimationFrame` 节流 + 文档变更标记，光标移动不触发序列化。

### 决策 7：scrollToLine 改为 line → ProseMirror Pos 转换

**选择**：保留 `scrollToLine(line: number)` API 供大纲跳转使用。实现：

1. 调 serializer 把当前 Node 树序列化为 Markdown 字符串
2. 按 `\n` 切分定位到目标行的字符 offset
3. 用 ProseMirror 的 `resolvePos` / `doc.descendants` 找到对应的 ProseMirror pos
4. `view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)).scrollIntoView())`

**理由**：保持 `useMarkdownOutline` 与 `DocumentOutlineTree` 已有的"按行号跳转"契约不变，避免级联改动。

### 决策 8：图片粘贴沿用现有 db.savePastedImage 通道

**选择**：在 `createPastePlugin()` 中暴露 `onImagePaste(dataUrl): Promise<string>` 回调，`MarkdownEditor.vue` 把回调透传给 `db.savePastedImage`，与当前 CodeMirror 版本完全一致的行为。

**理由**：Steno 后端的图片存储逻辑（`db.savePastedImage`）已稳定运行，无理由更换。只换前端编辑器内核，不动数据通道。

### 决策 9：样式表用 milkup 的 css 抽取并改写为 --app-* 变量

**选择**：新增 `src/styles/markdown-editor.css`，从 milkup `src/core/styles/*.css`（如 puremark.css 同源）抽取编辑器域样式（`.ProseMirror`、`.ProseMirror h1`、`.ProseMirror blockquote` 等），所有颜色映射到 `--app-bg / --app-fg / --app-faint / --app-accent / --app-border / --app-code-bg / --app-inline-code-fg` 等已有变量；缺失的变量在 `src/theme/index.ts` 中补齐。

**理由**：与最近完成的 redesign-markdown-rendering-pipeline 共用主题变量，保证编辑视图与只读视图视觉一致。

### 决策 10：渐进式迁移 + 单 Phase 单 Commit

**选择**：迁移分 11 个 Phase，每 Phase 完成后立即 `git commit`，方便回滚：

| Phase | 内容 | 关键产出 |
|---|---|---|
| 0 | 依赖安装 + 目录骨架 | 11 个 `prosemirror-*` 包；`src/components/markdown-editor/core/` 空文件骨架 |
| 1 | schema 定义 | `core/schema/index.ts` |
| 2 | parser 实现 | `core/parser/index.ts` + 单测 |
| 3 | serializer 实现 | `core/serializer/index.ts` + round-trip 单测 |
| 4 | 基础插件 + 编辑器装配 | `core/editor.ts` + history/keymap/placeholder/inputrules |
| 5 | instant-render 插件 | `core/plugins/instant-render.ts` + Decoration 行为单测 |
| 6 | NodeView 第一组：code-block + image | `core/nodeviews/{code-block,image}.ts`，shiki/mermaid/KaTeX 接入 |
| 7 | NodeView 第二组：list + task + math/html block | `core/nodeviews/{list,math-block,html-block}.ts` |
| 8 | paste plugin + keymap 体系 | `core/plugins/paste.ts` + `core/keymap/index.ts`（粗体/斜体/链接/代码等快捷键） |
| 9 | 样式表 markdown-editor.css | `src/styles/markdown-editor.css` + 主题变量补齐 |
| 10 | 替换 `MarkdownEditor.vue` + 移除 CodeMirror 依赖 | 改写 `MarkdownEditor.vue` + 删除 `markdown-editor/{extensions,keymap,live-render}.ts` + `pnpm remove @codemirror/*` |
| 11 | 测试 + 验证 + 文档 | 全套 vitest / typecheck / lint，手动 `pnpm tauri dev` 验证 |

**理由**：每 Phase 自包含、可单独测试、可独立回滚；且与 milkup 项目目录结构基本对应，降低实现期的认知负担。

## Risks / Trade-offs

- **依赖数量上涨** → 11 个 prosemirror-* 包，预期 bundle +120 KB（gzip 约 40 KB），但同时移除 CodeMirror 全家桶（约 -150 KB gzip），**净体积下降**
- **大文档性能**：每次 keystroke 序列化整篇文档会卡顿 → 用 RAF 节流 emit + 仅在文档实质变化时序列化；测试覆盖 10k 字符文档的输入延迟
- **parser/serializer 不对称导致 round-trip 失真**：用户输入 → parse → serialize 后丢字符 → 影响保存 → 加严格的 round-trip 单测覆盖所有语法，确保 `serialize(parse(md)) === md`（最少在常用语法上保持字符级不变）
- **CodeMirror 的图片粘贴 / 大纲跳转 / autosave 等关联功能受影响**：通过保留 props 与 expose 接口不变，把改动局限在 `MarkdownEditor.vue` 内部；NoteEditorView、FloatingEditor 等调用方不需要任何修改
- **CSS 命名冲突**：ProseMirror 默认根 class `.ProseMirror` 容易与既有样式冲突 → 在 `markdown-editor.css` 中只通过 `.steno-pm-editor .ProseMirror ...` 作用域包裹，避免污染
- **不支持的 Markdown 边角语法**：自建 parser 可能未覆盖所有 CommonMark 边角（如 reference link、footnote）→ 先覆盖 milkup parser 已支持的子集 + 图二涉及的语法；CommonMark 严格符合度留作后续 polish
- **快捷键冲突**：当前 CodeMirror keymap 与 ProseMirror baseKeymap 行为不完全一致（如 Tab 缩进、Enter 换行规则） → 按 milkup keymap 实现 + 在 `markdownKeyBindings` 中显式覆盖必要项；手动 verification 阶段重点验证
- **撤销栈语义差异**：CodeMirror 的撤销栈按字符，ProseMirror 按 transaction → 用户连续输入再 Ctrl+Z 可能撤销粒度不同 → ProseMirror 默认行为已与 Typora、Notion 等主流 WYSIWYG 一致，可接受
- **测试基础设施**：vitest + jsdom 中跑 ProseMirror 测试需要额外的 `prosemirror-test-builder` 或自行构造 view → 优先用 builder helpers，避免每个测试都 mount DOM
- **回滚成本高于决策 9 提到的"低风险"**：CodeMirror 与 ProseMirror 是两套独立内核，单 Phase 回滚容易，全量回滚需 revert 多个 commit；通过 11 个独立 commit 控制粒度，单 Phase 出问题可立即回滚不影响已完成阶段

## Migration Plan

按上述 11 个 Phase 实施，每个 Phase 完成后做：

1. `pnpm typecheck`（vue-tsc 必须通过）
2. `pnpm test`（vitest 必须通过，含新增 spec）
3. `pnpm lint`（0 errors，warnings 可后续清理）
4. `git add -A && git commit -m "feat(markdown-editor): Phase N — <中文描述>"`

**回滚策略**：
- 单 Phase 出问题 → `git revert HEAD`
- 多 Phase 累积问题 → `git revert <range>`
- 极端情况全部回滚 → `git reset --hard <PRE_PHASE_0_SHA>`（不推荐，但保留作为兜底）

**手动验证清单**（Phase 11）：
- 输入 `# 标题` + 回车 → 立即渲染为 H1 + 进入 H1 行显示 `#` 标记
- 输入 `>foo` （无空格） → 立即渲染为 blockquote
- 输入 `- a` + 回车 + `- v` → 渲染为带圆点的列表，光标进入显示 `-`
- 输入 `|A|B|` + 回车 + `|--|--|` + 回车 + `|a|b|` → 渲染为表格
- 输入 `---` + 回车 → 渲染为 `<hr>`
- 输入 `[a](hh)` → 渲染为蓝色链接，光标进入显示原文
- 输入 `<u>Phase 4</u>` → 渲染为下划线，光标进入显示原文
- 复制纯 Markdown 文本 → 粘贴 → 立即解析为对应 Node
- 粘贴图片 → 触发 `db.savePastedImage` → 插入 `![](asset://...)`
- 大纲点击标题 → 编辑器滚动到对应位置
- `Ctrl+B` / `Ctrl+I` / `Ctrl+K` 等快捷键正常工作
- 暗色模式切换 → 所有节点（含 code-block、blockquote、列表）正确换色

## Open Questions

1. **prosemirror-tables 是否引入**：milkup 自实现了表格 schema 与命令，未用官方 `prosemirror-tables`。考虑表格编辑器复杂度（增删行列、合并单元格），建议**先按 milkup 自实现 + 后续按需引入 prosemirror-tables**（防止 bundle 过大）。
2. **shiki/mermaid 在 NodeView 中的异步加载策略**：milkup 通过 `nodeview` 的 `update` 钩子异步渲染。Steno 已有 `src/utils/markdown/shiki.ts` 单例，可直接复用；mermaid 同理。Phase 6 实施期间确认 API 兼容性。
3. **Editor i18n**：milkup 自带 i18n（中英），Steno 已有 `src/i18n/`，按 Steno 风格在 keymap、ContextMenu 等处接入。Phase 8 解决。
4. **MarkdownRichEditor.vue / MarkdownSourceEditor.vue 是否需要同步迁移**：当前这两个组件状态不明（看起来是占位/草稿）。先以 `MarkdownEditor.vue` 为唯一焦点，验证完成后再决定是否传播到 RichEditor / SourceEditor。
5. **测试 fixture**：parser/serializer 测试用例可从 milkup 的 `__tests__` 直接搬入（milkup 用 vitest，工具链兼容）。Phase 2/3 实施时确认 milkup 是否有公开的 test 文件可参考。
