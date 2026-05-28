## ADDED Requirements

### Requirement: Steno MUST 通过 markdown-it 渲染笔记预览面板的 Markdown 源文本

Steno SHALL 使用 markdown-it 作为唯一的 Markdown 渲染内核，处理只读预览（read mode）下笔记正文的 GFM 基础语法。系统 MUST NOT 在生产构建中保留 `marked` 依赖。

#### Scenario: 渲染包含 GFM 基础元素的 Markdown

- **WHEN** 用户切换到笔记预览（read mode）查看包含标题、段落、列表、引用、表格、删除线、分割线的 Markdown 源
- **THEN** 系统 SHALL 将其渲染为对应的 HTML（`<h1>-<h6>`、`<p>`、`<ul>/<ol>/<li>`、`<blockquote>`、`<table>`、`<del>`、`<hr>`）
- **AND** 系统 MUST 保留每个块元素的语义结构（不丢失嵌套层级与顺序）

#### Scenario: 渲染任务列表

- **WHEN** Markdown 源包含 `- [ ] 未完成` 与 `- [x] 已完成`
- **THEN** 系统 SHALL 渲染为带 `<input type="checkbox">` 的列表项
- **AND** 已完成项 SHALL 处于勾选状态
- **AND** 预览面板中的复选框 MUST 是只读的（点击不更改源文档）

#### Scenario: 渲染标题锚点

- **WHEN** Markdown 源包含 `## 二级标题`
- **THEN** 渲染产物中对应的 `<h2>` MUST 带有由标题文本派生的 `id` 属性
- **AND** 该 `id` SHALL 与 `useMarkdownOutline` 现有的锚点跳转规则保持一致

### Requirement: Steno MUST 对围栏代码块提供带主题的语法高亮

Steno SHALL 使用 Shiki 对围栏代码块进行语法高亮，输出与当前应用主题（light / dark）对应的配色，并附带语言标签、行号与复制按钮。

#### Scenario: 渲染带语言标识的代码块

- **WHEN** Markdown 源包含 ```` ```javascript ... ``` ````（或其它已注入语言）
- **THEN** 渲染产物 SHALL 包含一个 `<pre class="shiki"><code>` 容器
- **AND** 容器顶部 SHALL 显示该语言名称的标签（如 `javascript`）
- **AND** 代码内部 SHALL 按对应语言的语法 token 着色

#### Scenario: 未注入语言的代码块降级

