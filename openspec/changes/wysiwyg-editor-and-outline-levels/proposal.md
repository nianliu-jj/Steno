## Why

当前主窗口编辑器与速记浮窗都是"原始 Markdown 文本框 + 一个简单工具栏"，用户在写 `**粗体**`、`# 标题` 时只能看到原始符号，必须切换到"只读模式"或浏览只读 surface 才能看到渲染结果，体验断裂。同时编辑区没有快捷键、没有粘贴增强、没有源码与渲染联动，这让 Steno 在"快速记录想法"的核心场景里反而比常见的 Markdown 笔记工具更慢。大纲面板也存在两处可见问题：入口仍是一颗写着"大纲"的方块按钮，未与编辑页其它图标按钮风格统一；展开后只显示标题文字，没有可一眼看出层级的视觉锚点（H1/H2/…）。

## What Changes

- 用所见即所得（WYSIWYG / inline-render）方案重写 `MarkdownEditor` 内核，让 `#`、`-`、`**` 等语法在用户输入后**原位**渲染为最终样式，不再左右分栏对照。
- 为编辑器内置 macOS/Windows 通用快捷键体系：粗体、斜体、行内代码、删除线、引用、有序/无序列表、待办、链接、各级标题（Mod+1..Mod+6）、段落（Mod+0）、撤销/重做、源码视图切换等。
- 复用同一份编辑器组件改造速记浮窗 / 便签的正文输入区，使快速记录场景同样获得即时渲染。
- 将 `NoteEditorView` 右下角的"大纲"文字 FAB 改成圆形图标按钮，与其它图标按钮风格统一，并保留 `aria-label` 与 `title="大纲"`。
- 在 `DocumentOutlineTree` 的每个标题节点前补一个置灰的等级徽章：H1、H2、H3、H4、H5、H6；徽章宽度固定、字号小、颜色与文字色弱化对比，便于用户一眼区分层级。

## Capabilities

### New Capabilities
- `markdown-wysiwyg-editor`: 主编辑区与浮窗共用的 WYSIWYG Markdown 编辑器内核、快捷键体系与对外接口（focus / scrollToLine / setValue / getValue）。

### Modified Capabilities
- `document-outline-headings`: 大纲面板入口图标化、节点前置等级徽章；标题解析仍复用 `useMarkdownOutline`，但需保证 `level` 字段透传到组件。

## Impact

- 前端编辑链路：`src/components/MarkdownEditor.vue` 重构为新内核的薄包装；`src/components/FloatingEditor.vue` 内嵌的编辑区接入同一组件；`src/views/NoteEditorView.vue` 大纲 FAB 改为图标按钮；`src/components/DocumentOutlineTree.vue` 渲染等级徽章。
- 旧的"工具栏 + 文本框 + v-html 预览"三件套被替换；`MarkdownReadSurface.vue` 在只读路径继续使用（Zen 阅读态、未来导出预览）。
- 新增依赖：根据 design.md 中方案对比拍板（推荐 Milkdown + Crepe，备选 CodeMirror 6 自建装饰器，兜底 Vditor）。需要一次性增加约 1 个外部包族。
- 持久化无影响——Markdown 源仍是单一真相来源，所有持久化键、SQLite 结构不变。
- 测试需要覆盖：编辑器对外接口（focus / scrollToLine）、快捷键触发命令、大纲徽章渲染、浮窗内嵌编辑器、`NoteEditorView` 大纲 FAB 图标化。
