## Context

Steno 是基于 Tauri 2 + Vue 3 的桌面速记/笔记应用，主要内容载体是 Markdown 笔记（`text` 直存数据库，`document` 落盘 .md 文件）。现有渲染链路为 `MarkdownReadSurface.vue` → `useMarkdown.renderHtml(content)` → `marked.parse(content)` → `v-html`，无任何插件或预处理，主要问题如截图与现状报告所述：

- 无代码高亮、无 KaTeX、无 Mermaid、无 sanitization
- 样式硬编码（如 `color: #2a2a2a`），不跟主题
- `markdown-it@14` 已在 `package.json` 但未启用，属于冗余依赖

参考项目 `D:\Markdown项目\PureMark` 是一个 Tauri+Vue3 的"即时渲染编辑器"（ProseMirror 自研内核），其 ProseMirror 体系无法直接搬到 Steno 的只读渲染场景，但 **CSS 样式表、代码高亮 token 配色、Mermaid 主题派生函数、Tauri 图片路径插件** 都是高质量、可复用的资产。

本次改动只关心"笔记预览面板"（read mode）的渲染管线。编辑侧基于 CodeMirror 6 + Lezer 的 live-render 装饰已工作良好，不在本次范围内。

## Goals / Non-Goals

**Goals:**
- 重写只读 Markdown 渲染管线，达到截图所示的视觉与功能水准
- 支持：GFM 基础、围栏代码块语法高亮（双主题、行号、复制按钮、语言标签）、KaTeX 行内/块级公式、Mermaid 图表、任务列表、标题锚点、`==高亮==`、Tauri 相对图片
- 跟随项目主题切换：亮/暗模式下代码块、Mermaid、行内代码、引用块全部正确换色
- 提供 XSS 防护
- 保持 `useMarkdown.renderHtml(content)` 的对外签名不变，使所有调用方（`MarkdownReadSurface.vue`、`MarkdownRichEditor.vue` 等）无需级联改动

**Non-Goals:**
- 不改动 `MarkdownEditor.vue` 与 `markdown-editor/live-render.ts`（编辑器 WYSIWYG）
- 不引入 ProseMirror / Tiptap 即时渲染编辑器
- 不实现 Markdown 编辑器内的 KaTeX/Mermaid 实时预览（编辑侧不渲染）
- 不做服务端渲染、不做笔记导出（导出后续单独 change 处理）
- 不引入 Tailwind Typography 等第三方 prose 样式包；样式由本次自管的 `markdown-render.css` 提供

## Decisions

### 决策 1：渲染内核选 markdown-it，移除 marked

**选择**：以 `markdown-it@14` 替换 `marked@16` 作为唯一渲染器。

**理由**：
- `markdown-it` 已在 `package.json` 中作为冗余依赖，启用它正好消除冗余
- 插件生态远胜 marked：`@vscode/markdown-it-katex`、`markdown-it-task-lists`、`markdown-it-anchor`、`markdown-it-container` 等开箱即用
- 渲染器可读、可重写（暴露 `renderer.rules`），便于在 `fence` 中接管 mermaid / shiki，在 `image` 中接管 Tauri 路径
- 性能与 marked 同量级，不构成瓶颈

**备选**：
- 保留 marked：插件需要自己包装（marked-katex-extension / marked-highlight），定制 fence 渲染要写 walkTokens，比 markdown-it 的 `renderer.rules.fence` 啰嗦
- 切到 unified/remark：PureMark 也只是声明未用，工具链复杂、对小项目过度工程

### 决策 2：代码高亮用 shiki（同步渲染版本）

**选择**：使用 `shiki@^1` 的 `createHighlighter`（同步 API），预加载 `github-light` + `github-dark` 双主题及常用语言子集（约 25 种）。

**理由**：
- shiki 基于 VS Code TextMate 语法，渲染效果接近截图，配色高保真
- shiki 输出原生 HTML（`<pre class="shiki"><code><span style="color: ..."></span></code></pre>`），可直接被 markdown-it 的 `fence` rule 替换，无需 hydration
- 双主题输出（`themes: { light, dark }`）让一次渲染产物可在两种模式间切换：通过 CSS 变量 `--shiki-light` / `--shiki-dark` + 根类切换，零运行时成本
- shiki 异步初始化的问题：在 app 启动时（`main.ts`）即开始 warmup `await getHighlighter()`，并缓存在 `markdown/shiki.ts` 模块单例中；渲染时为同步路径