- **WHEN** 围栏代码块未声明语言（```` ``` ```` 直接开始）或声明了高亮器不支持的语言
- **THEN** 系统 SHALL 仍然将其渲染为 `<pre><code>` 结构
- **AND** 内部文本 MUST 经过 HTML 转义（不被解析为标签）
- **AND** 不得抛出运行时错误中断整篇渲染

#### Scenario: 代码块显示行号

- **WHEN** 任意围栏代码块被渲染
- **THEN** 行号 SHALL 出现在代码每一行的左侧
- **AND** 行号样式 MUST 不影响原始代码内容的选择与复制

#### Scenario: 复制代码块内容

- **WHEN** 用户点击代码块右上角的复制按钮
- **THEN** 系统 SHALL 把该代码块的原始文本（不含行号、不含高亮 HTML）写入系统剪贴板
- **AND** 按钮 SHALL 短暂显示「已复制」反馈，2 秒后恢复原样

#### Scenario: 代码块跟随主题切换

- **WHEN** 应用主题在亮/暗模式之间切换
- **THEN** 已渲染的代码块 SHALL 立即呈现对应主题（github-light / github-dark）的配色
- **AND** 切换 MUST NOT 触发整篇 Markdown 的重新解析

### Requirement: Steno MUST 渲染 KaTeX 数学公式

Steno SHALL 通过 KaTeX 渲染 Markdown 中的行内与块级数学公式。

#### Scenario: 渲染行内公式

- **WHEN** Markdown 源包含 `$E = mc^2$`
- **THEN** 渲染产物 SHALL 在对应位置出现由 KaTeX 生成的 `<span class="katex">...</span>`
- **AND** 该公式 MUST 在亮/暗主题下都保持可读

#### Scenario: 渲染块级公式

- **WHEN** Markdown 源包含使用 `$$ ... $$` 包裹的多行公式
- **THEN** 渲染产物 SHALL 输出居中的 `<span class="katex-display">`
- **AND** 当公式超出容器宽度时 MUST 允许水平滚动而不破坏页面布局

#### Scenario: 公式语法错误降级

- **WHEN** Markdown 包含 KaTeX 无法解析的语法（如未闭合的 `\frac{1`）
- **THEN** 系统 SHALL 以红色文本呈现错误原文，不抛异常
- **AND** 其它合法内容 MUST 继续正常渲染

### Requirement: Steno MUST 渲染 Mermaid 图表

Steno SHALL 通过 Mermaid 渲染 ```` ```mermaid ```` 围栏代码块，并使图表配色跟随应用主题。

#### Scenario: 渲染合法 mermaid 流程图

- **WHEN** Markdown 源包含 ```` ```mermaid\nflowchart TD;A-->B;\n``` ````
- **THEN** 系统 SHALL 在该位置输出由 Mermaid 渲染的 SVG 图
- **AND** SVG 的节点、连线、文字颜色 SHALL 从应用当前主题的 `--app-*` 变量派生

#### Scenario: mermaid 主题切换重渲染

- **WHEN** 应用主题在亮/暗模式之间切换
- **THEN** 预览面板内所有 mermaid 图 SHALL 重新渲染为对应主题的配色
- **AND** 重渲染 MUST 不破坏当前滚动位置

#### Scenario: mermaid 语法错误降级

- **WHEN** mermaid 源包含语法错误
- **THEN** 系统 SHALL 在该位置显示包含错误信息的提示框
- **AND** 其它合法内容 MUST 继续正常渲染

### Requirement: Steno MUST 对 Tauri 笔记的相对图片路径自动转换

Steno SHALL 将 Markdown 中相对路径的 `<img>` `src` 解析为 Tauri 可访问的 asset 协议 URL。

#### Scenario: 渲染相对路径图片

- **WHEN** 笔记为 `document` 类型且其源 Markdown 包含 `![alt](./assets/a.png)`
- **THEN** 系统 SHALL 将相对路径基于该笔记所在目录拼接为绝对路径，再通过 `convertFileSrc` 转换为 `asset://` URL
- **AND** 渲染产物 SHALL 输出 `<img src="asset://..." alt="alt">` 可正常显示图片

#### Scenario: 保留绝对路径与远程图片

- **WHEN** Markdown 包含 `https://`、`http://`、`data:`、`blob:`、`asset:`、`tauri:` 等已含 scheme 的 `src`
- **THEN** 系统 MUST 原样保留 `src` 不做转换

#### Scenario: 无目录上下文时的回退

- **WHEN** 笔记为 `text` 类型（无落盘目录）且 Markdown 包含相对路径图片
- **THEN** 系统 SHALL 原样保留相对路径
- **AND** 不得因为缺失目录而中断整篇渲染

### Requirement: Steno MUST 在渲染产物上执行 XSS 过滤

Steno SHALL 在把渲染结果交给 `v-html` 注入 DOM 之前对其执行 DOMPurify 过滤，并保留代码高亮、KaTeX、Mermaid 所需的标签与属性。

#### Scenario: 移除危险脚本

- **WHEN** Markdown 源包含 `<script>alert(1)</script>` 或 `<img src=x onerror=alert(1)>`
- **THEN** 渲染产物 MUST 不包含可执行的 `<script>` 标签
- **AND** MUST NOT 保留 `on*` 事件属性

#### Scenario: 保留高亮、公式与图表所需结构

- **WHEN** 渲染产物含有 Shiki 输出的 `<span style="color: #...">`、KaTeX 输出的 `<span class="katex">...<math>...`、Mermaid 占位与 SVG
- **THEN** 系统 MUST 保留这些标签、属性及内部结构不被过滤掉

### Requirement: Steno MUST 让 Markdown 渲染样式跟随应用主题变量

Steno SHALL 把 Markdown 预览面板的所有视觉样式绑定到 `--app-*` CSS 变量，禁止在样式表中使用硬编码颜色。

#### Scenario: 亮/暗模式切换文本颜色

- **WHEN** 用户在亮模式与暗模式之间切换
- **THEN** 预览面板的正文文字、标题、引用块、行内代码、链接、表格边框 SHALL 立即采用当前主题对应的 `--app-*` 颜色值
- **AND** MUST NOT 出现因硬编码颜色导致的文字与背景对比度过低

#### Scenario: 引用块视觉风格

- **WHEN** 渲染 `> ...` 引用块
- **THEN** 引用块 SHALL 显示左侧 `--app-accent` 颜色的边框（约 3-4px 宽）
- **AND** 背景 SHALL 使用 `--app-bg` 的次级色阶
- **AND** 文字 SHALL 使用 `--app-fg` 的次级色阶

#### Scenario: 行内代码视觉风格

- **WHEN** 渲染行内代码 `` `code` ``
- **THEN** 代码 SHALL 以圆角背景与边框呈现
- **AND** 颜色 SHALL 与截图所示「紫红色感」一致（使用 `--app-accent` 或派生变量）

### Requirement: Steno SHALL 提供高亮（==text==）扩展语法

Steno SHALL 渲染 `==高亮文本==` 为带强调背景的 `<mark>` 元素。

#### Scenario: 高亮文本渲染

- **WHEN** Markdown 源包含 `==重要==`
- **THEN** 渲染产物 SHALL 输出 `<mark>重要</mark>` 或等价结构
- **AND** 该元素背景色 SHALL 为 `--app-accent` 派生的浅色调，文字保持可读对比

### Requirement: useMarkdown.renderHtml MUST 保持同步签名

`useMarkdown.renderHtml(content: string)` SHALL 是一个同步函数，返回可直接交给 `v-html` 的字符串。所有异步副作用（mermaid、复制按钮挂载）MUST 由调用组件在 `onMounted` / `watchEffect` 中接管。

#### Scenario: 调用方零修改地获得新效果

- **WHEN** 现有调用方（如 `MarkdownReadSurface.vue`、`MarkdownRichEditor.vue`）以原签名 `renderHtml(content)` 调用
- **THEN** 系统 SHALL 返回与原签名兼容的字符串
- **AND** 不得要求调用方改为 `await`
