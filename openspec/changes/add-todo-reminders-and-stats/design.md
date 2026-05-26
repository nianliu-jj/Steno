## Context

Steno 当前的待办系统在 `add-todo-quick-panel` change 中已完成：DB `todos` 表（含 `reminder_time` 字段但未消费）、6 个 Tauri 命令、Pinia store 与 `steno:todo-changed` 事件总线、TodoView 主窗口视图、待办浮窗、设置面板"待办浮窗"分组。Tauri v2 已就位，但 `tauri-plugin-notification` 尚未引入；前端无任何图表库。本 change 是 todo 子系统的第二步增强，新增"提醒触发"与"完成洞察"两个能力，让用户从"记录"走向"持续追踪"。

利益相关者：终端用户（待办主流程依赖者）。无外部 API 集成需求。

## Goals / Non-Goals

**Goals:**
- 用户能在添加 / 编辑任务时通过"快捷选项"或"自定义时间"两种方式设定提醒。
- 提醒到期时，**即使主窗口最小化或所有 webview 关闭**（仅托盘运行），用户仍能收到原生系统通知。
- 用户能配置自己习惯的快捷选项列表（增/删/恢复默认）。
- 用户能在主窗口看到自己最近 12 个月的任务完成活跃度（热力图）。
- 用户能查看最近 30/60/90 天的"创建-开始-完成"三条折线趋势，并按状态过滤。
- 用户能一键重置统计数据（硬删 done + is_deleted）。

**Non-Goals:**
- 提醒不做"提前 N 分钟提醒"等高级策略（用户自己挑选具体时刻即可）。
- 不引入任何分钟级精度的"准点"调度（30s 周期已足够，可被未来策略升级）。
- 不做云同步、多设备一致性。
- 不做"导出统计为图片 / PDF"功能。
- 不做任务标签（tag）维度的统计聚合，仅按状态。
- 不做通知声音的自定义（用系统默认）。

## Decisions

### D1. 调度器实现：Rust tokio 轮询 30s（vs 事件驱动 vs 前端 setTimeout）

**选择**：Rust 端 `tokio::spawn` 启动 30s 周期循环，在应用 `setup` 阶段挂起。

**为何**：
- 前端 setTimeout：webview 关闭就停摆，违反 Goal #2（最小化也要触发）。
- 精确定时器（按最近提醒时间 sleep 直到那一刻）：实现复杂，需要在每次新建/修改任务时唤醒调度器、保存最近触发句柄；首版收益不值得。
- 轮询 30s：30s 内的延迟在用户感知上等同"准时"，单 SQL 查询 + 已存在的 `idx_todos_reminder_time` 索引让开销可忽略；天然支持"应用关闭期间错过的提醒在启动后第一个周期内补发"。

**Trade-off**：极端情况下提醒延迟最多 30s。可接受。

### D2. `reminder_fired` 单字段标记 vs 触发历史表

**选择**：`todos.reminder_fired BOOLEAN` 单字段。

**为何**：一个任务一个提醒时间点，触发后置位即可；不需要历史。如果未来引入"重复提醒"，再加 `last_fired_at` 时间戳更合适，不阻塞当前。

**Trade-off**：用户改 reminder_time 后需要把 fired 置回 0（已在 spec 中明确）。

### D3. `started_at` 字段语义：首次进入 doing（vs 每次进入 doing）

**选择**：首次进入 `doing` 时写入，后续不覆盖。

**为何**：折线图的"开始"统计意义是"用户首次启动这个任务的时间"。若用户反复 doing↔paused，多次写入会让该日开始数虚高。首次填充语义清晰、对应用户认知。

### D4. 通知插件：tauri-plugin-notification v2（vs notify-rust 直接调用 vs 自定义渠道）

**选择**：`tauri-plugin-notification = "2"`（Tauri 官方插件）。

**为何**：官方维护，跨平台 API 统一（Windows toast、macOS NSUserNotification、Linux libnotify），与 Tauri capabilities 系统集成，免去自己处理权限。

### D5. 图表库：echarts + vue-echarts（vs chart.js + vue-chartjs vs ApexCharts vs G2）

**选择**：`echarts ^5.5` + `vue-echarts ^7`，按需引入 `CalendarChart` + `LineChart` + `TooltipComponent` 等 component。

**为何**：
- 热力图：echarts 原生 `calendar` series 是 GitHub 风格的最佳实践，chart.js 需要 hack 或额外插件。
- 中文文档与社区资料丰富，符合用户偏好（中文环境）。
- 按需引入控制体积，整体约 +120–150KB gzip。
- vue-echarts 提供良好的 Vue 3 Composition API 包装与响应式 props 支持。

**Trade-off**：体积略高于 chart.js（chart.js 全量约 60KB），但功能与样式可定制度更高。

### D6. 重置数据语义：硬删 done + is_deleted（vs 仅清统计快照 vs 软重置）

**选择**：物理 `DELETE FROM todos WHERE is_deleted=1 OR status='done'`。

**为何**：用户需求是"重置数据"，最符合直觉的语义就是清空"历史包袱"，把数据库精简到只剩活跃任务。这也方便用户从测试数据中清理。已在 spec 中要求二次确认 + toast 显示删除条数，安全性足够。

**Trade-off**：不可恢复。通过 NConfirm + 明确文案 + 后续可加"导出备份"按钮（不在本次范围）来缓解。

