## Why

Steno 主窗口"待办"标签页目前只是一个 `PlaceholderView`（`src/views/PlaceholderView.vue`），仅显示"即将推出"提示，用户无法在 Steno 内做任何任务管理；而日常写作 / 速记场景里"想到什么立刻写下"的需求与速记本身同源，强制用户切换到第三方 todo 应用会打断心流。同时既有的 Steno 已经具备多窗口（笔记编辑器、Zen 模式、Quicknote 浮窗）+ Tauri 事件广播 + SQLite 持久化基础设施，按 ZhiDo 项目的成熟模式补一个"全局快捷键唤起的今日待办浮窗"是低成本、高价值的能力扩展。

## What Changes

- 新增独立 Tauri `WebviewWindow`（label = `todo-panel`），透明、无边框、置顶、跳过任务栏，默认 320×480，关闭时只隐藏不销毁。
- 新增可在设置面板配置的全局快捷键（默认 `Ctrl+Shift+T`），按下后切换浮窗显示 / 隐藏；浮窗位置可配置（屏幕右下角 / 跟随光标 / 上次位置）。
- 浮窗内呈现"今天"维度的任务列表：顶部为日期 + "今天 N" 计数 + 添加输入框（Enter 提交）；中部为任务条目（勾选框、文本、删除按钮）；空态显示「太棒了！所有任务都已完成」。
- 把主窗口 `todo` 路由从 `PlaceholderView` 替换为完整的待办管理页：左侧分类（今天 / 计划中 / 进行中 / 已暂停 / 已完成 / 全部 / 收件箱），右侧任务列表，可创建 / 编辑 / 切换状态 / 删除。
- 后端新增 SQLite `todos` 表（字段：`id`、`content`、`status`(`todo` / `doing` / `paused` / `done`)、`created_at`、`updated_at`、`completed_at`、`due_date`、`reminder_time`、`list_id`、`is_deleted`）与一组 Tauri 命令（`list_todos`、`create_todo`、`update_todo`、`complete_todo`、`delete_todo`、`get_today_todos`）。
- 新增前端 Pinia store `useTodosStore`（`src/stores/todos.ts`）+ composable `useTodos`，浮窗与主窗口共用同一 store。
- 跨窗口同步：在 `useAppEvents` 增加 `steno:todo-changed` 全局事件，任何写操作后由 Rust 通过 `app.emit` 广播，前端各窗口监听后刷新本地缓存。
- 设置面板新增「待办浮窗」分组：开关、快捷键、浮窗默认位置三项配置；持久化到现有 `settings` 存储。

## Capabilities

### New Capabilities
- `todo-quick-panel`: 全局快捷键唤起的浮窗式今日待办面板（独立窗口、唤起 / 隐藏 / 添加 / 完成 / 删除）。
- `todo-management`: 主窗口待办标签页的完整任务管理（分类侧栏、CRUD、状态流转、与浮窗同步）。
- `todo-storage`: 待办事项的 SQLite 持久化与 Tauri 命令边界（数据模型、CRUD 命令、跨窗口事件广播）。

### Modified Capabilities
<!-- 当前 openspec/specs/ 下尚无已发布的 capability（仅 changes/ 目录），故无现存 spec 需要做 delta。 -->

## Impact

- **前端**：新增 `src/views/TodoView.vue`（替换 `todo` 路由对应的 `PlaceholderView`）、`src/views/TodoQuickPanel.vue`、`src/stores/todos.ts`、`src/composables/useTodos.ts`；扩展 `src/router/index.ts`、`src/composables/useAppEvents.ts`、`src/stores/settings.ts`、`src/views/SettingsView.vue`、`src/types/steno.ts`。
- **后端**：新增 `src-tauri/src/todo.rs`（模型 + 命令 + 广播）；修改 `src-tauri/src/db.rs`（新建 `todos` 表 + 迁移）、`src-tauri/src/lib.rs`(注册命令、注册新 `WebviewWindow`、注册全局快捷键 handler)、`src-tauri/tauri.conf.json`（声明 `todo-panel` 窗口）。
- **依赖**：复用现有 `tauri-plugin-global-shortcut`、`rusqlite`、`naive-ui`；无需新增依赖。
- **测试**：新增 `src/stores/todos.test.ts`、`src/views/TodoView.test.ts`、`src/views/TodoQuickPanel.test.ts`、`src-tauri` 端 `todo` 模块单元测试。
- **数据迁移**：首次启动时 `db.rs` 检测并自动 `CREATE TABLE IF NOT EXISTS todos`，零侵入；不影响既有 notes / clipboard 数据。
