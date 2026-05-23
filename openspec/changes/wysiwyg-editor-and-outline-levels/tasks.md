## 1. 方案选型与依赖准备

- [x] 1.1 由用户在 design.md 的 A/B/C 三套方案中拍板 → 选定 **方案 B：CodeMirror 6 + 自建装饰器**
- [x] 1.2 安装 CodeMirror 6 依赖：`@codemirror/state` `@codemirror/view` `@codemirror/lang-markdown` `@codemirror/commands` `@codemirror/language` `@codemirror/search` `@lezer/highlight`
- [x] 1.3 在 design.md "决议" 小节登记编辑器内核选择（含包列表与体积估算）

## 2. WYSIWYG 编辑器内核（capability: markdown-wysiwyg-editor）

- [x] 2.1 重写 `src/components/MarkdownEditor.vue`，对外保持 `v-model:value/modelValue` 与 `defineExpose({ focus, scrollToLine })` 不变
- [x] 2.2 内核接入：挂载 EditorView 到 `<div ref="container">`；初始化时把 `props.modelValue` 设为 markdown 源；用户编辑后通过 updateListener `emit('update:modelValue', md)` 回写
- [x] 2.3 注册快捷键集合（见 `src/components/markdown-editor/keymap.ts`：粗体 / 斜体 / 删除线 / 行内代码 / H1-H6 / 段落 / 引用 / 列表 / 待办 / 代码块 / 链接 / 撤销 / 重做）
- [x] 2.4 暗色 / 亮色主题适配，与 Steno 当前 `useDark` + `app-theme-root.dark` 类名联动
- [x] 2.5 删除旧的工具栏 / textarea / v-html 预览代码
- [x] 2.6 为编辑器对外接口（focus / scrollToLine）、初始/外部 v-model 同步、editor → emit 链路编写 Vitest 用例

## 3. 速记浮窗适配

- [x] 3.1 `FloatingEditor.vue` 继续使用同一 `MarkdownEditor` 组件；浮窗为固定暗色容器，密度通过 `.floating-body :deep(.cm-*)` 局部覆写 padding 与字号
- [x] 3.2 验证 hint placeholder、autofocus、聚焦失焦关闭逻辑在新内核下仍生效（CodeMirror placeholder 扩展接管，autofocus 通过 view.focus()，失焦关闭依赖 window-level 监听不受编辑器影响）
- [ ] 3.3 浮窗自动保存链路依赖上层 `useAutosave` 监听 v-model；交由 step 6 手工回归覆盖，本次不新增 mount 测试（FloatingEditor 需 mock 大量 Tauri / db / useWindow 桩）

## 4. 大纲入口图标化（capability: document-outline-headings）

- [x] 4.1 把 `NoteEditorView.vue` 的 `.note-editor-outline-fab` 文字按钮替换为带 list 图标的圆形按钮，保留 `data-testid="note-outline-toggle"`、`aria-label`、`title`
- [x] 4.2 调整按钮 hover / focus 样式：圆形 32×32，aria-pressed=true 时高亮，与现有按钮的暖色调一致
- [x] 4.3 既有 `NoteEditorView.test.ts` 用例只断言 testid，不依赖按钮文本，无需改动测试

## 5. 大纲等级徽章

- [x] 5.1 在 `DocumentOutlineTree.vue` 节点模板中，节点文本前渲染 `<span class="outline-tree__badge">H{{level}}</span>`
- [x] 5.2 徽章样式：min-width 22px、灰底（rgba(132,82,47,0.1)）、灰字（#9a8d80）、字号 10px、字母粗细 600；与节点文字间隔 6px
- [x] 5.3 `useMarkdownOutline.buildOutline` 输出的 `OutlineNode.level` 字段已存在，无需补全
- [x] 5.4 在 `DocumentOutlineTree.test.ts` 中新增徽章文本与 aria-label 断言

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
