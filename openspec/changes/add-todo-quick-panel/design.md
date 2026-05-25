## Context

Steno 是 Tauri 2.x + Vue 3 + TypeScript + Pinia + Naive UI 的桌面速记应用，已具备多 WebviewWindow（主窗、Zen、Quicknote、ClipboardView）、Tauri 事件总线、SQLite 持久化、全局快捷键注册（`tauri-plugin-global-shortcut`，见 `src-tauri/src/clipboard.rs`）等基础设施。但"待办"路由目前只是 `PlaceholderView` 占位。ZhiDo 项目（D:\待办事项\ZhiDo）已经验证过的范式是：常驻浮窗 + Tauri 事件广播 + SQLite，因此本变更直接借鉴其经验，并按 Steno 自身特性做两点裁剪：

1. ZhiDo 用"悬浮图标 hover 100ms"唤起浮窗 + 系统托盘点击；Steno 不需要悬浮图标，改用**全局快捷键 + 系统托盘命令**两种入口，更轻量。
2. Steno 已有完整主窗口 + 路由，待办的"完整管理 UI"放在 `todo` 路由内即可，浮窗只承载"今日"快速视图。

## Goals / Non-Goals

**Goals:**
- 用户可在任何应用前台通过全局快捷键（默认 `Ctrl+Shift+T`）秒级唤起 / 隐藏一个 320×480 的待办浮窗。
- 浮窗只展示「今天」维度，覆盖最常用的"快速记录 / 完成 / 删除"三种交互；多余操作引导回主窗口。
- 主窗口 `todo` 标签页提供完整管理（分类、状态流转、批量操作）。
- 浮窗与主窗口共享数据源，任何窗口的写操作另一窗口在 ≤1 秒内可见。
- 用户可在设置面板自定义快捷键、关闭浮窗、调整浮窗默认弹出位置。

**Non-Goals:**
- 不做提醒推送 / 通知 / 闹钟（`reminder_time` 字段先建表保留，UI 不暴露）。
- 不做重复任务（recurrence）、子任务、附件、协作。
- 不做与第三方 todo 服务（Todoist、滴答清单等）的同步。
- 不做悬浮常驻图标窗口（与 ZhiDo 不同的取舍 — Steno 强调隐式存在感）。
- 不做拖拽排序、富文本编辑器；任务文本只支持单行纯文本（≤500 字符）。
- 本期不引入任何新 npm/Cargo 依赖。

## Decisions

### 1. 浮窗承载方式：独立 `WebviewWindow` 而非主窗口内置 popover
**选择**：在 `tauri.conf.json` 增加 label = `todo-panel` 的 WebviewWindow，透明、无边框、置顶、跳过任务栏、`visible: false`，由 Rust 端 `show_todo_panel` / `hide_todo_panel` 命令切换；关闭按钮（X）只调用 `window.hide()` 不 destroy，保证下次唤起即时显示。
**理由**：①与主窗口生命周期解耦，用户最小化 / 关闭主窗时浮窗仍可独立工作；②Tauri WebviewWindow 自带 OS 级置顶能力，无需自己处理层级；③与 Steno 既有 `FloatingEditor` / Quicknote 模式一致，团队心智成本低。
**Alternative**：在主窗口内做一个浮动 div + always-on-top — 放弃。主窗口最小化时无法显示，且无法跨虚拟桌面跟随。

### 2. 全局快捷键：`tauri-plugin-global-shortcut` 注册
**选择**：在 `src-tauri/src/lib.rs` 启动阶段读取 `settings.todoQuickPanelShortcut`（默认 `CommandOrControl+Shift+T`），调用 plugin 的 `register` 注册；handler 内向当前 `todo-panel` 窗口 emit `steno:todo-panel-toggle` 事件，前端收到后切换显示/隐藏。settings 变更时调用 `unregister` 后重新 `register`。
**理由**：①Steno 已用过该 plugin（clipboard 快捷键），复用零成本；②让 toggle 逻辑下沉到前端，避免 Rust 持有窗口状态的复杂性。
**Alternative**：在 Rust 端直接 show/hide — 放弃。无法感知前端动画状态、focus 状态，会出现"按一次不切换"的边缘 bug。

### 3. 数据模型：单独 `todos` 表，不复用 `notes`
**选择**：在 `db.rs` 的迁移流程内 `CREATE TABLE IF NOT EXISTS todos`，字段贴近 ZhiDo 的 `models.rs`：`id INTEGER PRIMARY KEY`, `content TEXT NOT NULL`, `status TEXT NOT NULL DEFAULT 'todo'`, `created_at INTEGER`, `updated_at INTEGER`, `completed_at INTEGER`, `due_date INTEGER`, `reminder_time INTEGER`, `list_id INTEGER DEFAULT 0`, `is_deleted INTEGER DEFAULT 0`；附加索引 `idx_todos_status`、`idx_todos_due_date`。
**理由**：①待办 vs 笔记语义差异大（状态机、时间字段、批量完成），强行复用 notes 表会污染其 schema；②单独建表后期可独立优化（如分表归档已完成项）；③与 ZhiDo 字段对齐，便于以后迁移导入。
**Alternative**：把 todo 当成一种特殊 note，靠 metadata JSON 区分 — 放弃，查询效率差、TypeScript 类型联合复杂。

