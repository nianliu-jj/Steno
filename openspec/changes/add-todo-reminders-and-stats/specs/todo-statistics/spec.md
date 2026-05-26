## ADDED Requirements

### Requirement: 主窗口 SHALL 提供"统计"视图入口
主窗口 `ui.mode` 枚举 MUST 新增 `stats` 值；`MainWorkbenchShell` 侧边栏 MUST 新增一个"统计"导航项（图标 + 文案 + 当前选中态）。点击该项后 `ui.setMode('stats')` 将主区切换到 `StatsView`。该入口 MUST 位于"待办"之下、"设置"之上。

#### Scenario: 点击侧边栏统计入口切换视图
- **WHEN** 用户在主窗口侧栏点击"统计"
- **THEN** `ui.mode` 变为 `'stats'`，主区渲染 `StatsView`，"统计"导航项高亮

#### Scenario: 切换其它视图后再切回统计
- **WHEN** 用户在统计视图选好"最近 90 天"过滤，切到"待办"后再切回"统计"
- **THEN** StatsView 的过滤条件 SHALL 在组件生命周期内保留（不需要跨重启持久化）

### Requirement: StatsView SHALL 呈现任务活跃度日历热力图
StatsView 顶部 MUST 渲染一个 GitHub 风格的日历热力图，覆盖"最近 12 个月"。横轴为月份（从最早月到当前月，从左到右），纵轴为周一/三/五/日。每个格子的颜色深浅 SHALL 反映当天完成（status='done' 且 completed_at 在该日）任务数：0 / 1–2 / 3–5 / 6–9 / ≥10 五个等级。

#### Scenario: 热力图数据加载
- **WHEN** 用户进入 StatsView
- **THEN** 系统 SHALL 调用 `get_todo_activity({ start: <12 个月前>, end: <今天> })` 获取每日完成数，并渲染热力图

#### Scenario: 热力图鼠标悬停显示明细
- **WHEN** 用户鼠标悬停在某个格子上
- **THEN** SHALL 弹出 tooltip 显示该日的完整日期与完成任务数（如 "2026-05-20: 完成 4 个任务"）

#### Scenario: 没有完成记录的天显示为最浅色
- **WHEN** 某天的完成数为 0
- **THEN** 该格子 SHALL 使用主题"无活动"颜色（暗色模式与亮色模式各有一套），不显示 tooltip 计数

### Requirement: StatsView SHALL 呈现每日状态趋势折线图
StatsView 中部 MUST 渲染一个折线图，X 轴为日期，Y 轴为任务数。MUST 提供 3 条线："创建"（按 `created_at` 日聚合）、"开始"（按 `started_at` 日聚合）、"完成"（按 `completed_at` 日聚合）。图表上方 MUST 提供两个下拉：① 时间范围（最近 30 天 / 60 天 / 90 天，默认 30 天）② 状态过滤（全部 / 今日 / 计划中 / 进行中 / 暂停 / 已完成，默认全部）。

#### Scenario: 切换时间范围
- **WHEN** 用户将时间范围从"最近 30 天"改为"最近 90 天"
- **THEN** 系统 SHALL 重新调用 `get_todo_daily_trend({ start: <90 天前>, end: <今天>, statusFilter: <当前过滤> })`，折线图重绘

#### Scenario: 切换状态过滤
- **WHEN** 用户将状态过滤从"全部"改为"进行中"
- **THEN** 折线图 SHALL 只对 `status='doing'` 的任务做创建/开始/完成日聚合

#### Scenario: 折线图鼠标悬停显示明细
- **WHEN** 用户鼠标悬停在某天上
- **THEN** tooltip SHALL 同时显示该日的创建/开始/完成三个数值

### Requirement: 后端 SHALL 提供任务活跃度查询命令
Tauri 后端 MUST 暴露 `get_todo_activity(input: { start: string, end: string }) -> Vec<TodoActivityPoint>` 命令。`TodoActivityPoint` 结构 MUST 为 `{ date: 'YYYY-MM-DD', count: number }`。返回数组 MUST 按 date 升序，仅包含 `count > 0` 的日期（前端补 0 渲染）。

