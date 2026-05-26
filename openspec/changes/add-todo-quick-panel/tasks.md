## 1. 后端数据层与命令

- [ ] 1.1 在 `src-tauri/src/db.rs` 的迁移流程中追加 `CREATE TABLE IF NOT EXISTS todos`（含 `id`、`content`、`status`、`created_at`、`updated_at`、`completed_at`、`due_date`、`reminder_time`、`list_id`、`is_deleted` 字段）与 `idx_todos_status`、`idx_todos_due_date` 两个索引
- [ ] 1.2 新建 `src-tauri/src/todo.rs`：定义 `Todo` 结构体（serde 序列化为 camelCase）、`TodoStatus` 枚举、`TodoChangeKind`、`TodoChangePayload`，封装 `TodoRepo`（含 `create / update / complete / delete / list / list_today` 方法）
- [ ] 1.3 在 `src-tauri/src/commands.rs` 暴露 Tauri 命令：`list_todos`、`get_today_todos`、`create_todo`、`update_todo`、`complete_todo`、`delete_todo`，并在 `lib.rs` 的 `invoke_handler` 中注册
- [ ] 1.4 在每个写入命令成功后调用 `app_handle.emit("steno:todo-changed", TodoChangePayload { kind, id, todo })` 广播事件
- [ ] 1.5 添加后端校验：`content` 长度 1–500、`status` 必须是合法枚举、时间戳合法；返回结构化错误 `InvalidContent` / `InvalidStatus`
- [ ] 1.6 编写 Rust 单元测试覆盖：表创建幂等、`get_today_todos` 的"今日"判定边界（凌晨刚过、跨时区）、校验错误路径、事件广播 payload 结构

## 2. 浮窗 WebviewWindow 创建与全局快捷键

- [ ] 2.1 在 `src-tauri/tauri.conf.json` 中新增 label = `todo-panel` 的 WebviewWindow 配置（`url: "index.html#/todo-panel"`、`decorations: false`、`transparent: true`、`alwaysOnTop: true`、`skipTaskbar: true`、`visible: false`、`width: 320`、`height: 480`、`resizable: false`）
- [ ] 2.2 在 `src-tauri/src/lib.rs` 启动阶段读取 settings、注册全局快捷键（默认 `CommandOrControl+Shift+T`），handler 内向 `todo-panel` 发出 `steno:todo-panel-toggle` 事件
- [ ] 2.3 实现 Tauri 命令 `show_todo_panel(position)` / `hide_todo_panel()` / `toggle_todo_panel()`，根据 settings 的 `todoQuickPanelPosition`(`bottom-right`/`cursor`/`last`) 计算坐标并 `set_position`
- [ ] 2.4 监听窗口 `CloseRequested` 事件，调用 `api.prevent_close()` + `window.hide()`，确保关闭仅隐藏
- [ ] 2.5 settings 中的快捷键变更时调用 `unregister` 旧绑定后 `register` 新绑定；注册失败时通过 `Notification` 提示
- [ ] 2.6 编写 Rust 测试覆盖位置计算（右下角避开任务栏 48px、cursor 越界时回弹）

## 3. 前端数据层

- [ ] 3.1 在 `src/types/steno.ts` 新增 `Todo` / `TodoStatus` / `TodoChangeKind` / `TodoChangePayload` 类型
- [ ] 3.2 新建 `src/stores/todos.ts` Pinia store：`state: { todos, filter, selectedCategory }`、`getters: { todayTodos, byCategory(category), categoryCounts }`、`actions: { fetchAll, fetchToday, createTodo, updateTodo, completeTodo, deleteTodo, applyRemoteChange(payload) }`
- [ ] 3.3 新建 `src/composables/useTodos.ts`：封装 store 调用与 IPC，导出 `useTodos()` 接口
- [ ] 3.4 扩展 `src/composables/useAppEvents.ts`：新增 `emitTodoChanged` / `listenTodoChanged`，订阅 Tauri 全局事件 `steno:todo-changed`
- [ ] 3.5 在 `App.vue` 或合适根挂载点处建立 `listenTodoChanged` 监听器，将 payload 转发给 `useTodosStore.applyRemoteChange` 完成增量更新
- [ ] 3.6 编写 `src/stores/todos.test.ts`：覆盖 actions 的乐观更新、`applyRemoteChange` 的四种 kind 处理、categoryCounts getter

## 4. 浮窗前端实现

- [x] 4.1 在 `App.vue` 通过 `ui.mode === 'todo-panel'` 分流，渲染新组件 `TodoQuickPanel.vue`（项目无 vue-router，遵循 quicknote / sticky 既有模式，对应 `src/stores/ui.ts` 的 label 解析）
- [x] 4.2 新建 `src/views/TodoQuickPanel.vue`：
  - 顶部：日期 + "今天 N" 计数 + 关闭(×)按钮 + 拖拽区
  - 输入区：原生 `<input>` 添加新任务（Enter 提交、超 500 字符 maxlength 截断 + 剩余提示、空白拒绝提交）
  - 列表区：使用 `NScrollbar` 包裹任务条目，每项含原生 checkbox + 文本 + hover 显示的删除按钮
  - 空态：圆形 ✓ + "太棒了！所有任务都已完成"
