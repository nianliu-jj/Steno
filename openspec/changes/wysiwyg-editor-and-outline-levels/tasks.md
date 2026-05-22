## 1. 方案选型与依赖准备

- [ ] 1.1 由用户在 design.md 的 A/B/C 三套方案中拍板
- [ ] 1.2 安装所选方案对应的依赖（默认 A：`@milkdown/core`、`@milkdown/vue`、`@milkdown/preset-crepe`、`@milkdown/theme-nord`、`@milkdown/prose` 等；如选 B：`@codemirror/state` `@codemirror/view` `@codemirror/lang-markdown` `@codemirror/commands` `@lezer/highlight`；如选 C：`vditor`）
- [ ] 1.3 在 README 或 docs 简要登记编辑器内核选择（一段话即可）

## 2. WYSIWYG 编辑器内核（capability: markdown-wysiwyg-editor）

- [ ] 2.1 重写 `src/components/MarkdownEditor.vue`，对外保持 `v-model:value/modelValue` 与 `defineExpose({ focus, scrollToLine })` 不变
- [ ] 2.2 内核接入：根据所选方案，挂载到 `<div ref="containerRef">`；初始化时把 `props.modelValue` 设为 markdown 源；用户编辑后将 markdown 通过 `emit('update:value', md)` 回写
- [ ] 2.3 注册快捷键集合（粗体 / 斜体 / 删除线 / 行内代码 / H1-H6 / 段落 / 引用 / 列表 / 待办 / 代码块 / 链接 / 撤销 / 重做）
- [ ] 2.4 暗色 / 亮色主题适配，与 Steno 当前 `darkTheme` 切换联动
- [ ] 2.5 删除旧的工具栏 / textarea / v-html 预览代码
- [ ] 2.6 为编辑器对外接口与快捷键命令编写 Vitest 用例（jsdom + 必要时 mock 第三方库）

## 3. 速记浮窗适配

- [ ] 3.1 在 `FloatingEditor.vue` 内继续使用 `MarkdownEditor`，仅通过 `density="compact"` / `showToolbar={false}` 等 prop 调整密度
- [ ] 3.2 验证 hint placeholder、autofocus、自动保存、聚焦失焦关闭逻辑在新内核下仍生效
- [ ] 3.3 在浮窗回归用例（若有）或新增用例中覆盖输入触发自动保存

## 4. 大纲入口图标化（capability: document-outline-headings）

- [ ] 4.1 把 `NoteEditorView.vue` 的 `.note-editor-outline-fab` 文字按钮替换为带 list 图标的圆形按钮，保留 `data-testid="note-outline-toggle"`、`aria-label="大纲"`、`title="大纲"`
- [ ] 4.2 调整按钮 hover / focus 样式与现有图标按钮（如 `note-editor-icon-button`）保持一致
- [ ] 4.3 更新 `NoteEditorView.test.ts` 中针对 outline 按钮的断言（保留 testid，不假设按钮文本）

## 5. 大纲等级徽章

- [ ] 5.1 在 `DocumentOutlineTree.vue` 节点模板中，节点文本前渲染 `<span class="outline-level-badge">H{{level}}</span>`
- [ ] 5.2 徽章样式：固定宽度 22px、灰底、灰字、字号 10px、字母大小写一致；与节点文字间隔 6px
- [ ] 5.3 确认 `useMarkdownOutline.buildOutline` 输出的 `OutlineNode.level` 字段已有（如缺失则补全）
- [ ] 5.4 为徽章渲染补 Vitest 单测（H1/H2/H3 等级文本、置灰色与背景）

## 6. 验证

- [ ] 6.1 运行 `pnpm typecheck`、`pnpm lint`、`pnpm test --run`，全部绿
- [ ] 6.2 手动验证主编辑器：输入 `#`、`**`、`- `、`> `、` ``` `、`[]()`、`![]()` 都能原位渲染
- [ ] 6.3 手动验证浮窗：输入 markdown 语法即时渲染，失焦保存与置顶为便签链路不受影响
- [ ] 6.4 手动验证大纲：图标按钮可点开、节点带 H1/H2/.../H6 徽章、点击跳转正确
- [ ] 6.5 手动验证暗色主题下编辑器渲染色与背景对比正常

## 7. 提交节奏

- [ ] 7.1 step1（需求文档）：本次 change 4 个 md 文件落库 → commit
- [ ] 7.2 step2（用户选定方案 + 依赖安装）→ commit
- [ ] 7.3 step3（MarkdownEditor 重构 + 单测）→ commit
- [ ] 7.4 step4（浮窗适配 + 验证）→ commit
- [ ] 7.5 step5（大纲入口图标化 + 等级徽章 + 单测）→ commit
- [ ] 7.6 step6（完整 typecheck/lint/test + 手动回归记录）→ commit