#### Scenario: 返回完成任务的日聚合
- **WHEN** 数据库中 2026-05-20 完成了 3 个任务、2026-05-21 完成了 1 个任务
- **THEN** `get_todo_activity({ start: '2026-05-19', end: '2026-05-22' })` 返回 `[{ date: '2026-05-20', count: 3 }, { date: '2026-05-21', count: 1 }]`

#### Scenario: 忽略已删除任务
- **WHEN** 某日完成了 5 个任务，其中 2 个已被 `is_deleted=1`
- **THEN** `get_todo_activity` SHALL 返回该日 count=3（不计已删除）

### Requirement: 后端 SHALL 提供每日状态趋势查询命令
Tauri 后端 MUST 暴露 `get_todo_daily_trend(input: { start: string, end: string, statusFilter?: 'all'|'todo'|'doing'|'paused'|'done' }) -> Vec<TodoTrendPoint>` 命令。`TodoTrendPoint` 结构 MUST 为 `{ date: 'YYYY-MM-DD', created: number, started: number, completed: number }`。返回数组 MUST 按 date 升序，包含查询范围内每一天（无活动天 created/started/completed 均为 0）。

#### Scenario: 全部状态时三类计数都返回
- **WHEN** 调用 `get_todo_daily_trend({ start, end, statusFilter: 'all' })`
- **THEN** 每个数据点 SHALL 同时含 created/started/completed 三个字段

#### Scenario: 状态过滤生效
- **WHEN** 调用 `get_todo_daily_trend({ start, end, statusFilter: 'doing' })`
- **THEN** 仅对 `status='doing'` 的任务做创建/开始/完成日聚合（这种过滤下 completed 可能恒为 0，符合预期）

#### Scenario: 范围内无活动天补零
- **WHEN** 查询范围 7 天，仅其中 2 天有创建任务
- **THEN** 返回数组长度 = 7，其余 5 天的 created/started/completed 均为 0

### Requirement: 后端 SHALL 提供重置统计数据命令
Tauri 后端 MUST 暴露 `reset_todo_stats() -> Result<usize>` 命令，硬删除 `is_deleted=1` 与 `status='done'` 的所有任务（DELETE FROM todos），返回受影响行数。该命令 MUST 在事务中执行，并在成功后 `emit("steno:todo-changed", { kind: 'reset' })` 通知所有窗口刷新缓存。

#### Scenario: 重置成功
- **WHEN** 数据库中有 15 条 `is_deleted=1` + 8 条 `status='done'`，调用 `reset_todo_stats()`
- **THEN** 命令返回 `Ok(23)`，相关行从数据库物理删除，`steno:todo-changed kind='reset'` 事件被广播

#### Scenario: 不影响活动任务
- **WHEN** 调用 `reset_todo_stats()`
- **THEN** `status` 为 `todo/doing/paused` 且未删除的任务 SHALL 保持完整不动

### Requirement: 前端 SHALL 对重置数据做二次确认
StatsView 的"重置数据"按钮 MUST 在点击后弹出 NConfirm 二次确认对话框，明确告知"将永久删除所有已完成和已删除的任务，不可恢复"。仅在用户点击"确认"后才调用后端 `reset_todo_stats` 命令。

#### Scenario: 二次确认对话框
- **WHEN** 用户点击"重置数据"按钮
- **THEN** 弹出 NConfirm，标题"确认重置数据"、内容含"永久删除"和"不可恢复"字样、按钮分别为"取消"与"确认重置"

#### Scenario: 取消后无影响
- **WHEN** 用户在确认框点"取消"
- **THEN** 系统 SHALL 不调用后端命令，数据库无变化

#### Scenario: 确认后刷新统计视图
- **WHEN** 用户点"确认重置"，命令成功返回
- **THEN** 系统 SHALL 显示成功 toast（含删除条数），并重新调用 activity / daily-trend 接口刷新两块图表
