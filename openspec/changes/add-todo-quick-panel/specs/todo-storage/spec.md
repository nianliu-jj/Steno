## ADDED Requirements

### Requirement: `todos` 表结构与迁移
系统 MUST 在应用首次启动时通过 `db.rs` 的迁移流程自动创建 `todos` 表，包含字段 `id`、`content`、`status`、`created_at`、`updated_at`、`completed_at`、`due_date`、`reminder_time`、`list_id`、`is_deleted`，以及索引 `idx_todos_status`、`idx_todos_due_date`。迁移 SHALL 使用 `CREATE TABLE IF NOT EXISTS`，对既有数据库无破坏。

#### Scenario: 首次启动创建表
- **WHEN** 用户首次从旧版本（无 `todos` 表）启动新版本
- **THEN** SQLite 中出现 `todos` 表与对应两个索引，且原有 `notes`/`clipboard_items` 等表数据完整保留

#### Scenario: 重复启动幂等
- **WHEN** 用户多次启动应用
- **THEN** `todos` 表只创建一次，索引不重复，无报错日志

### Requirement: Tauri 命令边界
Rust 后端 MUST 暴露以下 Tauri 命令供前端 `invoke`：`list_todos(filter)`、`get_today_todos(include_completed)`、`create_todo(input)`、`update_todo(id, patch)`、`complete_todo(id, done)`、`delete_todo(id)`；每个命令 MUST 在成功后通过 `app_handle.emit("steno:todo-changed", payload)` 广播一次事件。

#### Scenario: 创建命令返回新 Todo
- **WHEN** 前端调用 `create_todo({ content: '测试', dueDate: null })`
- **THEN** 命令返回新创建任务的完整结构（含 `id` 与 `createdAt`），并触发一次 `steno:todo-changed` 事件，payload.kind = `'created'`

#### Scenario: 列表查询过滤
- **WHEN** 前端调用 `list_todos({ status: 'doing', isDeleted: false })`
- **THEN** 命令仅返回 `status='doing' AND is_deleted=0` 的任务，按 `created_at DESC` 排序

#### Scenario: 今日查询包含 due_date 为空的当日新建项
- **WHEN** 当地时间今日凌晨内创建了一条 `due_date=NULL` 的任务，前端调用 `get_today_todos(false)`
- **THEN** 该任务出现在结果中；前一天创建且 `due_date=NULL` 的任务不在结果中

#### Scenario: 完成命令更新时间戳
- **WHEN** 前端调用 `complete_todo(id, true)`
- **THEN** 该 Todo 的 `status` 变为 `'done'`、`completed_at` 设为 `now()`、`updated_at` 设为 `now()`，并触发 `kind='completed'` 事件

#### Scenario: 删除走逻辑删除
- **WHEN** 前端调用 `delete_todo(id)`
- **THEN** 该 Todo 行 `is_deleted=1`、`updated_at` 刷新；任何 `is_deleted=false` 过滤条件下查询不再返回此行；行本身在数据库中保留以便未来回收站功能

### Requirement: 数据校验
后端 MUST 对所有写入命令进行字段校验：`content` 长度 1–500 字符且去除首尾空白后非空；`status` 必须是 `'todo'|'doing'|'paused'|'done'` 之一；时间字段必须是合法的 Unix 毫秒时间戳。

#### Scenario: 拒绝空 content
- **WHEN** 前端调用 `create_todo({ content: '   ' })`
- **THEN** 命令返回错误 `InvalidContent("content must be 1-500 chars")`，未写入数据库，未发布事件

#### Scenario: 拒绝非法 status
- **WHEN** 前端调用 `update_todo(id, { status: 'archived' })`
- **THEN** 命令返回错误 `InvalidStatus`，未写入数据库，未发布事件

### Requirement: 跨窗口事件广播
所有对 `todos` 表的写操作 MUST 在成功提交后立即通过 Tauri 全局事件 `steno:todo-changed` 广播到所有窗口（包括触发方自身）；payload 结构 SHALL 至少包含 `kind`（`'created'|'updated'|'completed'|'deleted'`）与 `id`，并 SHOULD 包含变更后的 `todo` 完整对象（删除事件可省略）。

#### Scenario: 浮窗写、主窗口读
- **WHEN** 浮窗的 `useTodosStore.createTodo({...})` 触发后端 create_todo 成功
- **THEN** 主窗口的 `useAppEvents.listenTodoChanged` 回调被调用，收到 `{ kind: 'created', id, todo }`，并完成本地缓存的增量更新（无需重新拉表）

#### Scenario: 同一窗口也能收到自身事件
- **WHEN** 浮窗的 store 触发了一次 create
- **THEN** 浮窗自己注册的 `listenTodoChanged` 监听器也被调用（用于"乐观更新 + 真实数据回填"模式）

### Requirement: 设置持久化
新增的设置项 `todoQuickPanelEnabled`、`todoQuickPanelShortcut`、`todoQuickPanelPosition` MUST 由现有 `settings` 模块统一持久化；当任一项变更时，Rust 端 SHALL 在 ≤200 毫秒内响应——重新注册 / 注销全局快捷键、显示 / 隐藏 `todo-panel` 窗口、更新默认弹出位置。

#### Scenario: 切换快捷键
- **WHEN** 用户在设置面板将快捷键从 `Ctrl+Shift+T` 改为 `Ctrl+Alt+T` 并保存
- **THEN** 后端注销旧绑定、注册新绑定；按下旧组合无任何反应、按下新组合正常切换浮窗

#### Scenario: 关闭浮窗功能
- **WHEN** 用户关闭 `todoQuickPanelEnabled`
- **THEN** 后端注销快捷键、隐藏并销毁 `todo-panel` 窗口；设置面板的"快捷键"和"位置"两栏置灰

#### Scenario: 切换默认位置
- **WHEN** 用户将位置从 `bottom-right` 改为 `cursor`
- **THEN** 下次唤起浮窗时，浮窗显示在光标位置（已显示中的浮窗不立即跳位）