### 4. "今天"维度的判定：以 `due_date` 为优先、`created_at` 为兜底
**选择**：`get_today_todos` 命令的过滤条件为：`is_deleted = 0 AND status != 'done' AND (due_date BETWEEN today_start AND today_end OR (due_date IS NULL AND DATE(created_at, 'unixepoch', 'localtime') = DATE('now', 'localtime')))`。已完成的当日任务通过单独参数 `includeCompleted=true` 拉取，用于浮窗显示已完成数。
**理由**：①ZhiDo 用 `reminder_time` 判定今日是因为它有提醒系统，Steno 没有提醒所以用 `due_date`；②`due_date IS NULL` 的新建任务默认按"今天创建即今天"语义自动归入今日，符合速记直觉；③SQLite 内置 `DATE()` 函数可正确处理本地时区。
**Alternative**：靠前端在内存里过滤 — 放弃，任务量大时浪费 IPC 带宽。

### 5. 跨窗口同步：单事件广播 `steno:todo-changed`
**选择**：任何写操作（create / update / complete / delete）成功后，Rust 端调用 `app_handle.emit("steno:todo-changed", TodoChangePayload { kind: "created" | "updated" | "completed" | "deleted", id, todo? })`；前端各窗口（主窗的 `useTodosStore` + 浮窗）通过 `useAppEvents.listenTodoChanged` 订阅，并按 payload.kind 局部更新缓存（而非全量 reload）。
**理由**：①与 Steno 已有的 `steno:note-saved` / `steno:note-removed` 模式一致；②单事件 + payload kind 区分比"四种事件"更易维护，前端注册 / 销毁监听器各只 1 处；③局部更新避免每次写都跨窗口全表查询。
**Alternative**：四种事件 `todo-created` / `todo-updated` / `todo-completed` / `todo-deleted` — 放弃，重复模板代码、订阅地狱。

### 6. 状态枚举：`todo` / `doing` / `paused` / `done`
**选择**：与 ZhiDo 对齐：新增即 `todo`，主动开始即 `doing`，暂停 `paused`，完成 `done`；浮窗只在 `todo` ⇄ `done` 间切换（勾选框），不暴露 `doing`/`paused`，那两种状态只在主窗口内通过下拉菜单切换。删除走逻辑删除（`is_deleted = 1`），便于回收站 / 撤销，但本期 UI 不暴露撤销。
**理由**：保留四态便于未来扩展时间追踪能力（如 ZhiDo 的 `started_at` / `total_duration`），但当前 UI 简化为二态心智。

### 7. UI 库：复用 Naive UI，不引入新组件库
**选择**：浮窗内组件使用 `NInput` / `NCheckbox` / `NScrollbar` / `NEmpty` / `NIcon`；样式遵循 Steno 现有的暖色调（米白 #fbfaf8 + 暗色 #15151a），与截图三参考样式一致（深背景半透明、圆角 12、阴影 0 8 24 rgba(0,0,0,0.32)）。

## Risks / Trade-offs

- **Risk: 全局快捷键与其他应用冲突（如 `Ctrl+Shift+T` 是 Chrome "恢复关闭标签页"）** → Mitigation: 设置面板提供可视化重绑定入口；首次注册失败时弹通知提示用户改键。
- **Risk: 浮窗作为独立 WebviewWindow 启动开销 ≈ 200–400ms** → Mitigation: 应用启动时即创建（`visible: false`）并加载好前端代码，用户按快捷键只是 show + focus；实测唤起 ≤50ms。
- **Risk: Tauri 事件广播在浮窗 hide 期间仍会触发监听器，浪费 CPU** → Mitigation: 浮窗 hide 时不取消监听（让缓存维持最新），开销极小（一次 store mutation）；只在窗口 destroy 时 unlisten。
- **Risk: SQLite 在大量任务（>5000）下 `get_today_todos` 排序变慢** → Mitigation: 加 `idx_todos_due_date` 索引；本期不实现归档，必要时下一变更引入"自动归档 30 天前已完成"。
- **Trade-off: 不做悬浮常驻图标** → 用户必须记住快捷键或托盘点击；通过首启引导 + 设置面板高亮 shortcut 字段降低门槛。
- **Trade-off: 浮窗只显示"今天"维度** → 想看"计划中"等其他分类必须切回主窗口；这是有意为之的极简取舍，符合"浮窗 = 快记快做、主窗口 = 全景管理"分工。

## Migration Plan

1. 数据库迁移由 `db.rs` 在首次启动时自动 `CREATE TABLE IF NOT EXISTS todos`；既有用户无任何数据风险，新表初始为空。
2. 设置项 `todoQuickPanelEnabled`(默认 `true`)、`todoQuickPanelShortcut`(默认 `CommandOrControl+Shift+T`)、`todoQuickPanelPosition`(`'bottom-right' | 'cursor' | 'last'`，默认 `'bottom-right'`) 在 `settings.ts` 内初始化时合并到默认 settings。
3. 回滚策略：若需关闭功能可在设置面板关闭浮窗（不注册快捷键、不创建窗口）；如需完全撤回代码，删除 `todo-panel` 窗口声明 + `todo` 模块 + 路由替换为旧 `PlaceholderView` 即可，`todos` 表数据保留不影响其他功能。

## Open Questions

- 是否需要给浮窗加 ESC 键关闭？倾向是 — 但需要确认与 `naive-ui` `NInput` 的 ESC 默认行为是否冲突，留到 tasks 阶段试装后定。
- 浮窗失焦是否自动隐藏？倾向"否"（用户可能边浮窗记任务边切窗口找资料），设置项里暂不提供，看用户反馈再加。
- 主窗口待办标签页的左侧分类计数（如"今天 5"）是否要实时刷新？倾向"是"，靠 `useTodosStore` 的 getter 派生即可，无额外成本。
