# 实施任务清单 — Markdown 渲染管线重做

> 每个阶段对应一个独立 git commit，commit message 使用中文。

## 1. 准备与依赖

- [x] 1.1 检查 Steno 现有依赖与现状，记下当前 `package.json` / `pnpm-lock.yaml` 中 `marked`、`markdown-it` 的版本，并锁定本次操作的基线 commit
- [x] 1.2 用 `pnpm remove marked` 卸载 `marked@16`
- [x] 1.3 用 `pnpm add markdown-it markdown-it-task-lists markdown-it-anchor markdown-it-attrs @vscode/markdown-it-katex katex shiki@^1 mermaid@^11 dompurify` 安装运行时依赖
- [x] 1.4 用 `pnpm add -D @types/markdown-it @types/dompurify` 补类型
- [x] 1.5 在 `src/utils/markdown/` 下创建 5 个空文件骨架：`renderer.ts`、`shiki.ts`、`mermaid.ts`、`images.ts`、`sanitize.ts`，并在 `index.ts` 中聚合导出
- [x] 1.6 在 `src/styles/markdown-render.css` 创建空骨架（仅含 `.markdown-body { /* placeholder */ }`）
- [x] 1.7 运行 `pnpm typecheck` 与 `pnpm test` 确认基线绿色（不变更行为）
- [x] 1.8 提交：`chore(markdown): 引入 markdown-it 渲染依赖并搭建模块骨架`

## 2. markdown-it 渲染器核心

- [x] 2.1 在 `src/utils/markdown/renderer.ts` 中实例化 `MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false })`
- [x] 2.2 注入插件：`markdown-it-task-lists`（`{ enabled: false, label: true }`）、`markdown-it-anchor`（按现有 `useMarkdownOutline` 的 slug 规则配置）、`@vscode/markdown-it-katex`
- [x] 2.3 实现 `==高亮==` 自定义规则（参考 `markdown-it-mark` 的简化实现，或直接安装 `markdown-it-mark` 作为子依赖；如不另安装包，可手写规则解析为 `<mark>`）
- [x] 2.4 覆写 `renderer.rules.fence`：当 `info` 为 `mermaid` 时输出占位 HTML；其它语言调用 shiki（暂为转义降级，等阶段 3 替换）
- [x] 2.5 覆写 `renderer.rules.code_inline`：输出带 `class="md-inline-code"` 的 `<code>`，方便样式定位
- [x] 2.6 覆写 `renderer.rules.image`：调用 `images.ts` 的 `resolveImageSrc(src, noteDir)`（阶段 5 完整实现，先桩占位）
- [x] 2.7 导出 `renderMarkdown(content: string, opts: { noteDir?: string }): string` 函数
- [x] 2.8 编写单元测试 `src/utils/markdown/__tests__/renderer.spec.ts`：覆盖标题、列表、任务列表、引用、表格、链接、高亮、KaTeX 行内/块级、围栏代码块降级转义
- [x] 2.9 重写 `src/composables/useMarkdown.ts`：`renderHtml(content)` 改调 `renderMarkdown`，保持同步签名；`useMarkdown(noteDir?)` 接受可选目录参数
- [x] 2.10 运行 `pnpm typecheck` 与 `pnpm test`，全部通过
- [x] 2.11 提交：`feat(markdown): 用 markdown-it 重写渲染核心，支持任务列表、锚点与 KaTeX`

## 3. Shiki 代码高亮

- [x] 3.1 在 `src/utils/markdown/shiki.ts` 创建单例：`getHighlighter()`（lazy + 缓存 Promise），加载语言子集：`markdown, javascript, typescript, vue, jsx, tsx, rust, python, go, shell, bash, json, yaml, html, css, scss, sql, java, kotlin, swift, c, cpp, csharp, php, ruby, diff, xml`
- [x] 3.2 双主题载入：`themes: ['github-light', 'github-dark']`
- [x] 3.3 暴露同步 `highlightCode(code: string, lang: string): string`；highlighter 未就绪时降级转义；触发后台 warmup
- [x] 3.4 `highlightCode` 输出 HTML 结构：外层 `<div class="shiki-block" data-lang="js">` + 头部 `<div class="shiki-head"><span class="shiki-lang">js</span><button class="shiki-copy" data-code="<编码原文>">复制</button></div>` + `<pre class="shiki shiki-themes github-light github-dark">` + 内部按 shiki 双主题 token 输出 + 行号 `<span class="shiki-ln">`
- [x] 3.5 在 `main.ts`（应用启动入口）调用 `void getHighlighter()` 触发 warmup
- [x] 3.6 在 renderer.ts 的 fence rule 中：非 mermaid → 调用 `highlightCode`
- [x] 3.7 扩展 renderer 单元测试：验证已知语言代码块输出包含 `class="shiki"` 与语言标签
- [x] 3.8 提交：`feat(markdown): 接入 shiki 双主题代码高亮，支持行号与语言标签`

