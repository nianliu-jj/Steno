## ADDED Requirements

### Requirement: Zen 页面采用正文区与标题大纲侧栏布局
Steno SHALL 将 Zen 页面渲染为正文区与标题大纲侧栏并存的沉浸式布局，侧栏只承载当前文档的大纲信息。

#### Scenario: 打开 Zen 页面时显示大纲侧栏
- **WHEN** 用户进入某篇笔记的 Zen 页面
- **THEN** 系统 SHALL 显示正文编辑区与独立的大纲侧栏
- **AND** Zen 侧栏 MUST 不显示主工作台导航、全局搜索或其他非当前文档操作

#### Scenario: 当前文档没有可解析标题
- **WHEN** Zen 页面加载的文档不存在可解析的 Markdown 标题
- **THEN** 系统 SHALL 在大纲侧栏显示空状态
- **AND** 正文编辑区 MUST 仍可继续输入和保存

### Requirement: Zen 大纲侧栏支持树状跳转
Steno SHALL 在 Zen 页面侧栏中按照 Markdown 标题层级显示树状大纲，并允许用户从侧栏跳转到正文对应位置。

#### Scenario: 渲染树状标题大纲
- **WHEN** 当前文档包含多级 Markdown 标题
- **THEN** 系统 SHALL 按标题层级渲染树状大纲
- **AND** 系统 MUST 保留标题出现顺序

#### Scenario: 点击 Zen 大纲标题进行跳转
- **WHEN** 用户点击 Zen 侧栏中的任意标题节点
- **THEN** 系统 SHALL 将正文区定位到对应标题附近
- **AND** 系统 MUST 保持当前正文内容和保存状态不丢失

### Requirement: 退出 Zen 返回进入前的页面
Steno SHALL 在用户关闭 Zen 页面时返回进入 Zen 之前的页面，而不是固定回到某个默认页面。

#### Scenario: 使用关闭按钮退出 Zen
- **WHEN** 用户点击 Zen 页面关闭按钮
- **THEN** 系统 SHALL 退出 Zen 页面
- **AND** 系统 SHALL 返回进入 Zen 前的来源页面

#### Scenario: 使用快捷操作退出 Zen
- **WHEN** 用户通过 Zen 页面已定义的退出快捷操作离开 Zen
- **THEN** 系统 SHALL 在退出前完成当前保存流程
- **AND** 系统 SHALL 返回进入 Zen 前的来源页面