**备选**：
- highlight.js：体积小、同步，但配色弱、不支持双主题输出
- prismjs：旧、维护弱
- 同步 + 异步双轨：复杂度高，不必要

### 决策 3：数学公式用 KaTeX + `@vscode/markdown-it-katex`

**选择**：`katex` + `@vscode/markdown-it-katex`（VS Code 同款配置，支持 `$...$` 与 `$$...$$`，对 `\$` 转义友好）。

**理由**：
- KaTeX 同步、纯客户端、速度快、体积小（~270KB）
- `@vscode/markdown-it-katex` 维护活跃、与 markdown-it 内核行为兼容
- 与 PureMark 一致（PureMark 也用 katex）

**备选**：MathJax 体积大、SSR 复杂；temml 输出 MathML，浏览器原生支持不全。

### 决策 4：Mermaid 走「fence 占位 → onMounted 异步渲染」两段式

**选择**：markdown-it 渲染时把 ```` ```mermaid ```` 输出为 `<pre class="mermaid-placeholder" data-source="<encoded>"></pre>`；`MarkdownReadSurface.vue` 的 `onMounted` / `watchEffect` 内动态 `import('mermaid')` 然后遍历这些占位节点调用 `mermaid.render`。

**理由**：
- 渲染入口 `useMarkdown.renderHtml` 保持同步签名
- mermaid 体积 >800KB，按需异步加载，不影响首屏
- 主题切换时只需重渲染占位节点，不必整篇刷新

**备选**：
- 同步 + 顶层 await：会阻塞模块初始化、Vite 警告
- DOM-based MutationObserver：实现复杂、易死循环

### 决策 5：Mermaid 主题完全由 CSS 变量派生

**选择**：从 PureMark `src/core/nodeviews/code-block.ts:180-288` 抽取 `getMermaidThemeVariables()`，按 Steno 的 `--app-bg / --app-fg / --app-faint / --app-accent / --app-border` 重新映射 mermaid 的 `primaryColor / lineColor / actorBkg / pie1...` 等 token，再以 `themeVariables` 模式传入 `mermaid.initialize()`。

**理由**：保证 mermaid 图随主题切换自动重渲染、颜色统一。

### 决策 6：XSS 过滤用 DOMPurify

**选择**：渲染管线最后一道关卡，对 markdown-it 输出的 HTML 做 `DOMPurify.sanitize(html, { ADD_TAGS: ['svg', 'mermaid', ...], ADD_ATTR: ['style', 'class', 'data-source', ...] })`，白名单中放行 KaTeX `<span>` 树、Mermaid 占位节点与 shiki `<span style="color: #...">`。

**理由**：marked 16 已弃 sanitizer，markdown-it 默认不防注入；DOMPurify 是行业标准。

**风险**：白名单过紧会破坏 KaTeX/Mermaid。需要在测试用例中覆盖。

### 决策 7：图片路径 Tauri 适配

**选择**：复制 PureMark `src/plugins/imagePathPlugin.ts` 到 `src/utils/markdown/images.ts`，改造为 markdown-it 的 `image` renderer rule。逻辑：

1. 已是绝对 URL（`http(s) | data | blob | asset | tauri | mailto | tel`）→ 原样
2. 相对路径 → 拼接「当前笔记所在目录」绝对路径 → `convertFileSrc(abs)` → 输出 `<img src="asset://...">`
3. 当前笔记目录通过 `useMarkdown(noteDir)` 参数注入（已是 ref/string）

**风险**：`text` 类型条目不落盘，没有目录；此时 `noteDir` 为空，相对路径图片直接保留原始 `src`（由 marked 时的现状一致）。

### 决策 8：样式表组织

**选择**：新增 `src/styles/markdown-render.css`，从 PureMark `puremark.css` 抽取「与编辑器无关」的规则——主要是 `.markdown-body` 域下的：

- 标题层级（h1-h6 字号、间距、border-bottom）
- 段落 / blockquote / hr / ul/ol/li / task list
- inline code（紫红渐变背景 + 边框 + 阴影）
- 链接 / 图片 / 表格 / KaTeX overflow
- `.shiki` 代码块容器、header、行号 gutter
- `.markdown-highlight`（`==text==`）

所有颜色映射到 `--app-*` 变量，新增缺失的语义变量（如 `--app-code-bg`、`--app-inline-code-fg`）。文件直接在 `MarkdownReadSurface.vue` 中 `<style src="@/styles/markdown-render.css">` 引入，全局污染由 scoped class `.markdown-body` 包住根节点防止溢出。

## Risks / Trade-offs

- **包体积上涨**：shiki + katex + mermaid 总计约 1.5-2MB（gzip 后约 500KB-700KB）→ 通过 mermaid 动态 import 减负；shiki 仅注入常用语言（不全量）。
- **shiki warmup 失败**：首次渲染时 highlighter 仍在加载 → 暂时降级为「纯转义 HTML 代码块」（无高亮）；warmup 完成后用户切换视图触发重渲染即可看到高亮。
- **KaTeX 解析报错**：用户写错公式 → KaTeX 在 errorColor 模式输出红色文本而不抛异常；测试覆盖。
- **Mermaid 渲染失败**：错语法 → 显示原始代码 + 错误信息提示；不让整个文档崩溃。
- **DOMPurify 误杀**：白名单需多次校准。建议先放行已知用例（KaTeX 标签集合 + mermaid + shiki span style）。
- **主题热切换**：shiki 双主题输出 + CSS 切换可零成本；mermaid 必须重渲染→ 在 `MarkdownReadSurface` 内监听 `useDark()` 触发重 render，文档大时可能闪烁，可加防抖。
- **代码块复制按钮**：v-html 注入的 HTML 没有 Vue 事件，需要在 `onMounted` 中委托 `document.addEventListener('click')` 或用 `querySelectorAll` 绑定，避免内存泄漏需在 `onBeforeUnmount` 解绑。

## Migration Plan

按 8 个阶段实施，每阶段单独 commit：

1. **依赖与目录** — `pnpm add` 新依赖；`pnpm remove marked`；创建 `src/utils/markdown/` 空文件骨架；新增 `src/styles/markdown-render.css` 空文件。
2. **renderer 核心** — `src/utils/markdown/renderer.ts` 装配 markdown-it 与基础插件（task-lists、anchor、katex），实现 fence/inline-code/image 默认 renderer；不接代码高亮（fallback 转义）。
3. **shiki 高亮** — `shiki.ts` 单例 + 同步 highlighter；fence rule 接管输出 `<pre class="shiki"><code>...</code></pre>` + 行号 + 语言标签。
4. **mermaid 占位 + 异步渲染** — `mermaid.ts` 导出 `processMermaidNodes(root, theme)`；fence 中 `language === 'mermaid'` 输出占位；`MarkdownReadSurface` 调用处理函数。
5. **图片路径** — `images.ts` + `useMarkdown` 接受 `noteDir` 参数。
6. **sanitize** — `sanitize.ts` + `renderHtml` 出口处过滤。
7. **样式表与主题** — 抽取 PureMark CSS，绑 `--app-*` 变量，处理 light/dark 切换。
8. **测试 + 验证** — 单元测试、typecheck、vitest、lint、手动 dev 验证。

**回滚**：每阶段独立 commit，发现问题 `git revert` 单步即可。`useMarkdown.renderHtml` 签名不变保证调用方无破坏。

## Open Questions

1. **shiki 语言子集**：默认带哪些？建议至少 `markdown / javascript / typescript / vue / rust / python / go / shell / json / yaml / html / css / scss / sql / java / kotlin / swift / c / cpp / csharp / php / ruby / mermaid(占位) / diff / xml`（25 种）。等实施期再确认是否够用。
2. **是否启用 markdown-it-container**：截图未明确展示 `:::tip` / `:::warning` 容器，但 PureMark 支持；建议保留插件位但不在本次启用，避免范围蔓延。开放给后续 change。
3. **复制按钮 i18n**："Copy" / "复制" / "已复制" 文案是否走 i18n 系统？建议接入 `src/i18n/`（项目已有 i18n），新增 `markdown.copy*` keys。
4. **代码块默认主题**：跟随系统模式（`useDark`），还是允许用户在「设置→外观」单独配置？默认跟系统；用户配置留作后续 change。