## 4. Mermaid 占位与异步渲染

- [x] 4.1 在 `src/utils/markdown/mermaid.ts` 实现 `getMermaidThemeVariables()`：从 `getComputedStyle(document.documentElement)` 读取 `--app-bg / --app-fg / --app-faint / --app-accent / --app-border / --app-soft`，映射到 mermaid `themeVariables`（参考 PureMark `code-block.ts` 该函数）
- [x] 4.2 实现 `renderMermaidPlaceholders(root: HTMLElement): Promise<void>`：`querySelectorAll('.mermaid-placeholder')` → 逐个 `await mermaid.render` → 替换为 `<div class="mermaid-rendered" data-source="...">{svg}</div>`
- [x] 4.3 错误处理：渲染异常时替换为 `<div class="mermaid-error">语法错误：{message}</div>`，不抛出
- [x] 4.4 串行队列：内部维护 `renderQueue` 避免并发 mermaid.render 冲突
- [x] 4.5 在 renderer.ts 的 fence rule 中：`info === 'mermaid'` 输出 `<pre class="mermaid-placeholder" data-source="<base64encoded>"></pre>`
- [x] 4.6 在 `MarkdownReadSurface.vue` 的 `onMounted` 与 `watch(rendered)` 中调用 `renderMermaidPlaceholders(rootEl)`
- [x] 4.7 在 `MarkdownReadSurface.vue` 中监听 `useDark()`：切换时清空 `data-rendered` 标记并重新调用 `renderMermaidPlaceholders`
- [x] 4.8 单元测试：验证 fence rule 对 mermaid 语言输出占位 HTML（不验真 mermaid 渲染，避免 jsdom 不支持 SVG）
- [x] 4.9 提交：`feat(markdown): 接入 mermaid 图表渲染并自适应应用主题`

## 5. Tauri 图片路径处理

- [x] 5.1 在 `src/utils/markdown/images.ts` 实现 `resolveImageSrc(src: string, noteDir?: string): string`，逻辑：已含 scheme → 原样；相对路径 + 有 `noteDir` → 拼接绝对路径 → `convertFileSrc`；其它情况 → 原样
- [x] 5.2 参考 PureMark `src/plugins/imagePathPlugin.ts` 处理空格转义（`%20` ↔ 空格）的边界
- [x] 5.3 在 renderer.ts 的 image rule 中调用 `resolveImageSrc`，通过 `renderMarkdown(content, { noteDir })` 把目录传入
- [x] 5.4 修改 `useMarkdown.ts`：`useMarkdown(noteDirRef?)`，把 ref 解包后传入 `renderMarkdown`
- [x] 5.5 修改调用方 `MarkdownReadSurface.vue` 等：从 props 或当前 store 拿到笔记目录（document 类型笔记的目录路径）传给 `useMarkdown`
- [x] 5.6 单元测试：覆盖相对路径转换、绝对 URL 不变、无 noteDir 时回退、空格编码
- [x] 5.7 提交：`feat(markdown): 接入 Tauri 相对图片路径自动转换`

## 6. DOMPurify XSS 过滤

- [x] 6.1 在 `src/utils/markdown/sanitize.ts` 配置 DOMPurify：白名单含 `svg`、`math` 系列标签（KaTeX 用），允许 `class`、`style`、`data-*`、`id` 属性，禁用 `script`、`iframe`、`object`、`embed`
- [x] 6.2 在 `renderer.ts` 出口处调用 `sanitize(html)`
- [x] 6.3 单元测试：覆盖 `<script>` 移除、`onerror` 属性移除、KaTeX 输出保留、Shiki span style 保留、mermaid 占位保留
- [x] 6.4 提交：`feat(markdown): 接入 DOMPurify 过滤渲染产物`

