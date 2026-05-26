## Why

待办浮窗功能（add-todo-quick-panel）落地后，任务只能被动陈列在视图里，缺少两类核心能力：① **主动通知** —— 用户错过截止时间也得不到系统级提醒；② **完成洞察** —— 用户无法看到自己在过去一周/一月的任务节奏与活跃度。这两项是同类工具（MoliTodo、滴答清单）的标配，现阶段补齐能让 Steno 的待办从"记录工具"升级为"持续行动工具"。

## What Changes

### A. 提醒设置 + 系统通知
- 在 `StenoSettings` 新增 `reminderQuickOptions: ReminderOption[]` 字段，默认 6 项（30 分钟后 / 1 小时后 / 2 小时后 / 1 天后 / 下周 / 今天下午 4 点）。
- 在设置面板新增第 8 个分组「提醒设置」，提供可增/删/恢复默认的选项编辑器。
- TodoView 任务编辑器接入"快捷提醒选项"下拉 + 提醒时间字段；写入 `todos.reminder_time`。
- 引入 `tauri-plugin-notification` v2，前后端各装一份。
- Rust 端启动一个 tokio 后台调度任务（30s 周期），扫描 `reminder_time <= now() AND reminder_fired = 0 AND is_deleted = 0` 的待办，触发系统通知并把 `reminder_fired` 置 1。
- **BREAKING (DB schema)**: `todos` 表新增 `reminder_fired INTEGER NOT NULL DEFAULT 0` 与 `started_at TEXT NULL`，附迁移逻辑。

### B. 统计信息
- 引入 `echarts` + `vue-echarts`（按需引入 CalendarChart/LineChart）。
- 主窗口 `ui.mode` 新增 `stats` 模式，侧边栏（MainWorkbenchShell）新增"统计"入口。
- 新建 `StatsView.vue`，包含两块：① 任务活跃度（GitHub 风格日历热力图，最近 12 个月，按每日完成数着色）；② 每日状态趋势（折线图，创建/开始/完成三条线，可选最近 30/60/90 天，可选状态过滤）。
- 新增 3 个 Tauri 命令：`get_todo_activity` / `get_todo_daily_trend` / `reset_todo_stats`，并在前端 `todos` store 暴露对应 actions。
- `reset_todo_stats` 硬删除 `is_deleted=1` 与 `status='done'` 的所有待办，前端 NConfirm 二次确认。

### C. 任务状态机增强
- `update_todo` 命令：当 `status` 首次切换为 `doing` 时自动写入 `started_at`（已有 started_at 则保留），用于"开始"折线统计。

## Capabilities

### New Capabilities
- `todo-reminders`: 待办提醒选项配置、提醒时间字段、Rust tokio 调度器、系统通知触发流程。
- `todo-statistics`: 任务活跃度热力图、每日状态趋势折线图、统计聚合查询命令、重置数据。

### Modified Capabilities
- `todo-storage`: `todos` 表新增 `reminder_fired` 与 `started_at` 两列；新增向后兼容迁移；Todo DTO 暴露这两个字段；新增三个统计聚合查询函数。
- `todo-management`: `update_todo` 在 `status` 首次进入 `doing` 时自动填充 `started_at`；新增对 `reminder_time` 修改时清空 `reminder_fired` 的逻辑（防止改时间后不触发）。

## Impact

**代码影响**:
- `src-tauri/src/db.rs` — schema/迁移、3 个新查询函数、`update_todo` 状态机改造
- `src-tauri/src/commands.rs` — 3 个新 Tauri 命令、调度器入口
- `src-tauri/src/main.rs` 或 `lib.rs` — 注册新插件 + 启动调度器
- `src-tauri/Cargo.toml` — 新增 `tauri-plugin-notification` 依赖
- `src-tauri/capabilities/*.json` — 授予 `notification:default` 权限
- `src/stores/settings.ts` — 新增 `reminderQuickOptions` 字段及 DEFAULT
- `src/stores/todos.ts` — 暴露 `getActivity` / `getDailyTrend` / `resetStats` actions
- `src/views/SettingsView.vue` — 新增"提醒设置"标签页与列表编辑器
- `src/views/StatsView.vue` (**新文件**) — 统计视图
- `src/components/MainWorkbenchShell.vue` — 侧边栏新增"统计"入口
- `src/App.vue` — `ui.mode === 'stats'` 路由分支
- `src/types/steno.ts` — `ReminderOption` / `TodoActivityPoint` / `TodoTrendPoint` 类型
- `package.json` — 新增 `echarts`, `vue-echarts`, `@tauri-apps/plugin-notification`

**测试影响**:
- Rust：3 个统计查询函数单测、调度器单测（mock 时间）、迁移单测
- Vitest：settings store 默认值 + reminderQuickOptions 增删用例、todos store 新 actions 桩测

**性能影响**:
- 调度器轮询 30s 一次仅查 `reminder_time` 索引（已存在），影响可忽略
- 热力图查询数据量约 365 行/年，无分页压力
- echarts 按需引入预计 +150KB gzip
