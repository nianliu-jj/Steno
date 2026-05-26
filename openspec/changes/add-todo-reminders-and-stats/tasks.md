## 1. Phase A1 — 后端通知插件接入与 schema 演进

- [x] 1.1 在 `src-tauri/Cargo.toml` 新增 `tauri-plugin-notification = "2"` 依赖
- [x] 1.2 在 `src-tauri/capabilities/default.json`（或现有 capability 文件）加 `notification:default` 权限
- [x] 1.3 在 `src-tauri/src/lib.rs`（或 `main.rs`）`.plugin(tauri_plugin_notification::init())` 注册插件
- [x] 1.4 在 `package.json` 新增 `@tauri-apps/plugin-notification` 前端 SDK 依赖（`pnpm add`）
- [x] 1.5 在 `db.rs` 的 `init_db` 流程加列存在性检查：通过 `PRAGMA table_info(todos)` 探测，缺失则 `ALTER TABLE` 增加 `reminder_fired INTEGER NOT NULL DEFAULT 0` 与 `started_at TEXT NULL`
- [x] 1.6 在 `db.rs` 的 `CREATE TABLE IF NOT EXISTS todos` 语句也补全这两列（新装路径覆盖）
- [x] 1.7 在 `init_db` 增加 `CREATE INDEX IF NOT EXISTS idx_todos_reminder_time ON todos(reminder_time)` 与 `idx_todos_completed_at ON todos(completed_at)`
- [x] 1.8 在 `Todo` Rust struct 与序列化 DTO 上增加 `reminder_fired: bool` 与 `started_at: Option<String>` 字段，并保证向前端 JSON 输出 camelCase
- [x] 1.9 在 `src/types/steno.ts` 的 `Todo` 类型加 `reminderFired: boolean` 与 `startedAt: string | null`
- [x] 1.10 写 `cargo test` 单测：旧 schema → 升级 → 新列存在；新 schema 直建 → 列齐全；多次 init_db 幂等
- [x] 1.11 提交：`feat(backend): 待办提醒/统计 Phase A1 — notification 插件 + schema 演进` (ef285b2)

## 2. Phase A2 — 后端调度器与状态机增强

- [x] 2.1 在 `commands.rs` `update_todo` 中实现"`status` 首次从非 `doing` 切到 `doing` 时填充 `started_at`"（已有时不覆盖）
- [x] 2.2 在 `commands.rs` `update_todo` 中实现"`reminder_time` 修改时 `reminder_fired=0`"
- [x] 2.3 新建 `src-tauri/src/reminder_scheduler.rs`：导出 `start_scheduler(app_handle: AppHandle, db: Db)` 函数；内部 `tokio::spawn` 起 30s 周期循环
- [x] 2.4 调度循环逻辑：查询 `reminder_time <= now() AND reminder_fired=0 AND is_deleted=0 AND status != 'done'`；限制每周期最多 10 条；逐条调用 `app_handle.notification().builder().title(...).body(...).show()`；用 CAS UPDATE `SET reminder_fired=1 WHERE id=? AND reminder_time=?` 防止竞态
- [x] 2.5 在 `lib.rs` `setup` hook 中调用 `start_scheduler`；并实现首次启动时的权限请求逻辑（检测 `permissionState` + 有 reminder_time 任务才 requestPermission）
- [x] 2.6 写 `cargo test`：mock `now()` 时间，验证：到期任务被标 fired / 已完成跳过 / 已删除跳过 / 同任务不重复触发
- [x] 2.7 提交：`feat(backend): 待办提醒/统计 Phase A2 — reminder scheduler + started_at 状态机`

## 3. Phase A3 — Settings 模型扩展

