## ADDED Requirements

### Requirement: 主编辑页与 Zen 默认进入排版编辑态
Steno SHALL 让主编辑页与 Zen 页默认以排版编辑态打开笔记，使用户直接在排版后的内容上编辑，而不是先看到原始 Markdown 文本。

#### Scenario: 从主窗口打开已有笔记
- **WHEN** 用户在主窗口进入一条已有笔记的编辑页
- **THEN** 系统 SHALL 直接显示该笔记的排版编辑界面
- **AND** 系统 MUST 不默认展示原始 Markdown 文本面板

#### Scenario: 从主窗口创建空白草稿
- **WHEN** 用户从主窗口新建一条笔记草稿
- **THEN** 系统 SHALL 以排版编辑态打开空白草稿
- **AND** 系统 SHALL 允许用户直接在排版界面开始输入

### Requirement: 主编辑页与 Zen 共享三态编辑模型
Steno SHALL 在主编辑页与 Zen 页中共享三态编辑模型：排版编辑态、只读态、代码态。

#### Scenario: 只读按钮切换排版编辑态与只读态
- **WHEN** 用户在排版编辑态点击只读/编辑切换按钮
- **THEN** 系统 SHALL 切换到只读态并保留当前排版内容
- **AND** 用户再次点击该按钮时，系统 SHALL 返回排版编辑态

#### Scenario: 从排版编辑态进入代码态
- **WHEN** 用户在排版编辑态点击代码模式按钮
- **THEN** 系统 SHALL 打开当前笔记的原始 Markdown 文本视图
- **AND** 系统 SHALL 将当前模式切换为代码态

#### Scenario: 从只读态进入代码态
- **WHEN** 用户在只读态点击代码模式按钮
- **THEN** 系统 SHALL 自动退出只读态
- **AND** 系统 SHALL 进入可编辑的代码态

#### Scenario: 从代码态返回排版态
- **WHEN** 用户从代码态切回排版界面
- **THEN** 系统 SHALL 返回排版编辑态
- **AND** 系统 MUST 不回到只读态

### Requirement: 代码态必须显示并编辑原始 Markdown
Steno SHALL 在代码态中向用户暴露当前笔记的原始 Markdown 文本，并将该文本作为底层保存内容的一部分继续参与渲染、自动保存与导出。

#### Scenario: 进入代码态后显示当前 Markdown
- **WHEN** 用户从排版界面切换到代码态
- **THEN** 系统 SHALL 显示当前笔记对应的原始 Markdown 文本
- **AND** 代码态中的文本 MUST 与当前笔记的保存内容保持同一份文档上下文

#### Scenario: 在代码态修改后返回排版界面
- **WHEN** 用户在代码态修改 Markdown 文本并切回排版界面
- **THEN** 系统 SHALL 按更新后的 Markdown 重新呈现排版内容
- **AND** 系统 SHALL 继续沿用当前笔记的自动保存、标签抽取与导出链路

### Requirement: 主编辑页底部必须提供写作控制入口
Steno SHALL 在主编辑页底部状态栏提供只读/编辑切换、代码模式切换和进入 Zen 模式的入口。

#### Scenario: 底部状态栏展示三类入口
- **WHEN** 用户打开主窗口笔记编辑页
- **THEN** 系统 SHALL 在底部状态栏显示只读/编辑切换入口
- **AND** 系统 SHALL 显示代码模式切换入口与进入 Zen 模式入口

#### Scenario: 从主编辑页进入 Zen 模式
- **WHEN** 用户在主编辑页点击进入 Zen 模式入口
- **THEN** 系统 SHALL 以当前笔记或当前草稿上下文打开 Zen 页
- **AND** Zen 页 MUST 共享该笔记当前的标题与正文内容

### Requirement: 关闭 Zen 时返回进入前页面
Steno SHALL 在关闭 Zen 时返回用户进入 Zen 前所在的页面，而不是固定返回笔记列表。

#### Scenario: 从主编辑页进入 Zen 后退出
- **WHEN** 用户从主编辑页进入 Zen 并执行关闭 Zen
- **THEN** 系统 SHALL 返回同一条笔记对应的主编辑页
- **AND** 系统 SHALL 保留该主编辑页的当前上下文

#### Scenario: 从画布进入 Zen 后退出
- **WHEN** 用户从画布进入 Zen 并执行关闭 Zen
- **THEN** 系统 SHALL 返回进入前的画布页面
- **AND** 系统 MUST 不强制跳转回主列表页
