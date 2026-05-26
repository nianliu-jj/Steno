## ADDED Requirements

### Requirement: 提醒选项配置 SHALL 持久化在用户设置中
系统 SHALL 在 `StenoSettings` 中新增字段 `reminderQuickOptions: ReminderOption[]`，由现有 `settings` 模块统一持久化（SQLite）。`ReminderOption` 结构 MUST 满足：`{ id: string, label: string, type: 'relative' | 'absolute', value: number, unit: 'minute' | 'hour' | 'day', absoluteTime?: 'HH:mm', dayOffset?: number }`。当 `type='relative'` 时 `value` 与 `unit` 必填；当 `type='absolute'` 时 `absoluteTime` 与 `dayOffset` 必填。

#### Scenario: 默认提醒选项在首次启动时被填充
- **WHEN** 用户首次启动应用、`reminderQuickOptions` 在 settings 中为空
- **THEN** 系统 SHALL 写入 6 个默认选项：30 分钟后 / 1 小时后 / 2 小时后 / 1 天后 / 下周 / 今天下午 4 点

#### Scenario: 提醒选项跨重启保留
- **WHEN** 用户增删提醒选项后重启应用
- **THEN** 重启后 `reminderQuickOptions` 与关闭前完全一致

#### Scenario: 拒绝不合法的提醒选项
- **WHEN** 前端尝试写入 `type='relative'` 但 `value <= 0` 或 `unit` 非法的选项
- **THEN** 系统 SHALL 拒绝该写入并保留原值

### Requirement: 设置面板 SHALL 提供提醒选项编辑器
设置面板 MUST 新增第 8 个分组「提醒设置」，展示当前 `reminderQuickOptions` 的可编辑列表。每行 MUST 提供：label 输入框、type 切换（相对/绝对）、value 数字框、unit 下拉（分钟/小时/天）或 absoluteTime 选择器 + dayOffset 数字框、删除按钮。底部 MUST 提供"添加选项"与"恢复默认"两个动作。

#### Scenario: 添加新提醒选项
- **WHEN** 用户在"提醒设置"分组点击"添加选项"
- **THEN** 列表底部出现一行空选项，默认 `type='relative', value=15, unit='minute', label='15 分钟后'`，可立即编辑

#### Scenario: 删除提醒选项
- **WHEN** 用户点击某行右侧删除按钮
- **THEN** 该选项从列表移除并立即持久化；如果列表清空，下次唤起任务编辑器的提醒下拉时仅显示"无提醒"

#### Scenario: 恢复默认提醒选项
- **WHEN** 用户点击"恢复默认"
- **THEN** 系统弹出二次确认（NConfirm），确认后用 6 个默认选项覆盖当前列表

### Requirement: 任务编辑器 SHALL 支持设置提醒时间
TodoView 与浮窗的任务编辑器 MUST 提供"提醒"字段，包含两个入口：① 快捷选项下拉（展示当前 `reminderQuickOptions`）② 自定义时间选择器。选中快捷选项 SHALL 立即把对应时刻计算为 RFC3339 写入 `todos.reminder_time`。

#### Scenario: 通过快捷选项设置提醒
- **WHEN** 用户在新建任务时选择"1 小时后"
- **THEN** 任务的 `reminder_time` 被设为 `now() + 1 小时` 的 RFC3339 字符串，`reminder_fired` 为 0

#### Scenario: 通过自定义时间设置提醒
- **WHEN** 用户选择"自定义"并设定 2026-05-30 14:00
- **THEN** 任务的 `reminder_time` 被设为该时刻的 RFC3339；保存后任务行 SHALL 显示"将于 5/30 14:00 提醒"

#### Scenario: 修改提醒时间重置已触发标记
- **WHEN** 用户对一条 `reminder_fired=1` 的任务重新设置 `reminder_time`
- **THEN** 系统 MUST 将 `reminder_fired` 重置为 0，使新时间能再次触发通知

#### Scenario: 清除提醒时间
- **WHEN** 用户在编辑器选择"无提醒"
- **THEN** 任务 `reminder_time` 设为 NULL，`reminder_fired` 设为 0，调度器跳过该任务

### Requirement: 后端调度器 SHALL 周期性扫描并触发系统通知
Rust 后端 MUST 在应用启动时启动一个 tokio 后台任务，周期 30 秒。每个周期 SHALL 查询 `reminder_time IS NOT NULL AND reminder_time <= now() AND reminder_fired = 0 AND is_deleted = 0 AND status != 'done'` 的待办，逐条调用 `tauri-plugin-notification` 触发系统通知（title=任务内容截断 80 字，body=提醒时间），并将命中行的 `reminder_fired` 置 1。

#### Scenario: 提醒时间到期触发通知
- **WHEN** 任务 reminder_time 为 1 分钟前、未触发、未删除、未完成
- **THEN** 在下一个调度周期（≤30 秒内），用户 SHALL 收到系统通知；任务的 `reminder_fired` 变为 1

#### Scenario: 已完成任务不再触发通知
- **WHEN** 任务 `status='done'` 且 reminder_time 已过期
- **THEN** 调度器 SHALL 跳过该任务，不触发系统通知

#### Scenario: 已删除任务不再触发通知
- **WHEN** 任务 `is_deleted=1` 且 reminder_time 已过期
- **THEN** 调度器 SHALL 跳过该任务，不触发系统通知

#### Scenario: 通知仅触发一次
- **WHEN** 同一任务连续两个调度周期都满足触发条件
- **THEN** 用户 SHALL 只收到一次通知（首次触发时 `reminder_fired` 已置 1）

#### Scenario: 应用关闭后重启的待触发提醒
- **WHEN** 应用关闭期间任务到了提醒时间但未触发；用户重新启动应用
- **THEN** 应用启动后第一个调度周期（≤30 秒）SHALL 触发该过期通知

### Requirement: 通知权限 SHALL 在首次启动时请求
系统 MUST 在应用启动且检测到任何待办存在 `reminder_time` 时，调用 `tauri-plugin-notification` 的 `requestPermission` 询问用户是否允许桌面通知。若用户拒绝，调度器 SHALL 继续扫描并标记 `reminder_fired=1`（保证不重复弹出），但不再调用通知 API。

#### Scenario: 用户授予通知权限
- **WHEN** 用户在系统弹窗中选择"允许"
- **THEN** 后续提醒到期时系统通知正常弹出

#### Scenario: 用户拒绝通知权限
- **WHEN** 用户在系统弹窗中选择"不允许"
- **THEN** 后续提醒到期时不弹通知，但任务 `reminder_fired` 仍置 1（避免重复尝试）；TodoView 任务行 SHALL 显示一个"已过期未提醒"小角标
