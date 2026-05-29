## 1. Phase 0 — 依赖与目录骨架

- [x] 1.1 用 pnpm 添加 `prosemirror-dropcursor`、`prosemirror-gapcursor`、`prosemirror-tables`、`prosemirror-transform`
- [x] 1.2 创建 `src/components/markdown-editor/prosemirror/` 目录树（`schema/` `parser/` `serializer/` `nodeviews/` `plugins/` `view/` `styles/` `tests/`），每个子目录留一个空 `index.ts` 占位
- [x] 1.3 把对照参考路径写进 README 注释（`D:\Markdown项目\PureMark\src\core\`、`D:\Markdown项目\milkup`），方便后续审查
- [x] 1.4 跑 `pnpm typecheck` 确保骨架可编译

## 2. Phase 1 — Schema

- [x] 2.1 移植 PureMark `src/core/schema/index.ts`：节点（doc/paragraph/heading/blockquote/bullet_list/ordered_list/list_item/task_list_item/code_block/math_block/mermaid_block/html_block/horizontal_rule/table/table_row/table_cell/table_header/image）
- [x] 2.2 移植 marks（strong/em/code/strike/link/highlight/syntax_marker/html_inline）+ `SAFE_INLINE_TAGS` 白名单 + `parseHtmlAttrs`
- [x] 2.3 调整命名以适配 Steno 风格（保留 PureMark 注释，新增中文注释说明 Steno 适配点）
- [x] 2.4 单测：`schema.test.ts` 校验 schema 能创建空 doc、能往各节点塞文本
- [x] 2.5 `pnpm test schema` 通过

## 3. Phase 2 — Parser（Markdown → Doc）

- [x] 3.1 移植 PureMark `src/core/parser/index.ts` 的 INLINE_SYNTAXES 与 BLOCK 解析
- [x] 3.2 在每个块级节点上记录 `startLine` attr（用于 `scrollToLine`）
- [x] 3.3 内联 HTML 标签按白名单解析为 `html_inline` mark / 节点
- [x] 3.4 解析 KaTeX 行内/块级、Mermaid 块、围栏代码块（含 `info` 语言）
- [x] 3.5 测试用例 `parser.test.ts`：覆盖标题/blockquote 含无空格/列表/任务列表/HR/表格/代码块/链接/图片/HTML inline/math/mermaid/嵌套列表
- [x] 3.6 `pnpm test parser` 通过

## 4. Phase 3 — Serializer（Doc → Markdown）

- [x] 4.1 移植 PureMark `src/core/serializer/index.ts`；按节点/Mark 实现序列化器
- [x] 4.2 测试 `serializer.test.ts`：对 Phase 2 的全部用例做 round-trip（`serialize(parse(md)) === md` 经归一化后）
- [x] 4.3 处理空白与转义归一化规则（CRLF → LF、行尾空格、`*`/`_` 转义边界）
- [x] 4.4 `pnpm test serializer` 通过

## 5. Phase 4 — 基础 NodeView

- [x] 5.1 `nodeviews/image.ts`：复用 `utils/stenoAssets.ts` 做相对路径解析；失败占位
- [x] 5.2 `nodeviews/task-list-item.ts`：原生 checkbox + 同步 `[ ]` ↔ `[x]`
- [x] 5.3 `nodeviews/html-block.ts`：DOMPurify 清洗后注入 innerHTML
- [x] 5.4 `nodeviews/math-block.ts`：调 KaTeX；进入 NodeView 时切换回源 LaTeX 编辑
- [x] 5.5 `nodeviews/mermaid-block.ts`：复用 `utils/markdown/mermaid.ts` 缓存
- [x] 5.6 `nodeviews/table.ts`：首版仅渲染 + 单元格编辑（增删行列留后续）
- [x] 5.7 单测 `nodeviews.test.ts`：mount 各 NodeView 断言 DOM 结构

## 6. Phase 5 — 代码块 NodeView（嵌入 CodeMirror）

- [x] 6.1 `nodeviews/code-block.ts`：在 NodeView 内挂 CodeMirror 6 EditorView
- [x] 6.2 处理内外 selection 同步（光标从 PM → CM、CM → PM 边界）
- [x] 6.3 接入语言包（按 `@codemirror/language-data` 动态加载）
- [x] 6.4 主题随 `useDark` 切换
- [x] 6.5 "复制"按钮：写剪贴板 + 提示
- [x] 6.6 单测：mount 一个 ts 代码块，断言 CodeMirror 容器存在 + 复制按钮可点

## 7. Phase 6 — Plugins

- [x] 7.1 `plugins/instant-render.ts`：移植 PureMark 同名插件，基于 selection 决定隐藏/显示 `syntax_marker` Decoration
- [x] 7.2 `plugins/input-rules.ts`：`# `、`## `、`> `、`- `、`* `、`1. `、`- [ ] `、` ``` ` 等触发即时转换
- [x] 7.3 `plugins/syntax-fixer.ts`：光标离开后修复破损节点（参考 PureMark）
- [x] 7.4 `plugins/paste.ts`：粘贴 HTML → DOMPurify → parser；粘贴图片 → 调 `db.savePastedImage` 取 markdownUrl 插入
- [x] 7.5 `plugins/placeholder.ts`：空文档时显示提示
- [x] 7.6 `plugins/keymap.ts`：常用快捷键（Bold/Italic/Link/Code/Heading 切换/Undo/Redo）
- [x] 7.7 `plugins/history.ts`：`prosemirror-history` 适配
- [x] 7.8 `plugins/drop-cursor.ts` + `plugins/gap-cursor.ts`：拖拽与 block 间空白光标
- [x] 7.9 单测：instant-render 行为；input-rules 触发；paste 流程