- [x] 3.1 在 `src/types/steno.ts` 新增 `ReminderOption` 类型（id/label/type/value/unit/absoluteTime/dayOffset）
- [x] 3.2 在 `src/stores/settings.ts` 的 `StenoSettings` 接口加 `reminderQuickOptions: ReminderOption[]`
- [x] 3.3 在 `DEFAULT_SETTINGS` 中加入 6 个默认选项（30 分钟后 / 1 小时后 / 2 小时后 / 1 天后 / 下周 / 今天下午 4 点）
- [x] 3.4 在 settings store 持久化序列化路径中处理数组类型（已有 JSON 序列化路径则直接通过）
- [x] 3.5 vitest：默认值正确填充 / 增删持久化 / 拒绝非法 `value <= 0` 选项
- [x] 3.6 提交：`feat(settings): 待办提醒/统计 Phase A3 — reminderQuickOptions 字段与默认 6 项`

## 4. Phase A4 — 设置面板「提醒设置」UI

- [x] 4.1 在 `SettingsView.vue` 的标签页列表中插入"提醒设置"，位于"待办浮窗"和"隐私安全"之间
- [x] 4.2 实现编辑器组件（行内式）：每行 label 输入 + type 选择（NRadio）+ value/unit/absoluteTime/dayOffset 字段 + 删除按钮（红色）
- [x] 4.3 顶部添加"添加选项"按钮 + "恢复默认"按钮（恢复默认走 NConfirm）
- [x] 4.4 实现"添加选项"逻辑：生成 nanoid id、push 默认值到数组
- [x] 4.5 暗色模式样式：复用现有 `--app-*` CSS 变量；删除按钮用 var(--app-danger) 或硬编码红色
- [x] 4.6 vitest（如可行）或 vue-tsc typecheck 通过
- [x] 4.7 提交：`feat(frontend): 待办提醒/统计 Phase A4 — 设置面板提醒设置分组`

## 5. Phase A5 — TodoView 集成提醒选择器

- [ ] 5.1 在任务行 / 任务编辑器中新增"提醒"按钮（与现有"日期"按钮并列）
- [ ] 5.2 实现下拉弹层：列出当前 `reminderQuickOptions` + "自定义" + "无提醒"
- [ ] 5.3 选中快捷选项时通过 `computeReminderTime(option, now)` 计算 RFC3339 写入 `reminder_time`
- [ ] 5.4 选中"自定义"打开 NDatePicker（type='datetime'）
- [ ] 5.5 任务行 SHALL 显示当前已设提醒（如"将于 5/30 14:00 提醒"，已过期且 fired=0 显示警告小角标）
- [ ] 5.6 在 `todos` store 的 `updateTodo` action 调用中正确传递 `reminder_time`、`reminder_fired` 字段
- [ ] 5.7 vitest：computeReminderTime 各种 type/unit 组合返回正确时间
- [ ] 5.8 提交：`feat(frontend): 待办提醒/统计 Phase A5 — TodoView 接入提醒选择器`

## 6. Phase B1 — 后端统计聚合命令

- [ ] 6.1 在 `db.rs` 新增 `get_activity(start, end)`：`SELECT date(completed_at, 'localtime') AS d, COUNT(*) FROM todos WHERE completed_at BETWEEN ? AND ? AND is_deleted=0 GROUP BY d`
- [ ] 6.2 在 `db.rs` 新增 `get_daily_trend(start, end, status_filter)`：三个独立子查询合并（按 created_at / started_at / completed_at 分别 day-bucket），用 SQL CTE 或 Rust 端 zip 合并
- [ ] 6.3 在 `db.rs` 新增 `reset_stats()`：事务内 `DELETE FROM todos WHERE is_deleted=1 OR status='done'`，返回影响行数
- [ ] 6.4 在 `commands.rs` 添加 3 个对应 Tauri 命令：`get_todo_activity` / `get_todo_daily_trend` / `reset_todo_stats`
- [ ] 6.5 `reset_todo_stats` 成功后 `app_handle.emit("steno:todo-changed", json!({ "kind": "reset", "id": "" }))`
- [ ] 6.6 在 `lib.rs` `invoke_handler!` 中注册三个新命令
- [ ] 6.7 输入校验：range 跨度 ≤ 366 天，start ≤ end，否则返回 `InvalidRange`
- [ ] 6.8 `cargo test`：插入测试数据后调用三命令验证结果；range 校验
- [ ] 6.9 提交：`feat(backend): 待办提醒/统计 Phase B1 — 3 个统计聚合命令`

