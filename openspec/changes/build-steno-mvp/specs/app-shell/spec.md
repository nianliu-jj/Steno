## ADDED Requirements

### Requirement: 后台启动与托盘常驻
Steno SHALL 在桌面平台启动后默认不显示主窗口，并在系统托盘或 macOS 状态栏中提供常驻入口。

#### Scenario: 启动后保持后台待命
- **WHEN** 用户启动 Steno
- **THEN** 系统 SHALL 创建托盘或状态栏图标
- **AND** 系统 MUST 不显示主窗口
- **AND** 系统 MUST 不主动抢占当前应用焦点

#### Scenario: 托盘菜单显示核心入口
- **WHEN** 用户点击或右键打开 Steno 托盘菜单
- **THEN** 系统 SHALL 显示“新建速记”“显示置顶便签”“打开画布”“搜索”“设置”“退出”等入口

### Requirement: 全局快捷键呼出
Steno SHALL 注册默认全局快捷键，并允许用户在任意应用中呼出速记浮窗。

#### Scenario: macOS 默认快捷键
- **WHEN** Steno 在 macOS 后台运行且用户按下 `Cmd+Shift+N`
- **THEN** 系统 SHALL 打开速记浮窗
- **AND** 编辑器 MUST 自动获得焦点

#### Scenario: Windows 和 Linux 默认快捷键
- **WHEN** Steno 在 Windows 或 Linux 后台运行且用户按下 `Ctrl+Shift+N`
- **THEN** 系统 SHALL 打开速记浮窗
- **AND** 编辑器 MUST 自动获得焦点

#### Scenario: 快捷键冲突反馈
- **WHEN** 用户保存一个已被占用或无效的全局快捷键
- **THEN** 系统 SHALL 显示冲突或注册失败原因
- **AND** 系统 MUST 保留上一个可用快捷键

### Requirement: 多窗口生命周期
Steno SHALL 使用独立 Tauri WebView 窗口承载速记浮窗、置顶便签、画布、Zen 写作、搜索和设置。

#### Scenario: 速记浮窗单例
- **WHEN** 速记浮窗已经存在且用户再次触发新建速记
- **THEN** 系统 SHALL 聚焦已有速记浮窗
- **AND** 系统 MUST 不创建第二个未固定速记浮窗

#### Scenario: 置顶便签多实例
- **WHEN** 用户将多条不同笔记钉到桌面
- **THEN** 系统 SHALL 为每条笔记创建独立置顶窗口
- **AND** 每个窗口 label MUST 与笔记 id 稳定关联

### Requirement: 退出行为
Steno SHALL 区分隐藏窗口和退出应用。

#### Scenario: 关闭普通窗口
- **WHEN** 用户点击主窗口、画布窗口、搜索窗口或设置窗口的关闭按钮
- **THEN** 系统 SHALL 隐藏对应窗口或释放该窗口
- **AND** 系统 MUST 保持托盘常驻

#### Scenario: 托盘菜单退出
- **WHEN** 用户从托盘菜单选择“退出”
- **THEN** 系统 SHALL 保存待写入数据
- **AND** 系统 SHALL 注销全局快捷键并退出进程
