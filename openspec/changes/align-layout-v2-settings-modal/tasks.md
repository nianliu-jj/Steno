## 1. 主窗口 v2 外壳

- [x] 1.1 更新 `MainWorkbenchShell.test.ts`，覆盖顶部标题栏、rail、主内容区、底部置顶内容条和窗口控制按钮渲染
- [x] 1.2 将 `MainWorkbenchShell.vue` 重构为 `steno-layout-v2.html` 的三行两列 grid 布局
- [x] 1.3 接入品牌区、返回按钮、搜索框、快捷键提示和窗口控制按钮，并确保交互控件不触发拖拽
- [x] 1.4 实现 rail 导航项、激活态、底部设置/语言/折叠按钮和展开/折叠状态
- [x] 1.5 实现底部置顶内容条，优先展示置顶笔记，没有数据时展示明确占位
- [x] 1.6 为主窗口 v2 布局补充窄屏响应式规则，确保 rail 折叠和长文本截断可用

## 2. 笔记列表 v2 内容

- [x] 2.1 更新 `MainView.test.ts`，覆盖有笔记时的卡片网格、无笔记时的空状态和“新建笔记”入口
- [x] 2.2 将 `MainView.vue` 从快捷卡片加纵向列表改为原型的笔记卡片网格
- [x] 2.3 保留真实 notes store 数据映射，显示标题、摘要、标签、更新时间和置顶标记
- [x] 2.4 实现原型风格空状态，继续支持从空状态进入主窗口笔记编辑页
- [x] 2.5 调整页面操作区，使“筛选”和“新建笔记”匹配原型按钮密度，并保留速记浮窗入口的可访问位置

## 3. 设置弹窗 v2 面板

- [x] 3.1 更新 `SettingsView.test.ts`，覆盖 v2 header、分类标签、底部操作栏、存储路径渲染和关闭事件
- [x] 3.2 将 `SettingsView.vue` 结构重构为 `steno-settings-modal.html` 的顶部品牌/分类标签、滚动 body、底部 footer 布局
- [x] 3.3 按原型密度调整常规、外观、快捷键、隐私安全、存储、关于分类的设置行和控件样式
- [x] 3.4 保留现有可持久化设置的保存逻辑，确保未持久化原型项使用禁用、只读或规划中文案
- [x] 3.5 确保存储路径不使用高亮代码组件，避免 `hljs is not set` 控制台警告
- [x] 3.6 补充设置弹窗浅色、深色和小窗口响应式样式

## 4. 集成与回归

- [x] 4.1 在 `App.vue` 和主窗口入口中确认所有工作台页面共享 v2 外壳，设置按钮打开模态框
- [x] 4.2 运行 `pnpm vitest run src/components/MainWorkbenchShell.test.ts src/views/MainView.test.ts src/views/SettingsView.test.ts`
- [x] 4.3 运行 `pnpm typecheck`
- [x] 4.4 运行 `pnpm build`
- [x] 4.5 检查 `git diff`，确认修改范围只涉及本次布局、设置弹窗和相关测试