## 8. Phase 7 — 视图工厂与桥接

- [ ] 8.1 `view/create-editor.ts`：参数化工厂（schema、initialMarkdown、editable、placeholder、onChange、noteDir）
- [ ] 8.2 `view/editor-bridge.ts`：双向绑定（含 `suppressNextDocSync` 思路适配）、`focus()`、`scrollToLine(line)`（用块级节点 `startLine` attr）、`scrollToHeading(id)`
- [ ] 8.3 单测：bridge 的 v-model 双向同步、focus、scrollToLine 三个方法

## 9. Phase 8 — MarkdownEditor.vue 接入

- [ ] 9.1 重写 `src/components/MarkdownEditor.vue` 内部实现，使用 `create-editor` + `editor-bridge`；保持 props/emits/exposed 完全一致
- [ ] 9.2 删除 `src/components/markdown-editor/live-render.ts`、`live-render.test.ts` 与对应样式块；清理任何剩余 import
- [ ] 9.3 调整 `src/components/markdown-editor/extensions.ts`（CodeMirror）为内嵌代码块用，或重命名/拆分
- [ ] 9.4 更新 `src/components/MarkdownEditor.test.ts`：替换为新内核的行为断言（v-model、focus、autofocus）
- [ ] 9.5 端到端验证：把题目中"图二"对应的 Markdown 塞进编辑器，DOM 包含 `<ul>` / `<table>` / `<hr>` / `<a>` / `<u>` / `<code>`
- [ ] 9.6 `pnpm typecheck && pnpm lint && pnpm test` 通过
- [ ] 9.7 中文 commit：`refactor(editor): 将 MarkdownEditor 内核迁移到 ProseMirror`

## 10. Phase 9 — MarkdownReadSurface.vue 接入

- [ ] 10.1 重写 `src/components/MarkdownReadSurface.vue` 内部实现，使用相同 `create-editor` + `editable: () => false`
- [ ] 10.2 移除 `v-html` 注入与 markdown-it 渲染调用；保留 heading 锚点 `id` 注入（通过 ProseMirror Decoration 或 NodeView 输出）
- [ ] 10.3 复制按钮逻辑迁移到 Plugin（与编辑态共用）
- [ ] 10.4 更新 `src/components/MarkdownReadSurface.test.ts`
- [ ] 10.5 `pnpm typecheck && pnpm lint && pnpm test` 通过
- [ ] 10.6 中文 commit：`refactor(reader): MarkdownReadSurface 共用 ProseMirror 内核`

## 11. Phase 10 — 清理与依赖收敛

- [ ] 11.1 从 `package.json` 移除不再被引用的 `@codemirror/lang-markdown`、`@codemirror/search`、`@lezer/highlight`
- [ ] 11.2 删除 `src/utils/markdown/` 中已无人调用的子模块；保留 `renderMarkdown`（复制为 HTML 兜底）+ `sanitizeHtml`
- [ ] 11.3 `pnpm install` 确认 lockfile 收敛
- [ ] 11.4 全仓 grep 旧符号 `liveRenderPlugin` / `useMarkdown().renderHtml`（确认无残留）
- [ ] 11.5 中文 commit：`chore: 清理 CodeMirror live-render 与未用 markdown 依赖`

## 12. Phase 11 — 文档与归档

- [ ] 12.1 更新 `docs/` 下相关说明（编辑器架构图、NodeView 列表、自定义快捷键）
- [ ] 12.2 在新 `prosemirror/README.md` 中给出"对照 PureMark 文件 → Steno 文件"的迁移映射表
- [ ] 12.3 走 OpenSpec archive 流程归档本 change
- [ ] 12.4 中文 commit：`docs: 归档 redesign-wysiwyg-editor-prosemirror change`
