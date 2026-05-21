## Why

当前主窗口编辑页仍以“原始 Markdown 文本框”为中心，缺少阅读态与编辑态切换、Zen 入口、大纲导航和稳定的版面伸缩能力，导致文档整理、沉浸写作和长文跳转体验都与最新原型标注不一致。用户已经给出明确的界面标注图，因此需要先把这组交互收敛成正式需求合同，避免后续实现时把模式切换、布局调整和导航行为拆成彼此冲突的零散改动。

## What Changes

- 为主窗口笔记编辑页补上 Markdown 阅读态与编辑态切换，阅读态必须渲染 Markdown 格式，而不是继续显示原始语法文本。
- 在编辑页底部新增两个固定动作：阅读/编辑模式切换，以及进入当前文档的 Zen 模式。
- 调整编辑页标题区与文档容器的几何关系：编辑器顶部需要保持圆角完整可见，整体向上延展，压缩标题与正文之间的留白。
- 在主窗口编辑页新增悬浮式大纲入口，展开后以树状结构显示当前文档标题，并支持点击跳转。
- 重构 Zen 页面布局，使其采用“正文区 + 仅显示标题大纲的侧栏”结构，并要求关闭 Zen 后返回进入 Zen 前的页面。
- 为主工作台侧边栏和 Zen 大纲侧栏定义可拖拽调宽、宽度持久化和自动折叠规则，保证用户下次启动时继续沿用上次布局。

## Capabilities

### New Capabilities
- `main-window-editor-experience`: 主窗口编辑页的 Markdown 阅读/编辑切换、底部动作、大纲入口和顶部版式优化。
- `zen-outline-workspace`: Zen 页面的大纲侧栏布局、树状跳转和返回来源页面行为。
- `resizable-workbench-layout`: 主工作台与 Zen 侧栏的拖拽调宽、宽度记忆和主侧栏自动折叠规则。

### Modified Capabilities

## Impact

- 前端主窗口编辑链路：`src/views/NoteEditorView.vue`、`src/components/MarkdownEditor.vue`、`src/views/ZenMode.vue` 需要围绕阅读态、编辑态和 Zen 路由回退重组。
- 前端可能需要新增独立的 Markdown 阅读组件、大纲树组件、拖拽分隔条组件或对应 composable，例如 `src/components/*` 与 `src/composables/*`。
- 状态与持久化层需要扩展新的布局设置键，并接入现有 `settings` store / SQLite settings 表，以满足“重启后保持宽度”的要求。
- 主工作台壳层 `src/components/MainWorkbenchShell.vue` 与相关测试需要增加拖拽调宽、折叠阈值和恢复逻辑。
- 测试需要覆盖模式切换、Markdown 渲染、大纲跳转、Zen 返回来源页、拖拽调宽和宽度持久化。
