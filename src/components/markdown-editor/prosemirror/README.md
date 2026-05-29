# Steno ProseMirror Markdown 内核

Steno 全平台 Markdown 编辑与渲染面板的统一内核，采用 Typora 风格的「所见即所得」
（WYSIWYG）方案：编辑态本身就长得像渲染结果，光标进入对应节点时显示 Markdown 源码
标记符号（`**`、`>`、`-` 等），离开后隐藏。

`MarkdownEditor.vue`（编辑态）与 `MarkdownReadSurface.vue`（只读态）共用同一套
schema / parser / serializer / nodeviews / plugins，靠 `editable` 切换，保证两态视觉
100% 一致。入库与磁盘文本始终是纯 Markdown 字符串。

## 架构分层

```
prosemirror/
  schema/        Schema 装配：节点（nodes.ts）、标记（marks.ts）、内联 HTML 白名单（html-inline.ts）
  parser/        Markdown → ProseMirror Doc（保留 syntax_marker 源码标记）
  serializer/    Doc → Markdown（与 parser round-trip 等价）
  decorations/   syntax_marker 区域查找 + 显隐 Decoration（即时渲染核心依赖）
  plugins/       instant-render / input-rules / syntax-fixer / paste / placeholder /
                 keymap / commands / history / drop-cursor / gap-cursor + createEditorPlugins 装配
  nodeviews/     image / task-list-item / html-block / math-block / mermaid-block / code-block
  view/          create-editor.ts（EditorView 工厂）、editor-bridge.ts（Vue 双向绑定胶水）、
                 editor-base.css（syntax 显隐类 + ProseMirror 基础排版 + gapcursor/tables 样式）
  tests/         schema / parser / serializer / nodeviews / plugins / view 单测
```

数据流：`Vue 组件` → `createEditorBridge` → `createEditor` → `EditorView`
（装配 schema + plugins + nodeViews）。文档变更经 `dispatchTransaction` 序列化为
Markdown 回调 `onChange`；外部 `v-model` 变化经 `bridge.setContent` 回写（内部防死循环）。

## 核心机制

- **syntax_marker mark**：把 Markdown 源码符号作为带此 mark 的可见文本节点保留进文档，
  让光标能在源码标记内自由移动。`decorations` + `instant-render` 插件按光标位置用
  Decoration 控制其显隐（`.puremark-syntax-hidden` / `.puremark-syntax-visible`）。
- **代码块**：`code-block` NodeView 内嵌一个 CodeMirror 6 EditorView，负责语法高亮、
  内外 selection/focus/undo 协同、IME、语言标签与复制按钮。
- **只读态 heading 锚点**：`createEditor({ headingAnchors: true })` 用 nodeDecoration 给
  heading 注入 `id="heading-{startLine+1}"`，与 `useMarkdownOutline` 的 `heading-{行号}`
  约定对齐，支撑大纲点击精确跳转。

## 对照 PureMark → Steno 迁移映射

参考项目（只读，未修改）：`D:\Markdown项目\PureMark\src\core\`、`D:\Markdown项目\milkup`。

| PureMark 源文件 | Steno 落点 | 关键适配 |
| --- | --- | --- |
| `schema/index.ts`（节点部分） | `schema/nodes.ts` | 块级节点新增 `startLine` attr；新增 `mermaid_block` 节点 |
| `schema/index.ts`（标记部分） | `schema/marks.ts` | `code_inline`/`syntax_marker` 的 CSS class 改用 `steno-*` 前缀 |
| `schema/index.ts`（`SAFE_INLINE_TAGS`/`parseHtmlAttrs`） | `schema/html-inline.ts` | 原样移植 |
| `parser/index.ts` | `parser/index.ts` + `parser/types.ts` | import 改用 stenoSchema；块级节点记录 0-indexed `startLine` |
| `serializer/index.ts` | `serializer/index.ts` | 表格/引用输出规范化（`|a|b|`→`| a | b |`） |
| `decorations/index.ts` | `decorations/index.ts` | 去掉 source-view-transform 依赖；行内数学直接调 KaTeX |
| `plugins/instant-render.ts` | `plugins/instant-render.ts` | 原结构移植 |
| `plugins/input-rules.ts` | `plugins/input-rules.ts` | 原结构移植 |
| `plugins/syntax-fixer.ts` | `plugins/syntax-fixer.ts` | 原结构移植 |
| `plugins/paste.ts` | `plugins/paste.ts` | 图片走 `onPasteImage(dataUrl)=>shortUrl`；HTML 经 `sanitizeHtml` 清洗 |
| `plugins/placeholder.ts` | `plugins/placeholder.ts` | class 改 `steno-editor` / `steno-editor-empty` |
| `keymap/`、`commands/` | `plugins/keymap.ts`、`plugins/commands.ts` | 裁剪动态 keymap 体系为静态精简版 |
| （prosemirror-history/dropcursor/gapcursor 包） | `plugins/history.ts`、`drop-cursor.ts`、`gap-cursor.ts` | 薄封装 |
| `nodeviews/code-block.ts` | `nodeviews/code-block.ts` | 语言包改用 `@codemirror/language-data` 动态加载；暗色走 CSS class |
| `nodeviews/*`（image/task/html/math） | `nodeviews/image.ts` 等 | image 走 `stenoAssets` 相对路径；mermaid 为 Steno 新增 NodeView |
| `view/*` | `view/create-editor.ts` + `view/editor-bridge.ts` | 表格用 prosemirror-tables 的 `TableView`；新增 `headingAnchors` 选项 |

## 自定义快捷键（keymap.ts 精简版）

- `Mod-b` 粗体、`Mod-i` 斜体、`Mod-e` 行内代码、删除线/高亮
- `Mod-Alt-1`~`Mod-Alt-6` 切换标题级别、`Mod-Alt-0` 转段落
- 列表内 `Enter` / `Tab` / `Backspace` 行为
- `Mod-z` / `Mod-y`（`Mod-Shift-z`）撤销/重做（prosemirror-history）

## 非目标（留作后续 change）

源码视图（SourceView）、协同编辑、搜索替换面板、`:::container` 自定义容器、
`[!NOTE]` alert、PDF/Word 导出。
