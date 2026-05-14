## Context

项目当前已经存在 `MainWorkbenchShell.vue`、`MainView.vue`、`SettingsView.vue` 和设置弹窗入口，但它们主要完成了功能拆分，视觉结构仍保留早期临时实现。`docs/steno-layout-v2.html` 明确定义了主窗口的完整桌面应用布局：顶部标题栏、左侧可折叠 rail、主内容区、底部置顶剪贴板条和笔记卡片网格。`docs/steno-settings-modal.html` 明确定义了设置弹窗的品牌标题、顶部分类标签、滚动内容、底部操作栏和保存提示。

本次变更的核心约束是“按原型落地”，不是重新发明新的视觉语言。实现应尽量迁移原型中的设计 token、尺寸、密度、布局层级和交互状态，同时继续接入现有 Pinia store、Tauri 窗口封装、Naive UI 消息能力和测试体系。

## Goals / Non-Goals

**Goals:**

- 主窗口布局严格对齐 `steno-layout-v2.html` 的三行两列 grid、顶部标题栏、侧边 rail、主内容区和底部置顶条。
- 设置弹窗严格对齐 `steno-settings-modal.html` 的模态面板结构、分类标签、设置行、控件密度和底部操作栏。
- 保留现有业务能力：主窗口路由、笔记列表、新建笔记、速记浮窗、画布、搜索、设置自动保存、路径展示和 Tauri 窗口控制。
- 用测试锁定关键结构和交互：rail 折叠、导航、笔记卡片/空状态、设置分类切换、嵌入式弹窗关闭。
- 不引入新运行时依赖，不改变数据库 schema，不扩大未实现模块的业务范围。

**Non-Goals:**

- 不实现粘贴板、待办、截图、OCR、翻译的真实数据逻辑；这些入口仍作为规划中页面或导航占位。
- 不新增隐私安全、强调色、便签纸、应用排除名单等设置项的持久化字段。
- 不重写现有笔记 store、设置 store、Tauri Rust 命令或画布交互内核。
- 不把 HTML 原型文件本身改为生产入口；原型继续作为设计参考，Vue 组件承担正式实现。

## Decisions

### Decision 1: 主窗口由 `MainWorkbenchShell.vue` 承载完整 v2 外壳

`MainWorkbenchShell.vue` 负责实现原型中的 `.app`、`.topbar`、`.rail`、`.main` 和 `.bottombar` 五个区域，并通过插槽承载具体页面内容。这样主窗口布局、导航和窗口控制只在一个组件中维护，`MainView` 专注渲染笔记列表内容。

替代方案是把 v2 布局拆散到 `App.vue` 和每个 view 中。这会让原型中的全局布局规则分散，后续每个页面都要重复维护标题栏、rail 和底部条，因此不采用。

### Decision 2: 原型 CSS token 迁移为组件级 CSS 变量

主窗口和设置弹窗会复用原型中的 OKLCH 颜色、字号、边框、阴影和尺寸变量，并在 scoped 样式内定义。这样可以最大化还原原型，同时避免污染速记浮窗、Zen、sticky 等独立窗口。

替代方案是把所有 token 放进 `global.css`。这会增加对其他窗口的影响面，并可能改变已有独立窗口视觉，因此本次只在涉及组件内落地。

### Decision 3: 设置弹窗继续由 `MainView` 的 `NModal` 承载，`SettingsView` 只实现面板

主窗口点击设置时继续打开 `NModal`，背景保持工作台内容。`SettingsView` 负责弹窗内部的 header、tabs、body、footer 和设置项。独立 `settings` 模式仍可直接渲染同一面板作为兜底。

替代方案是在 `SettingsView` 内部管理 `NModal`。这会让独立模式、嵌入模式和测试关闭行为混在一起，也不利于复用现有主窗口入口，因此不采用。

### Decision 4: 笔记列表改为原型卡片网格，但保留真实数据

`MainView` 不直接复制原型里的静态笔记，而是将现有 `notes.notes` 映射为 `.note-card` 网格。存在真实笔记时显示卡片；没有笔记时显示原型中的空状态。页面操作区提供“有数据/空状态”的测试辅助切换可以不进入产品实现，生产行为以真实数据为空或非空决定。

替代方案是继续使用当前纵向列表。该列表无法满足用户“严格按照样式文件”的要求，也无法体现原型卡片密度，因此不采用。

### Decision 5: 底部置顶条第一版展示现有 pinned notes 或空态 chip

底部 `.bottombar` 属于原型强结构，必须出现。由于真实粘贴板模块尚未实现，底部条第一版从 `notes.pinned` 映射为置顶笔记 chip；没有置顶内容时显示清晰的本地占位 chip，不承诺真实剪贴板历史能力。

替代方案是暂时删除底部条，等粘贴板模块完成后再做。这会破坏原型的一阶布局结构，因此不采用。

## Risks / Trade-offs

- 原型样式较完整，迁移到 Vue 后容易与 Naive UI 默认样式冲突 -> 设置面板中只在必要控件上保留 Naive UI，外层结构和密度由自定义 class 控制。
- `MainWorkbenchShell` 变大后维护难度增加 -> 通过明确区域 class 和插槽边界控制复杂度，不在本次拆分额外抽象。
- 底部置顶条使用 pinned notes 与“置顶粘贴板”文案存在语义差异 -> 文案改为“置顶内容”，避免误导用户已有剪贴板功能。
- OKLCH 在旧浏览器中支持有限 -> 当前项目是 Tauri/WebView 场景，按现代 WebView 能力处理；若测试环境样式解析不影响逻辑测试。
- 设置弹窗内很多规划中项不可保存 -> 每个规划中项必须显示禁用态或“规划中/只读”，避免用户误认为操作失败。

## Migration Plan

1. 先以测试锁定 `MainWorkbenchShell` 的 v2 区域、导航折叠和窗口控制按钮。
2. 将 `MainWorkbenchShell.vue` 样式与结构迁移到原型 grid，并接入 nav、search、settings、language、collapse、bottom bar。
3. 改造 `MainView.vue` 为原型笔记卡片网格和空状态，继续使用真实 notes store。
4. 以测试锁定 `SettingsView` 的 v2 header、tabs、body、footer 和嵌入式关闭事件。
5. 将 `SettingsView.vue` 样式与模板迁移到设置原型，保留现有可保存设置项和路径展示。
6. 运行相关单测、类型检查和构建；如视觉迁移造成测试环境问题，优先调整测试选择器和结构，不降低产品布局要求。

## Open Questions

- 底部置顶条未来应由剪贴板模块还是 pinned notes 驱动；本次按 pinned notes 占位，后续粘贴板能力上线时再改数据源。
- 顶部搜索框第一版点击后是聚焦本地输入还是跳转搜索页；本次保留跳转搜索页和快捷键提示，避免实现即时跨模块检索。
- 设置弹窗确认/取消未来是否改为暂存提交模型；本次沿用自动保存，确认/取消只关闭弹窗。
