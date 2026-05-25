## 设计目标

本次变更把 Steno 的编辑体验从"原始文本 + 工具栏"升级到所见即所得。设计要点是：

1. **原位渲染**（即时渲染 / Inline Render / IR）：用户输入 `# `、`**`、`-`、`> ` 后，符号本身要么消失要么淡化，渲染后的样式直接出现在原位。光标移入语法标记区域时再显示符号，方便编辑——这是 Typora、Notion、Bear、Obsidian Live Preview 通行做法。
2. **单一真相**：编辑器对外仍以 Markdown 文本字符串作为输入输出，便于自动保存、跨窗口同步与导出。组件不暴露 ProseMirror / CodeMirror 内部状态。
3. **浮窗适用**：浮窗笔记尺寸只有 360×240px，对体积、首屏渲染、首次按键延迟都很敏感，避免引入庞大的 toolbar / 块菜单。
4. **测试友好**：现有 Vitest + jsdom 用例需要尽量兼容；至少 `focus()`、`scrollToLine()`、`textarea`-like 的可寻址 API 要保留，必要时为 jsdom 提供 mock。

## 候选方案对比

下表对比三个能在 Steno 上落地的实时渲染方案。**推荐方案 A（Milkdown + Crepe）**，理由见决策栏。

| 维度 | A. Milkdown + Crepe | B. CodeMirror 6 + 自建装饰器 | C. Vditor IR |
|---|---|---|---|
| **核心内核** | ProseMirror（结构化文档） | CodeMirror 6（行文本） | Vditor IR 模式 |
| **原位渲染** | 原生支持，Crepe 默认 IR | 需要自己写 MarkdownView 装饰器，工作量约 600-1000 行 | 原生 IR 模式开箱即用 |
| **快捷键** | `prosemirror-keymap` 内置，Crepe 自带常用绑定 | 需要自己注册 `keymap` 扩展 | 自带快捷键，可配置 |
| **大纲解析 API** | `editor.action(getMarkdown())` + 自有 ProseMirror doc 遍历；可继续用 `useMarkdownOutline` 解析回来的 markdown | 同上，能直接拿 markdown 字符串 | `vditor.getValue()` 拿源码后用 `useMarkdownOutline` |
| **Vue 3 集成** | 一流（官方 `@milkdown/vue` 包） | 良好（无官方 Vue 包，但封装简单） | 中等（需要包成 Vue 组件，事件桥接） |
| **体积** | ~280KB gzip（Crepe 全量） | ~150KB gzip（按需引入语言包） | ~600KB gzip（含 marked、katex、mermaid 等） |
| **TypeScript** | 一流 | 一流 | 良好（有 .d.ts 但 API 较老式） |
| **代码高亮 / Katex / Mermaid** | 通过插件接入，Crepe 默认含 KaTeX | 需要自己接 highlight.js / katex | 自带 |
| **学习曲线** | 中（ProseMirror 概念） | 中-高（要写装饰器） | 低 |
| **接入工作量预估** | 2-3 步（依赖 + 包装组件 + 浮窗适配） | 4-5 步（装饰器 + 快捷键 + 工具栏 + ...) | 2 步（依赖 + Vue 包装） |
| **未来扩展** | 强（插件生态丰富） | 强（CodeMirror 6 扩展生态成熟） | 中（Vditor 自成体系） |
| **风险** | Crepe API 仍在 1.x 前，未来可能小变；ProseMirror 学习成本 | 自维护装饰器，bug 风险全在自己 | Vditor 主要面向独立 Markdown 编辑器场景，深度定制有时受限 |

**决策（待用户拍板）：默认采用方案 A（Milkdown + Crepe）。** 理由：

- 与 Steno 现有 Vue 3 + Pinia + naive-ui 技术栈契合度最高；
- Crepe 内置 IR、快捷键、链接预览、表格、列表、任务清单、代码块（含高亮）、数学公式（KaTeX），与 PureMark 自研的 ProseMirror 实现走的是同一条路线，未来若想做"块菜单 / slash command"也都有现成插件；
- 接入工作量最低（先用 Crepe 默认配置上线，再按需关闭/启用插件即可）；
- 体积可接受（280KB gzip，浮窗依赖关键路径上其余依赖加起来已经超过这个数量级）。

**用户如选 B**：直接放弃 Crepe，引入 `@codemirror/state`、`@codemirror/view`、`@codemirror/lang-markdown`、`@lezer/highlight`，自己写 `live-render-plugin.ts`（参考 obsidian-mode 或 milkdown 0.6 时代的 markdown 装饰器）。代码量更大，但二次依赖少。

