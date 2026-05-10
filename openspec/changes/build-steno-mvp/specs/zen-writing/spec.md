## ADDED Requirements

### Requirement: Zen 写作窗口
Steno SHALL 提供全屏无干扰写作窗口。

#### Scenario: 从笔记进入 Zen 模式
- **WHEN** 用户选择一条笔记并进入 Zen 模式
- **THEN** 系统 SHALL 打开全屏 Zen 窗口
- **AND** 系统 SHALL 加载该笔记标题和 Markdown 内容

#### Scenario: 从空白进入 Zen 模式
- **WHEN** 用户从菜单创建新的 Zen 写作
- **THEN** 系统 SHALL 创建新笔记草稿
- **AND** 系统 SHALL 在全屏 Zen 窗口中打开该草稿

### Requirement: 无干扰界面
Steno SHALL 在 Zen 模式中隐藏非写作相关界面。

#### Scenario: 只显示写作必要信息
- **WHEN** Zen 模式处于编辑状态
- **THEN** 系统 SHALL 只显示标题、正文编辑器、字数、保存状态和退出入口
- **AND** 系统 MUST 隐藏画布、便签列表、搜索面板和设置面板

### Requirement: Zen 自动保存与退出
Steno SHALL 在 Zen 模式中自动保存内容，并支持快捷键退出。

#### Scenario: 编辑自动保存
- **WHEN** 用户在 Zen 模式中停止输入至少 1 秒
- **THEN** 系统 SHALL 保存当前标题和正文
- **AND** 系统 SHALL 更新保存状态

#### Scenario: Esc 退出
- **WHEN** 用户按下 `Esc`
- **THEN** 系统 SHALL 保存当前内容
- **AND** 系统 SHALL 关闭 Zen 窗口并返回之前上下文
