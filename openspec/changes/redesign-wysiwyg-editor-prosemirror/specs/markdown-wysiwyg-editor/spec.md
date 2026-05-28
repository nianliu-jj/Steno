## ADDED Requirements

### Requirement: 编辑器与只读面板 MUST 共用同一 ProseMirror 内核
Steno SHALL 为 Markdown 编辑态 (`MarkdownEditor.vue`) 与只读态 (`MarkdownReadSurface.vue`) 提供同一个 ProseMirror EditorView 内核与同一套 schema / parser / serializer / nodeviews，仅通过 `editable` 标志区分两种模式。

#### Scenario: 编辑态与只读态展示同一 Markdown
- **WHEN** 同一份 Markdown 内容分别在编辑器与只读面板中渲染
- **THEN** 系统 MUST 在两侧产生结构等价的 DOM（节点类型、层级、文本一致）
- **AND** 视觉差异 SHALL 仅源于 `contenteditable` 属性及光标显示

#### Scenario: 只读态禁止结构编辑
- **WHEN** 用户在 `MarkdownReadSurface` 中尝试输入文字或按 Backspace
- **THEN** 系统 MUST 不应用任何文档变更
- **AND** EditorView SHALL 报告 `editable === false`

### Requirement: 编辑态 MUST 提供 Typora 风格 WYSIWYG 渲染
Steno SHALL 在编辑态把 Markdown 源文本直接呈现为渲染后的样式，并在光标进入对应文本节点时显示该节点的语法标记符号、离开后隐藏。

#### Scenario: 标题段落渲染
- **WHEN** 编辑态文档包含 `# 标题`、`## 二级`、`### 三级` 行
- **THEN** 系统 SHALL 分别渲染为 `<h1>`、`<h2>`、`<h3>` 视觉样式
- **AND** 当光标不在该行时 MUST 隐藏 `#` / `##` / `###` 标记
- **AND** 当光标进入该行时 MUST 重新显示标记

#### Scenario: 行内强调渲染
- **WHEN** 文档包含 `**粗体**`、`*斜体*`、`~~删除~~`、`==高亮==`、`` `code` ``
- **THEN** 系统 SHALL 分别渲染为加粗、斜体、删除线、高亮、行内代码 chip
- **AND** 当光标不在该段标记内时 MUST 隐藏定界符号

### Requirement: 块级语法 MUST 覆盖 GFM 子集
Steno SHALL 在编辑器与只读面板中识别并渲染以下块级 Markdown 语法：标题（ATX h1-h6）、blockquote（含无空格 `>foo`）、bullet list (`-` / `*` / `+`)、ordered list (`1.` 等)、task list (`- [ ]` / `- [x]`)、水平分隔线 (`---` / `***` / `___`)、GFM 表格、围栏代码块（带语言标签）、KaTeX 块级公式 (`$$...$$`)、Mermaid 块、HTML block。

#### Scenario: 无序列表渲染为 bullet
- **WHEN** 文档包含连续 `- a` / `- v` 行
- **THEN** 系统 SHALL 渲染为 `<ul>` + 两个 `<li>`
- **AND** 列表标记 SHALL 显示为圆点而非字面 `-`

#### Scenario: GFM 表格渲染为 grid
- **WHEN** 文档包含
  ```
  |A | B |
  |--|---|
  |a | b |
  ```
- **THEN** 系统 SHALL 渲染为 `<table>` + `<thead>` + `<tbody>`，列对齐遵循分隔行
- **AND** 字面管道符 `|` SHALL 不出现在最终 DOM 文本中（光标不在表格内时）

#### Scenario: 水平分隔线
- **WHEN** 文档单独一行为 `---` / `***` / `___`
- **THEN** 系统 SHALL 渲染为 `<hr>` 节点