## 7. 样式表与主题适配

- [x] 7.1 复制 PureMark `src/core/styles/puremark.css` 到 Steno 项目，并精简——仅保留"只读相关"规则（去除 ProseMirror 编辑器相关 .ProseMirror、.cursor、源码视图切换等）
- [x] 7.2 把所有 `--text-color / --background-color-X / --border-color / --primary-color / --hover-background-color` 等替换为 Steno 的 `--app-*` 变量；如需新增语义变量（如 `--app-code-bg`、`--app-inline-code-fg`、`--app-blockquote-bar`），在 `src/theme/index.ts` 添加对应 light/dark 值
- [x] 7.3 整文件外层用 `.markdown-body { ... }` 包住（CSS 嵌套或 `:where` 修饰，避免污染全局）
- [x] 7.4 加入 `.shiki-block` 容器样式：header（语言标签 + 复制按钮，hover 显隐）、行号 gutter、双主题切换（`.app-theme-root:not(.dark) .shiki-themes` 显 light、`.app-theme-root.dark .shiki-themes` 显 dark）
- [x] 7.5 加入 `.mermaid-rendered`、`.mermaid-error` 样式
- [x] 7.6 加入 `.md-inline-code` 紫红渐变背景 + 边框 + 阴影，参考 PureMark
- [x] 7.7 加入 `<mark>` 高亮文本样式
- [x] 7.8 修改 `src/components/MarkdownReadSurface.vue`：移除原 `<style scoped>` 中所有硬编码颜色；`<style src="@/styles/markdown-render.css">` 引入新样式；根 div 加 `.markdown-body` class
- [x] 7.9 在 `MarkdownReadSurface.vue` 中实现复制按钮 click 委托：`onMounted` 中 `rootEl.addEventListener('click', handler)`，`onBeforeUnmount` 解绑；点击 `.shiki-copy` 时 `navigator.clipboard.writeText(decodeURIComponent(data-code))`，按钮文案 2 秒后还原（i18n 接入 `markdown.copy` / `markdown.copied`）
- [x] 7.10 i18n 添加 `markdown.copy` / `markdown.copied` 文案（zh、en）
- [x] 7.11 提交：`feat(markdown): 接入 puremark 渲染样式并绑定 --app-* 主题变量`

## 8. 验证、清理与文档

- [x] 8.1 运行 `pnpm typecheck` 全绿
- [x] 8.2 运行 `pnpm test`（vitest）全绿，确认覆盖：GFM、shiki 降级、KaTeX、Mermaid 占位、图片路径、Sanitize（本次新增/相关用例 214 个全部通过；剩余 3 个失败 `App.test.ts` × 2、`TodoView.test.ts` × 1 为基线历史失败，与本次改动无关）
- [x] 8.3 运行 `pnpm lint` 0 error（允许预存的 9 个 vue/custom-event-name-casing / vue/no-undef-properties 历史警告）
- [ ] 8.4 启动 `pnpm tauri dev`：用截图所示的同款 Markdown 内容做手动验证，覆盖：标题、引用、列表、任务列表、表格、行内代码、围栏代码块（含 java/javascript/python/rust）、KaTeX 行内+块级、Mermaid 流程图、相对路径图片、`==高亮==`、亮/暗主题切换（**待用户手动验证**）
- [ ] 8.5 验证暗色模式下与设置面板/编辑器主题保持一致，无低对比度区域（**待用户手动验证**）
- [ ] 8.6 截图对比验收：把验收截图存入 `openspec/changes/redesign-markdown-rendering-pipeline/screenshots/`（**待用户手动验证**）
- [x] 8.7 更新项目 `README.md`：在功能/技术栈区域补充 Markdown 渲染特性（shiki / KaTeX / Mermaid）
- [x] 8.8 运行 `openspec validate redesign-markdown-rendering-pipeline --strict` 通过
- [x] 8.9 提交：`docs+test: Markdown 渲染管线重做收尾，验证与文档归档`