### D7. 默认提醒选项：硬编码在前端默认值 vs 后端首次启动种子

**选择**：前端 `DEFAULT_SETTINGS.reminderQuickOptions` 硬编码 6 项。

**为何**：与现有 settings 模式一致（`mainWindowShortcut` 等也是硬编码默认）。后端不参与默认值生成，减少耦合。

### D8. 提醒选项数据结构：扁平 union 类型（vs 分别表）

**选择**：单一接口带 `type` 判别字段 + 可选字段：

```typescript
type ReminderOption = {
  id: string;             // 用户可见 nanoid，便于编辑器 key
  label: string;          // 显示名
  type: 'relative' | 'absolute';
  value: number;          // relative: 数值；absolute: dayOffset 0=今天
  unit: 'minute' | 'hour' | 'day';  // relative 时必填
  absoluteTime?: string;  // 'HH:mm', absolute 时必填
};
```

**为何**：MoliTodo 截图就是这两类，无第三类需求；扁平结构方便 JSON 序列化进 settings 列；前端可用 `option.type === 'relative'` 做类型守卫。

### D9. 主窗口"统计"入口位置

**选择**：放在侧边栏"待办"和"设置"之间。

**为何**：统计依赖待办数据，逻辑上紧贴待办；与设置区隔开。

### D10. 通知权限请求时机

**选择**：应用 `setup` 阶段检查 `permissionState()`，若为 `unknown` 且数据库有至少一条 `reminder_time IS NOT NULL` 的待办，则调用 `requestPermission()`。

**为何**：避免一启动就弹权限框打扰用户；只有当用户实际用到提醒功能时才请求。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 调度器在系统休眠时不工作，醒来后批量发通知淹没用户 | 在调度循环里把"批次触发"限制为单次最多 10 条，超出留到下一周期；并在 README/manual smoke 中注明此场景 |
| `tauri-plugin-notification` Windows 上要求 App ID 注册 | 在 `tauri.conf.json` 中配置 `bundle.identifier`，验证 dev 模式与打包模式均能弹出 |
| echarts 增加 ~150KB bundle 体积 | 仅按需引入需要的 chart/component，并 lazy-load `StatsView.vue`（dynamic import） |
| 重置数据误操作 | 二次确认 + toast 显示条数 + DB level transaction（失败回滚） |
| `started_at` ALTER TABLE 在大数据集上可能慢 | SQLite ALTER ADD COLUMN 是 O(1) 元数据操作，不实际拷贝行；不需要担心 |
| 调度器 SQL 高频跑导致 SQLite WAL 频繁刷新 | 30s 周期 + 仅读 + WAL 模式已经够；如有性能问题再升级到精确定时器 |
| 用户拒绝通知权限后看不到提醒、又不知道原因 | TodoView 任务行 SHALL 显示"已过期未提醒"角标（已写入 spec） |
| 提醒触发与任务编辑发生竞态：调度器查到旧 reminder_time 触发，用户在同一刻改了时间 | 调度器在 UPDATE `reminder_fired=1` 时用条件 `WHERE id=? AND reminder_time=?`（CAS）；若已变则不写 fired，新时间会在下个周期生效 |
| StatsView 在数据量大时（>1 万 todos）查询慢 | 已建 `idx_todos_completed_at` 索引；查询限制 366 天范围；如不够再加视图层缓存 |

## Migration Plan

**Schema 迁移**（自动，在 `db.rs::init_db` 中）：
1. `CREATE TABLE IF NOT EXISTS todos (...)` 含全部最终列 — 新装无 schema 时直接命中。
2. 对存量 DB：`PRAGMA table_info(todos)` 查列名集合；
   - 若缺 `reminder_fired`，`ALTER TABLE todos ADD COLUMN reminder_fired INTEGER NOT NULL DEFAULT 0`
   - 若缺 `started_at`，`ALTER TABLE todos ADD COLUMN started_at TEXT NULL`
3. `CREATE INDEX IF NOT EXISTS idx_todos_reminder_time ON todos(reminder_time)`
4. `CREATE INDEX IF NOT EXISTS idx_todos_completed_at ON todos(completed_at)`

**回滚**：
- 单次回滚到上版本：列保留无害（新代码已删，旧代码不会读）；用户数据不受损。
- 完全回滚：不需要（特性是纯增量，不破坏旧能力）。

**前端配置迁移**：
- `reminderQuickOptions` 缺省时由 settings store 用 DEFAULT 填充并写回（参考现有 `noteEditorOutlineWidth` 等字段）。

**包升级**：
- `pnpm add echarts vue-echarts @tauri-apps/plugin-notification`
- `cargo add tauri-plugin-notification --features unstable` （或 stable 版本）

## Open Questions

- Q: 是否要在调度器触发通知时跳转到对应任务？
  - **A**: 第一版仅显示通知，不做交互跳转。`tauri-plugin-notification` 的 `onAction` 可在后续 change 中扩展。

- Q: 重置数据是否一并清空 `settings` 中的 `mainListTypeFilters` 等用户状态？
  - **A**: 不。重置仅作用于 `todos` 表，不动 `settings`。文案中明确这点。

- Q: 折线图"开始"统计在跨天任务（晚上 23:55 进入 doing，凌晨 00:05 完成）会如何归位？
  - **A**: `created_at` / `started_at` / `completed_at` 三个时间戳各按本地日历日聚合，分别归入各自的日期；前端无需特别处理。