#### Scenario: 任务列表勾选
- **WHEN** 文档包含 `- [ ] 待办`、`- [x] 已办`
- **THEN** 系统 SHALL 在 list item 前渲染原生复选框
- **AND** 用户勾选/取消时 MUST 立即同步源 Markdown 文本中的 `[ ]` ↔ `[x]`

#### Scenario: 无空格 blockquote
- **WHEN** 文档行以 `>foo` 起始（`>` 后无空格）
- **THEN** 系统 SHALL 识别为 blockquote 并渲染为带左竖线的引用块

### Requirement: 行内语法 MUST 覆盖链接、图片与内联 HTML
Steno SHALL 在编辑器与只读面板中识别并渲染以下行内 Markdown 元素：链接 (`[text](url)`)、自动链接 (`<https://...>`)、图片 (`![alt](src)`)、删除线 (`~~text~~`)、高亮 (`==text==`)、行内代码 (`` `code` ``)、行内 KaTeX (`$expr$`) 与白名单内联 HTML 标签。

#### Scenario: 链接渲染为可点击
- **WHEN** 文档包含 `[a](hh)`
- **THEN** 系统 SHALL 渲染为带 `href="hh"` 的 `<a>`，显示为主题色文本
- **AND** 在只读态点击该链接 MUST 触发链接打开（受 Tauri shell allowlist 控制）

#### Scenario: 内联 HTML 标签按白名单渲染
- **WHEN** 文档包含 `<u>Phase 4</u>`、`<mark>注意</mark>`、`<del>过期</del>`、`<kbd>Ctrl+S</kbd>`
- **THEN** 系统 SHALL 渲染为对应原生 HTML 标签
- **AND** 任何带 `on*` 事件属性、`javascript:` / `vbscript:` / `data:` 协议的属性 MUST 被剥离

#### Scenario: 非白名单 HTML 标签按文本输出
- **WHEN** 文档包含 `<script>alert(1)</script>` 或 `<iframe src="...">`
- **THEN** 系统 MUST 不创建对应节点
- **AND** SHALL 把原始字符以文本形式呈现（或剥离）

#### Scenario: 图片相对路径解析
- **WHEN** 文档包含 `![pic](./img/a.png)` 且当前笔记位于 Tauri data dir
- **THEN** 系统 SHALL 把相对路径转换为可加载的 Tauri asset URL 后再渲染
- **AND** 图片加载失败时 MUST 显示占位框，不破坏文档结构

### Requirement: 代码块 MUST 提供语言高亮与复制能力
Steno SHALL 在围栏代码块 NodeView 中提供 CodeMirror 6 编辑体验、Shiki 双主题语法高亮（出口 HTML），以及"复制"操作。

#### Scenario: 围栏代码块编辑
- **WHEN** 用户在 ``` ```ts ``` 围栏块内输入代码
- **THEN** 系统 SHALL 在 NodeView 内以 CodeMirror 6 视图承载该代码
- **AND** 切换主题时 MUST 同步切换代码块配色

#### Scenario: 复制代码块内容
- **WHEN** 用户点击代码块右上角"复制"按钮
- **THEN** 系统 SHALL 将该代码块的源文本（不含围栏 ``` ``` 与语言标签）写入剪贴板
- **AND** SHALL 在按钮上短暂显示"已复制"反馈

### Requirement: 数学公式与 Mermaid MUST 在 NodeView 中渲染
Steno SHALL 通过 NodeView 调用 KaTeX 渲染行内/块级数学公式，调用 Mermaid 渲染 ``` ```mermaid ``` 块。

#### Scenario: 块级公式渲染
- **WHEN** 文档包含 `$$ E = mc^2 $$` 块
- **THEN** 系统 SHALL 在 NodeView 中渲染 KaTeX HTML
- **AND** 光标进入该 NodeView 时 MUST 切换回可编辑的源 LaTeX 文本

