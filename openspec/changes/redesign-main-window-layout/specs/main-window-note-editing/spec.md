## ADDED Requirements

### Requirement: 笔记列表入口分流
Steno SHALL 在主窗口中区分“新建笔记”和“新建速记”两类入口，避免把常规笔记编辑和浮窗速记混为同一工作流。

#### Scenario: 从主窗口新建笔记
- **WHEN** 用户在笔记列表页点击“新建笔记”
- **THEN** 系统 SHALL 在主窗口内打开新的笔记编辑页
- **AND** 系统 MUST 不打开 quicknote 浮窗

#### Scenario: 从主窗口新建速记
- **WHEN** 用户在主窗口点击“新建速记”
- **THEN** 系统 SHALL 打开 quicknote 浮窗
- **AND** 主窗口当前页面 MUST 保持不变

### Requirement: 主窗口笔记编辑页
Steno SHALL 提供主窗口内的标准笔记编辑页，用于创建新笔记和编辑既有笔记。

#### Scenario: 从列表打开已有笔记
- **WHEN** 用户在笔记列表中选择一条已有笔记进行编辑
- **THEN** 系统 SHALL 在主窗口内打开该笔记的编辑页
- **AND** 编辑页 MUST 加载该笔记当前的标题、正文和标签

#### Scenario: 创建空白笔记草稿
- **WHEN** 用户从笔记列表进入新的笔记编辑页
- **THEN** 系统 SHALL 提供空白标题和正文输入区
- **AND** 编辑页 MUST 允许用户在主窗口内完成首次保存

### Requirement: 主窗口编辑返回与上下文保持
Steno SHALL 在主窗口编辑页与笔记列表之间保持可逆导航，并尽量保留工作台上下文。

#### Scenario: 从编辑页返回笔记列表
- **WHEN** 用户从主窗口编辑页执行返回操作
- **THEN** 系统 SHALL 回到笔记列表页
- **AND** 列表页 MUST 保留最近一次的滚动位置、筛选状态或页面上下文（如果该状态存在）

#### Scenario: 编辑页自动保存后继续切换页面
- **WHEN** 用户在主窗口编辑页完成编辑并切换到其他工作台页面
- **THEN** 系统 SHALL 以当前项目既有的保存策略持久化笔记内容
- **AND** 系统 MUST 不影响 quicknote 浮窗的保存与关闭逻辑
