## ADDED Requirements

### Requirement: 大纲入口使用图标按钮
Steno SHALL 把主窗口编辑页中的大纲入口由文字按钮替换为带列表图标的圆形图标按钮，与编辑页其它图标按钮（如标题编辑、标签编辑）的风格保持一致。

#### Scenario: 渲染大纲图标按钮
- **WHEN** 用户打开主窗口编辑页
- **THEN** 系统 SHALL 在编辑页正文区右下角渲染一个圆形图标按钮
- **AND** 系统 MUST 把按钮的 `aria-label` 与 `title` 都设为 "大纲"
- **AND** 系统 MUST 保留 `data-testid="note-outline-toggle"` 用于既有测试断言

#### Scenario: 大纲面板展开行为不变
- **WHEN** 用户点击大纲图标按钮
- **THEN** 系统 SHALL 像原文字按钮一样切换 `outlineOpen` 状态并展开/收起大纲面板

### Requirement: 大纲节点前显示标题等级徽章
Steno SHALL 在 `DocumentOutlineTree` 组件渲染的每个标题节点前显示一个置灰的等级徽章，等级文本格式为 `H1` ... `H6`，与节点的 Markdown 标题等级一致。

#### Scenario: 渲染等级徽章
- **WHEN** 当前文档包含一级、二级、三级标题
- **THEN** 系统 SHALL 在每个对应节点前分别渲染 `H1`、`H2`、`H3` 文本徽章
- **AND** 徽章 MUST 使用置灰的颜色与背景（区别于节点正文）
- **AND** 徽章与节点文本之间 MUST 保留可视间距（至少 6px）

#### Scenario: 多层级树仍可展开折叠
- **WHEN** 大纲存在嵌套层级
- **THEN** 系统 SHALL 让子节点继续使用其自身的 H 等级徽章
- **AND** 系统 SHALL NOT 改变现有的折叠/跳转交互