#### Scenario: Mermaid 渲染失败回退
- **WHEN** Mermaid 源码语法错误
- **THEN** 系统 SHALL 在 NodeView 中显示错误信息与原始源码
- **AND** MUST 不抛出未捕获异常导致编辑器崩溃

### Requirement: 编辑器对外 API MUST 保持向后兼容
Steno SHALL 在迁移内核的同时保持 `MarkdownEditor.vue` 与 `MarkdownReadSurface.vue` 既有的 props / emits / exposed 方法契约。

#### Scenario: MarkdownEditor v-model 双向绑定
- **WHEN** 父组件以 `v-model:modelValue` 绑定字符串
- **THEN** 系统 SHALL 在用户编辑时通过 `update:modelValue` 事件回传最新 Markdown 文本
- **AND** 外部 `modelValue` 变更时 MUST 同步到编辑器视图，且不进入更新死循环

#### Scenario: MarkdownEditor 暴露 focus 与 scrollToLine
- **WHEN** 父组件调用 `markdownEditorRef.focus()` 或 `markdownEditorRef.scrollToLine(n)`
- **THEN** 系统 SHALL 把焦点放回编辑器
- **AND** 当 `n` 在文档范围内时 MUST 把视口滚动到 `n` 行对应的块级节点

#### Scenario: MarkdownReadSurface 暴露 scrollToHeading
- **WHEN** 父组件调用 `markdownReadSurfaceRef.scrollToHeading('heading-3')`
- **THEN** 系统 SHALL 找到第 4 个标题节点并将其滚动到视口顶部
- **AND** 当 id 不存在时 MUST 保持当前滚动位置不变

### Requirement: 出口 HTML MUST 经 DOMPurify 清洗
Steno SHALL 在将 ProseMirror 文档转换为剪贴板 HTML 或导出 HTML 时，统一通过现有 DOMPurify 配置过滤危险标签与属性。

#### Scenario: 复制选区到剪贴板
- **WHEN** 用户在编辑器或只读面板中选中含 `<u>` / 链接 / 图片的内容并按 Ctrl+C
- **THEN** 系统 SHALL 在 `text/html` 通道写入 DOMPurify 清洗后的 HTML
- **AND** SHALL 在 `text/plain` 通道写入对应 Markdown 文本

#### Scenario: 粘贴外部 HTML
- **WHEN** 用户粘贴 `<u>x</u><script>...</script>`
- **THEN** 系统 MUST 在写入文档前移除 `<script>` 节点
- **AND** SHALL 保留白名单内的 `<u>` 节点

### Requirement: 数据持久化 MUST 保持纯 Markdown
Steno SHALL 在数据库与磁盘 `.md` 文件中始终以原始 Markdown 字符串保存内容，不引入 ProseMirror 自有的 JSON / XML 序列化格式。

#### Scenario: 编辑后自动保存的内容
- **WHEN** 用户在编辑器中修改文档并触发自动保存
- **THEN** 系统 SHALL 调用 serializer 输出 Markdown 字符串
- **AND** 持久化层 MUST 收到的是 Markdown，而非 ProseMirror JSON

#### Scenario: parser/serializer 来回一致
- **WHEN** 任意一份典型 Markdown 输入经过 `parse(md) → serialize(doc) → roundtripped`
- **THEN** 系统 SHALL 满足 `roundtripped === md`（语义等价；对空白/转义有明确归一化规则）
- **AND** 测试用例 MUST 覆盖标题、列表、表格、代码块、HTML inline、math、链接、图片

### Requirement: 旧 CodeMirror live-render 内核 MUST 被移除
Steno SHALL 在迁移完成后从代码库中删除 `src/components/markdown-editor/live-render.ts` 及其测试，避免双内核并存造成维护负担。

#### Scenario: 仓库不再包含旧 live-render 代码
- **WHEN** 在仓库根目录搜索 `live-render.ts`
- **THEN** 结果 MUST 不存在该文件
- **AND** 任何 import 该文件的代码 SHALL 已被清理或替换