**用户如选 C**：装 `vditor`，包成 `<MarkdownEditor>` Vue 组件，注意要把 `mode: 'ir'`、`toolbar: []`、`cache.enable: false` 都关掉以适配 Steno 的浮窗。

## 关键设计点

1. **对外接口稳定**：`MarkdownEditor` 仍 `defineExpose` 出 `focus()`、`scrollToLine(line: number)`。`scrollToLine` 内部映射到所选方案的滚动 API：
   - Milkdown：`editor.action(ctx => { const view = ctx.get(editorViewCtx); view.dispatch(...) })` 把 cursor 移到指定行的对应节点。
   - CodeMirror：`view.dispatch({ effects: EditorView.scrollIntoView(...) })`。
   - Vditor：`vditor.focus(); vditor.scrollToLine(line)`。
2. **保存仍走 Markdown 文本**：编辑器 `v-model` 仍是 string；内部 doc → markdown 用所选库的 serializer。autosave 不变。
3. **快捷键最低集合**：
   - `Mod-B` 粗体 · `Mod-I` 斜体 · `Mod-U` 下划线（可选） · `Mod-Shift-S` 删除线
   - `Mod-1` .. `Mod-6` 标题 H1-H6 · `Mod-0` 段落
   - `Mod-Shift-7` 有序列表 · `Mod-Shift-8` 无序列表 · `Mod-Shift-9` 待办
   - `Mod-Shift-Q` 引用 · `Mod-Shift-C` 代码块 · `` Mod-` `` 行内代码
   - `Mod-K` 链接 · `Mod-Z` 撤销 · `Mod-Shift-Z` / `Mod-Y` 重做
4. **浮窗与主编辑区共享同一组件**，差异通过 props 配置：
   - `density: 'comfortable' | 'compact'` — 浮窗使用 compact，行高 / 字号略小。
   - `showToolbar: boolean` — 浮窗默认 false，主编辑区默认 false（与 PureMark 思路一致：靠快捷键和"输入即渲染"，避免工具栏占用屏幕）。
   - `autofocus`、`placeholder` 保持现状。
5. **大纲入口图标化**：用一个 4-line 列表图标，按钮尺寸 32×32，与 NoteEditorView 现有 `note-editor-icon-button` 风格一致；hover/focus 与现有按钮一致。
6. **大纲等级徽章**：徽章用 `<span class="outline-level-badge">H{{level}}</span>` 渲染，等级颜色全部统一灰（`#9a8d80`），背景 `rgba(132,82,47,0.08)`，字号 10px，宽度 22px，固定圆角矩形。徽章放在节点 `.outline-node-text` 之前；徽章 + 文字之间留 6px。
7. **回退路径**：若所选方案在某个边界 case 上失败（例如 jsdom 测试环境跑不起来），可临时降级渲染为 `MarkdownReadSurface` 的渲染逻辑（marked + decorateHeadingAnchors）作为只读视图，保证主流程不断。

## 非目标

- 不做"全功能 Markdown 编辑器"（导出 docx / pdf、Mermaid、表格行内编辑等）。这些放在后续迭代。
- 不引入 PureMark 自研的 ProseMirror schema / parser / serializer 那一整套（工程量过大、与速记应用定位不符）。
- 不做工具栏可视化编辑按钮（保留命令式快捷键即可，未来若有需要再加）。
- 不动 SQLite schema、autosave、跨窗口事件协议。

## 决议（2026-05-23）

经用户拍板，**采用方案 B：CodeMirror 6 + 自建装饰器**。已加入项目依赖：

- `@codemirror/state`、`@codemirror/view`：编辑器核心
- `@codemirror/lang-markdown`：Markdown 语言解析（Lezer 语法树）
- `@codemirror/language`：syntaxTree / HighlightStyle 等公共能力
- `@codemirror/commands`：撤销/重做、默认 keymap、history
- `@codemirror/search`：查找替换（后续可选用）
- `@lezer/highlight`：syntax tags 与高亮规则

实施重心：在 `MarkdownEditor.vue` 内组装最小可用的 `EditorView`，并写一个 `live-render` `ViewPlugin`，按 lezer 语法树定位 `HeaderMark`、`EmphasisMark`、`StrongEmphasisMark`、`InlineCodeMark`、`StrikethroughMark`、`ListMark`、`QuoteMark` 等位置，输出 `Decoration.mark`/`Decoration.replace` 切换"显示符号 / 隐藏并应用样式"。光标所在行（或语法标记 cover 区域）保留符号，其余隐藏 — 这就是 Obsidian Live Preview 与 PureMark 的同路实现。

体积考量：核心 6 个包合计约 150-180KB gzip，对速记浮窗仍属可接受。