## 7. Phase B2 — 前端图表库引入

- [ ] 7.1 `pnpm add echarts vue-echarts`
- [ ] 7.2 创建 `src/plugins/echarts.ts`：按需 import `echarts/core` + `CalendarChart` + `LineChart` + `TooltipComponent` + `LegendComponent` + `GridComponent` + `VisualMapComponent` + `CanvasRenderer`，并 `echarts.use([...])`
- [ ] 7.3 在 `src/main.ts` 引入该 plugin（仅注册一次）
- [ ] 7.4 验证 `pnpm build` 体积增加合理（< 200KB gzip）
- [ ] 7.5 提交：`chore(frontend): 待办提醒/统计 Phase B2 — 引入 echarts + vue-echarts`

## 8. Phase B3 — StatsView 视图与侧边栏入口

- [ ] 8.1 在 `src/stores/ui.ts` 的 `WindowMode` 联合类型加入 `'stats'`
- [ ] 8.2 在 `MainWorkbenchShell.vue` 侧边栏导航数组中插入"统计"项（位于待办与设置之间，icon 用 stats 类图标）
- [ ] 8.3 新建 `src/views/StatsView.vue`：顶层布局含两个 card（任务活跃度 + 每日状态趋势）+ 底部"重置数据"按钮
- [ ] 8.4 任务活跃度 card：调用 `todos.getActivity(start, end)` → echarts CalendarChart（最近 12 个月）
- [ ] 8.5 每日状态趋势 card：上方两个 NSelect（时间范围 / 状态过滤）+ echarts LineChart 三条折线
- [ ] 8.6 在 `todos` store 暴露 `getActivity` / `getDailyTrend` / `resetStats` actions（封装 invoke）
- [ ] 8.7 在 store 的 `applyRemoteChange` 处理 `kind='reset'`：调用 `load()` 全量重拉
- [ ] 8.8 "重置数据"按钮：调用 NConfirm 二次确认，确认后 invoke + toast 显示删除条数 + 重新拉两块图表数据
- [ ] 8.9 路由：在 `App.vue` 的 `ui.mode === 'stats'` 分支中渲染 `<StatsView />`（lazy-load）
- [ ] 8.10 暗色模式：echarts 配色按 useDark 自动切换（提供 lightOption/darkOption 两套配色）
- [ ] 8.11 vue-tsc typecheck + vitest 通过
- [ ] 8.12 提交：`feat(frontend): 待办提醒/统计 Phase B3 — StatsView 视图 + 侧边栏统计入口`

## 9. Phase C — 综合验证、文档与归档

- [ ] 9.1 在仓库根目录执行 `pnpm typecheck` 通过
- [ ] 9.2 执行 `pnpm test` (vitest) 全套通过
- [ ] 9.3 在 `src-tauri/` 执行 `cargo test` 全套通过（包括迁移测试、调度器测试、统计查询测试）
- [ ] 9.4 执行 `pnpm lint` 0 errors
- [ ] 9.5 在 `openspec/changes/add-todo-reminders-and-stats/` 创建 `manual-verification.md`：手动冒烟清单（含提醒触发实测、热力图渲染、折线图过滤、重置数据）
- [ ] 9.6 `pnpm tauri dev` 实机验证：提醒到期弹通知、跨主窗口/浮窗的 `started_at` / `reminder_fired` 一致、StatsView 双图渲染正确、暗色模式样式
- [ ] 9.7 更新 `README.md` 的特性表（提醒系统、统计视图）
- [ ] 9.8 执行 `openspec validate add-todo-reminders-and-stats --strict` 通过
- [ ] 9.9 提交：`docs+test: 待办提醒/统计 Phase C — 验证清单 + README 更新`
- [ ] 9.10 用户验收后 `openspec archive add-todo-reminders-and-stats`（写入 `openspec/specs/`）
