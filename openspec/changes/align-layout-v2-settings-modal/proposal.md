## Why

当前主窗口和设置弹窗已经完成一版功能性重构，但实际界面仍未严格贴合 `docs/steno-layout-v2.html` 与 `docs/steno-settings-modal.html` 的布局、密度和组件形态。现在需要把这两个 HTML 原型提升为实现合同，让项目界面从“接近工作台”收敛到可验收的 v2 视觉与交互规格。

## What Changes

- 主窗口外壳按 `docs/steno-layout-v2.html` 重做为三行两列桌面应用布局：顶部自定义标题栏、左侧可折叠导航、主内容区、底部置顶剪贴板条。
- 顶部标题栏必须包含品牌区、返回按钮、全局搜索框、快捷键提示和窗口控制按钮；交互控件不得触发窗口拖拽。
- 左侧导航必须支持展开/折叠状态，包含笔记列表、画布、粘贴板、待办、截图、OCR、翻译等入口，并保留底部设置、语言和折叠按钮。
- 笔记列表内容按原型改为卡片网格、空状态和页面操作区，不再使用当前快捷卡片加列表的临时布局。
- 设置入口打开的弹窗必须按 `docs/steno-settings-modal.html` 重做：顶部品牌与分类标签、滚动内容区、底部操作栏、保存提示和一致的桌面密度。
- 设置弹窗继续使用现有真实设置 store，不新增未落地字段；隐私安全、强调色、便签纸、应用排除名单等原型项以只读、禁用或规划中状态呈现。
- 更新测试覆盖主窗口 v2 结构、侧边栏折叠、设置弹窗分类切换和现有设置项渲染。

## Capabilities

### New Capabilities
- `workbench-layout-v2-alignment`: 主窗口严格对齐 `steno-layout-v2.html` 的桌面工作台布局、导航、笔记卡片、空状态和底部置顶条。
- `settings-modal-v2-alignment`: 设置弹窗严格对齐 `steno-settings-modal.html` 的模态面板结构、分类信息架构、操作栏和可持久化设置边界。

### Modified Capabilities
- 无。

## Impact

- 前端组件：重点影响 `src/components/MainWorkbenchShell.vue`、`src/views/MainView.vue`、`src/views/SettingsView.vue`、`src/App.vue`。
- 前端状态：需要在 `src/stores/ui.ts` 或壳层局部状态中支持侧边栏折叠、主窗口返回和设置弹窗打开方式。
- 测试：需要更新或补充 `MainWorkbenchShell.test.ts`、`MainView.test.ts`、`SettingsView.test.ts`，验证 v2 布局结构和弹窗行为。
- 样式：需要把原型中的 OKLCH 主题变量、网格尺寸、按钮密度、卡片形态和响应式约束迁移到 Vue 组件样式中。
- 依赖：不新增运行时依赖，继续使用 Vue 3、Pinia、Naive UI、Tauri 2 和现有窗口封装。