- [x] 4.3 监听 `steno:todo-panel-toggle` 事件：`visible=true` 时自动 focus 输入框，`visible=false` 时持久化最后位置；卸载时清理订阅
- [x] 4.4 实现 `position='last'` 的窗口拖拽位置持久化（关闭 / 隐藏前调用 `outerPosition` 写 `settings.todoQuickPanelLastPos`）
- [x] 4.5 样式遵循 Steno 暖色调（深背景 rgba(20,20,24,0.92)、圆角 12、阴影、暖色 accent #e8ad7a）
- [x] 4.6 编写 `src/views/TodoQuickPanel.test.ts`：覆盖输入提交、空白拒绝、勾选完成、删除、空态渲染、计数同步、关闭按钮、跨窗口远端 applyRemoteChange（8 个用例全部通过）

## 5. 主窗口待办视图替换

- [x] 5.1 在 `App.vue` 把 `todo` 模式从 `placeholderMeta` 中剔除，并新增 `<TodoView v-else-if="ui.mode === 'todo'" />`（shellModes 已包含 `todo`）
- [x] 5.2 新建 `src/views/TodoView.vue`：
  - 左侧：分类侧栏（今天 / 计划中 / 进行中 / 已暂停 / 已完成 / 收件箱 / 全部），各项展示计数徽章
  - 顶部：标题 + 搜索框 + 添加输入框
  - 中部：任务列表，每行支持双击编辑文本、状态徽章下拉、日期按钮、删除
- [x] 5.3 行内编辑：使用 `<input v-if="editingId===item.id">` 切换；失焦或 Enter 保存，Esc 取消（v-for 内 ref 用函数式 bindEditInputRef 收集）
- [x] 5.4 状态切换下拉：使用 `NDropdown`；日期选择使用 `NDatePicker`
- [x] 5.5 持久化选中分类到 `localStorage`（mount 时恢复，watch 写回；store.selectedCategory 已存在）
- [x] 5.6 编写 `src/views/TodoView.test.ts`：覆盖侧栏渲染/计数、分类切换+localStorage 持久化、localStorage 恢复、添加任务、完成任务、双击行内编辑+Enter 保存、Esc 取消、搜索过滤、删除、空态、跨分类计数（11 用例全部通过）

## 6. 设置面板"待办浮窗"分组

- [x] 6.1 在 `src/stores/settings.ts` 默认 settings 中追加 `todoQuickPanelEnabled: true`、`todoQuickPanelShortcut: 'Ctrl+Shift+T'`、`todoQuickPanelPosition: 'bottom-right'`、`todoQuickPanelLastPos: ''`（"x,y" 字符串，与 Rust 端 show_todo_panel 期望一致）
- [x] 6.2 在 `src/views/SettingsView.vue` 增加"待办浮窗"分组：
  - `NSwitch` 开关 `todoQuickPanelEnabled`
  - `NInput` 快捷键输入框 `todoShortcut`（沿用既有 commitShortcut 模式，blur/Enter 保存 + reloadShortcuts）
  - `NRadioGroup` 切换位置（`bottom-right` / `cursor` / `last`）
- [x] 6.3 disabled 处理：`todoQuickPanelEnabled=false` 时通过 `.settings-row--disabled` + `:disabled` 把快捷键和位置控件置灰
- [x] 6.4 settings 变更后通过 `db.reloadShortcuts()` 通知 Rust 重注册快捷键（开关切换也走 reloadShortcuts，因后端 register_from_settings 已读 enabled 字段）
- [x] 6.5 在 `src/stores/settings.test.ts` 补充新设置项的默认值与序列化测试（4 个用例：默认值、解码、非法值回退、update 序列化）

## 7. 跨窗口集成与端到端验证

- [x] 7.1 在主窗口、浮窗、Quicknote 三处都建立 `listenTodoChanged` 监听器，并在窗口卸载时正确 unlisten（App.vue mounted 启动 + onBeforeUnmount stop；TodoQuickPanel/TodoView mounted 再调一次走 store 内 listenersStarted mutex 幂等；TodoQuickPanel.listenTodoPanelToggle 单独 onBeforeUnmount unlisten）
- [ ] 7.2 在 macOS / Windows 实机分别按快捷键唤起浮窗，验证 ≤200ms、focus 正确、ESC 行为符合预期（见 manual-verification.md §7.2）
- [ ] 7.3 验证：浮窗写入 → 主窗口"今天"分类立即看到；主窗口完成任务 → 浮窗对应项消失（见 manual-verification.md §7.3）
- [ ] 7.4 验证：在快捷键被占用场景下（先开 Chrome 占用 Ctrl+Shift+T），设置面板能正常重新绑定（见 manual-verification.md §7.4）
- [ ] 7.5 验证：关闭浮窗功能开关后再打开，无残留监听 / 重复注册（见 manual-verification.md §7.5）

## 8. 文档与归档

- [ ] 8.1 运行 `pnpm typecheck` 确保 TypeScript 通过
- [ ] 8.2 运行 `pnpm test` 确保所有单测通过（含新增的 todos store / TodoView / TodoQuickPanel 测试）
- [ ] 8.3 运行 `cargo test --manifest-path src-tauri/Cargo.toml` 通过 Rust 单测
- [ ] 8.4 更新主 README 或 PROJECT_SUMMARY（若存在）中"功能列表"段落，标注待办浮窗已支持
- [ ] 8.5 按 OpenSpec 流程执行 `openspec validate --change add-todo-quick-panel`，无错误后准备归档
