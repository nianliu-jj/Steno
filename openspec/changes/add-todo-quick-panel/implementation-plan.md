# 待办浮窗 add-todo-quick-panel 实施计划

> 本文档与 `proposal.md` / `design.md` / `tasks.md` / `specs/**` 配套使用。  
> 任务编号严格对齐 `tasks.md` 的 8 个 phase（不重新编排），但补充：①每个 phase 的前置依赖、可改/新建的绝对路径、验证手段、风险与回滚 ②关键决策的依据出处 ③可直接复制的样板代码 ④末尾的并行 / 串行甘特图。

---

## Phase 0 — Documentation Discovery 汇总（必读）

> 该阶段为"调研结论"，无代码改动；后续 Phase 都以这里给出的"允许使用的 API"为唯一事实来源。

### 0.1 后端可复用 API（来源：D:\Steno\src-tauri\）

| 主题 | 结论 | 关键文件:行 |
|---|---|---|
| 全局快捷键插件 | 已引入 `tauri-plugin-global-shortcut = "2"`，已有完整注册框架（`REGISTRY: LazyLock<Mutex<Vec<(Shortcut, Action)>>>` + handler 闭包 + `register_from_settings`） | `Cargo.toml:18`、`src/shortcut.rs:24/55/149/172` |
| 多窗口动态创建 | 已用过 `WebviewWindowBuilder`（置顶便签场景），样板齐全 | `src/window_manager.rs:16/71` |
| 事件广播 | 统一 `app.emit(EVENT, payload)`（Tauri 2 中 emit 即全窗口广播）；事件名常量风格 `steno:xxx`；payload 用 `#[derive(Clone, Serialize)] + #[serde(rename_all = "camelCase")]` | `src/clipboard.rs:15-17`、`src/window_manager.rs:22-27` |
| SQLite 迁移 | 用 `user_version` pragma 版本号；当前 v4，本次新增表 → v5；每个迁移块用 `conn.transaction() + execute_batch + pragma_update + commit` | `src/db.rs:109` `fn migrate` |
| Tauri commands 注册位置 | `#[tauri::command]` 集中在 `src/commands.rs`，invoke_handler 列表在 `src/lib.rs:43-74` | — |
| 通知插件 | **未引入** `tauri-plugin-notification`。若要做"快捷键注册失败提示"，可选：(a) 仅日志 + 设置面板红字 (b) 单独引入插件（需改 conf.json 权限） | 见 0.3 决策 |

### 0.2 前端可复用模式（来源：D:\Steno\src\）

| 主题 | 结论 | 关键文件:行 |
|---|---|---|
| 路由 | **项目不使用 vue-router**。路由切换靠 `useUiStore.navigateTo(mode, noteId?)` + `WindowMode` 联合 + `App.vue` 中 `v-if/v-else-if` 链 | `src/stores/ui.ts:43/62/222`、`src/App.vue:135-148`、`src/types/steno.ts:195` |
| 当前 todo 渲染 | 由 `App.vue:54-63` 的 `placeholderMeta` switch 命中 `'todo'`，渲染 `PlaceholderView` 并传入 `title="待办"` `description="功能规划中"` | `src/App.vue:54/139`、`src/views/PlaceholderView.vue` |
| 跨窗口事件 | `useAppEvents()` 工厂函数（setup-style 用法），导出成对的 `emitX` / `listenX`；listen 返回 `Promise<() => void>` unlisten | `src/composables/useAppEvents.ts:22-26/76` |
| Pinia store 风格 | setup-style `defineStore(name, () => {...})`；不直接 `invoke`，统一经 `useDb()` 封装；写后调 `upsertLocal` 本地 upsert；事件直接 `listen` from `@tauri-apps/api/event` | `src/stores/clipboard.ts:13/50/56`、`src/stores/notes.ts:25/72/148/161` |
| 类型 | 集中在 `src/types/steno.ts`，全部 camelCase；时间戳 `string`(RFC3339) | `src/types/steno.ts:73-92` |
| Naive UI | 按需 import，无全量挂载；`useMessage()` 在 root `NMessageProvider` 内即可用 | `src/main.ts`、`src/App.vue:127` |
| 设置面板 | 用 `sections` 数组 + `activeSection` ref + `v-if` 链；新增分组 = 加联合类型 key + 加数组项 + 加 `<section v-else-if>` | `src/views/SettingsView.vue:39-46/205/220` |
| 测试 | Vitest + jsdom；mock `@/composables/useDb` 与 `@tauri-apps/api/event`；用全局 `listeners: Map` 模拟事件触发 | `src/stores/clipboard.test.ts:1/33/40/84` |

### 0.3 关键决策（与 design.md 的偏差校准）

> ⚠ 以下是在调研后对 design.md 的事实校准，Phase 1+ 必须按"修正后"执行：

| # | design.md 原说法 | 修正后事实 | 依据 |
|---|---|---|---|
| D1 | "在 `src/router/index.ts` 把 todo 路由替换为 `TodoView`" | 实际改 `src/App.vue` 的 `placeholderMeta` switch（移除 `'todo'` 分支）+ 新增 `v-else-if="ui.mode==='todo'"` 渲染 `TodoView`；浮窗作为独立 WebviewWindow 在自身入口（如 `index.html#todo-panel`）中根据 hash 直接挂载 `TodoQuickPanel`（不进 ui store） | 0.2 路由结论 |
| D2 | "ZhiDo 用 `INTEGER PRIMARY KEY`" 暗示 | ZhiDo 实际 `tasks.id TEXT`（UUID）。Steno 已有的 `notes.id TEXT`、`clipboard_history.id TEXT` 都是字符串主键，**`todos.id` 应保持 `TEXT`**（UUID v4，由 Rust 端生成） | `D:\待办事项\ZhiDo\src-tauri\src\db.rs:37`、`Steno src/db.rs` 现有 schema |
| D3 | "关闭按钮只 hide 不 destroy" | 这是与 ZhiDo 不同的取舍：ZhiDo 用 `close()` 重建。**Steno 保留 design 决策（只 hide）**，理由：避免每次重建的 200–400ms 启动开销 | design.md §Decisions 1 |
| D4 | "注册失败弹通知" | 由于 `tauri-plugin-notification` 未引入，**降级为**：(a) 错误日志 `eprintln!` + (b) 设置面板的快捷键输入框旁显示红字"绑定失败：xxx" + (c) 主窗口 `NMessage.error()` | 0.1 通知插件结论 |
| D5 | "事件名 `steno:todo-changed`" | 保留。再加一个**面板切换**事件 `steno:todo-panel-toggle`（由全局快捷键 handler emit，由浮窗前端 listen） | design.md §Decisions 2 |
| D6 | "windows: { todo-panel: {...} }" 写入 `tauri.conf.json` | Steno 的 `tauri.conf.json` 已经预声明了 `main`/`quicknote` 两个窗口，新增 `todo-panel` 同样在 `windows` 数组里追加；保持 `visible: false`，由 Rust setup 阶段也调用 `WebviewWindowBuilder` **不重复**——选其一即可，**本计划选预声明方案**（与既有 quicknote 一致），Rust 端只 `get_webview_window().show()/hide()` | `src-tauri/tauri.conf.json:14-44` |

### 0.4 允许使用的 API 清单（Allowed APIs）

> Phase 1+ 实现时**只能**使用以下 API（出现在调研报告里有出处的）。若需用到此外的 API，必须先回到 Phase 0 补查文档。

**Rust (tauri 2.x)**
- `tauri::AppHandle`、`tauri::Emitter`、`tauri::Manager`、`tauri::WebviewWindowBuilder`、`tauri::WebviewUrl`
- `tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState}`
- `rusqlite::{Connection, Transaction, params}`、`pragma_query_value`、`pragma_update`、`execute_batch`
- 已有：`crate::db::Db`、`crate::shortcut::{parse_shortcut, register_from_settings, REGISTRY}`

**前端 (Vue 3 + Pinia)**
- `defineStore('xxx', () => { ... })`
- `useDb()` from `@/composables/useDb`（新增 `listTodos / createTodo / ...` 方法）
- `useAppEvents()` from `@/composables/useAppEvents`（新增 `emitTodoChanged / listenTodoChanged / listenTodoPanelToggle`）
- `@tauri-apps/api/event` 的 `listen`、`@tauri-apps/api/webviewWindow` 的 `getCurrent`
- naive-ui 按需：`NInput`、`NCheckbox`、`NScrollbar`、`NEmpty`、`NDropdown`、`NDatePicker`、`NRadio`、`NRadioGroup`、`NSwitch`、`NButton`、`NIcon`、`useMessage`
- `vitest`、`pinia`、`vi.mock`

**禁止使用**（避免反模式）
- ❌ 自创未在调研中确认的 Tauri API（如 `app.notification()` — 未引入 plugin）
- ❌ vue-router（项目不使用）
- ❌ `emit_all` / `emit_to` 简化形态（统一用 `app.emit`）
- ❌ INTEGER 主键（与 Steno 既有 schema 风格不一致）

---

## Phase 1 — 后端数据层与命令

### 1.1 前置依赖
- Phase 0 完成（必读）。

### 1.2 涉及文件（绝对路径）
- 修改 `D:\Steno\src-tauri\src\db.rs`（在 `migrate` 末尾追加 v5 块）
- 新建 `D:\Steno\src-tauri\src\todo.rs`（`Todo` 结构体 / `TodoStatus` 枚举 / `TodoChangePayload` / `TodoRepo` 方法）
- 修改 `D:\Steno\src-tauri\src\commands.rs`（追加 6 个 `#[tauri::command]`）
- 修改 `D:\Steno\src-tauri\src\lib.rs`（在 `invoke_handler` 列表追加新 commands；在 `mod` 声明追加 `mod todo;`）
- 新建 `D:\Steno\src-tauri\src\todo_tests.rs`（或在 `todo.rs` 末尾 `#[cfg(test)] mod tests`）

### 1.3 实现步骤（COPY 模式，引用 0.1 样板）

**1.3.1 表迁移（仿 db.rs:163-185 的 v3 样板）**
```rust
// db.rs::migrate 中追加：
if version < 5 {
    let tx = conn.transaction()?;
    tx.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS todos (
            id            TEXT PRIMARY KEY,
            content       TEXT NOT NULL,
            status        TEXT NOT NULL DEFAULT 'todo',
            created_at    TEXT NOT NULL,
            updated_at    TEXT NOT NULL,
            completed_at  TEXT,
            due_date      TEXT,
            reminder_time TEXT,
            list_id       INTEGER NOT NULL DEFAULT 0,
            is_deleted    INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_todos_status   ON todos(status);
        CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
        ",
    )?;
    tx.pragma_update(None, "user_version", 5_i64)?;
    tx.commit()?;
}
```

**1.3.2 `Todo` 模型 + 枚举**
```rust
// todo.rs
use serde::{Deserialize, Serialize};
use rusqlite::Row;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TodoStatus { Todo, Doing, Paused, Done }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    pub content: String,
    pub status: TodoStatus,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub due_date: Option<String>,
    pub reminder_time: Option<String>,
    pub list_id: i64,
    pub is_deleted: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TodoChangeKind { Created, Updated, Completed, Deleted }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoChangePayload {
    pub kind: TodoChangeKind,
    pub id: String,
    pub todo: Option<Todo>,
}
```

**1.3.3 Tauri commands（仿 clipboard.rs:161 的事件广播）**
```rust
// commands.rs 追加，记得 import super::todo::*;
pub const TODO_CHANGED_EVENT: &str = "steno:todo-changed";

#[tauri::command]
pub async fn create_todo(
    db: State<'_, Db>, app: AppHandle, input: CreateTodoInput,
) -> Result<Todo, String> {
    let todo = todo::repo::create(&db, input).map_err(|e| e.to_string())?;
    let _ = app.emit(TODO_CHANGED_EVENT, TodoChangePayload {
        kind: TodoChangeKind::Created, id: todo.id.clone(), todo: Some(todo.clone()),
    });
    Ok(todo)
}
// 同理：update_todo / complete_todo / delete_todo / list_todos / get_today_todos
```

**1.3.4 invoke_handler 注册（仿 lib.rs:43）**
```rust
.invoke_handler(tauri::generate_handler![
    /* ...既有... */,
    commands::list_todos,
    commands::get_today_todos,
    commands::create_todo,
    commands::update_todo,
    commands::complete_todo,
    commands::delete_todo,
])
```

**1.3.5 "今天"查询 SQL**
```sql
SELECT * FROM todos
 WHERE is_deleted = 0
   AND (
        (?1 = 1 AND status = 'done' AND DATE(completed_at) = DATE('now','localtime'))
     OR (status != 'done' AND (
            DATE(due_date) = DATE('now','localtime')
         OR (due_date IS NULL AND DATE(created_at) = DATE('now','localtime'))
        ))
   )
 ORDER BY (status='done') ASC, created_at ASC;
```
> `?1` 是 `include_completed: bool` 参数。

### 1.4 验证
- `cd src-tauri && cargo test todo` 通过（覆盖：迁移幂等、create→list、today 边界、校验错误、广播 payload kind 正确）
- `cargo build` 无 warning
- 启动应用后用 SQLite 客户端检查 `PRAGMA user_version` = 5，`PRAGMA table_info(todos)` 列匹配

### 1.5 风险与回滚
- **风险**：v5 迁移在用户已升级到 v5 后回退到旧版本 → SQLite 不报错（旧版本不读 todos 表），但用户感知"数据丢失" → 用 changelog 说明"待办数据存在但旧版看不见"，不做技术回滚
- **风险**：SQLite `DATE()` 在 Windows / 不同时区下行为差异 → 单测覆盖 UTC+8 与 UTC-5 两个时区
- **回滚**：仅删除 v5 块、删除 `mod todo`、删除 invoke_handler 中 6 行；表残留无害

---

## Phase 2 — 浮窗 WebviewWindow 创建与全局快捷键

### 2.1 前置依赖
- Phase 0 完成。可与 Phase 1 并行（不依赖数据库）。

### 2.2 涉及文件
- 修改 `D:\Steno\src-tauri\tauri.conf.json`（在 `windows` 数组追加 `todo-panel`）
- 新建 `D:\Steno\src-tauri\src\todo_panel.rs`（窗口控制 + 位置计算 + close 拦截）
- 修改 `D:\Steno\src-tauri\src\shortcut.rs`（在 `register_from_settings` 内追加读取 `todoQuickPanelShortcut`、Handler 内 emit `steno:todo-panel-toggle`）
- 修改 `D:\Steno\src-tauri\src\commands.rs`（追加 `show_todo_panel`、`hide_todo_panel`、`toggle_todo_panel`）
- 修改 `D:\Steno\src-tauri\src\lib.rs`（注册新 commands；setup 内挂载 `CloseRequested` 拦截）

### 2.3 实现步骤（COPY 模式）

**2.3.1 tauri.conf.json**（与既有 `quicknote` 同级追加）
```json
{
  "label": "todo-panel",
  "url": "index.html#todo-panel",
  "title": "Steno · 今日待办",
  "width": 320, "height": 480, "resizable": false,
  "decorations": false, "transparent": true,
  "alwaysOnTop": true, "skipTaskbar": true, "visible": false,
  "shadow": true
}
```

**2.3.2 全局快捷键 handler 派发**（在 `shortcut.rs:149` handler 闭包内追加分支）
```rust
// 通过 REGISTRY 查 action，新增 Action::ToggleTodoPanel
match action {
    Action::ToggleClipboard => { /* 已有 */ }
    Action::ToggleTodoPanel => {
        if let Some(w) = app.get_webview_window("todo-panel") {
            let _ = app.emit("steno:todo-panel-toggle", ());
        }
    }
}
```

**2.3.3 `toggle_todo_panel` 命令**（仿 ZhiDo windows.rs:34 + Steno window_manager.rs:31）
```rust
#[tauri::command]
pub async fn toggle_todo_panel(app: AppHandle, db: State<'_, Db>) -> Result<(), String> {
    let win = app.get_webview_window("todo-panel")
        .ok_or_else(|| "todo-panel window not declared".to_string())?;
    if win.is_visible().unwrap_or(false) {
        win.hide().map_err(|e| e.to_string())?;
    } else {
        let pos_mode = db.get_setting("todoQuickPanelPosition")?
            .unwrap_or_else(|| "bottom-right".into());
        let (x, y) = compute_panel_position(&app, &pos_mode)?;
        win.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

**2.3.4 close 拦截**（lib.rs setup 内）
```rust
let panel = app.get_webview_window("todo-panel").unwrap();
panel.on_window_event(|e| if let WindowEvent::CloseRequested { api, .. } = e {
    api.prevent_close();
    let _ = panel.hide();
});
```

**2.3.5 位置计算**（compute_panel_position）
- `bottom-right`: `monitor.work_area()` → `x = right - 320 - 16`, `y = bottom - 480 - 48`
- `cursor`: `app.cursor_position()` → 越界回弹（边界 16px）
- `last`: 读 `db.get_setting("todoQuickPanelLastPos")` → JSON `{x,y}`

### 2.4 验证
- `cargo build` 通过；`cargo test todo_panel` 覆盖三种位置模式
- 手动：启动应用 → 按 `Ctrl+Shift+T` → 窗口在右下角显现且 focus；再按 → 隐藏；点击 × → 隐藏不退出

### 2.5 风险与回滚
- **风险**：快捷键被其它应用占用（如 Chrome 的 `Ctrl+Shift+T`）→ 0.3 D4 决策的三重降级（日志 + 设置面板红字 + NMessage）
- **风险**：多显示器下 `bottom-right` 计算错（哪个 monitor）→ 用 `app.cursor_position()` 反查所在 monitor
- **回滚**：删除 `todo-panel` 窗口声明 + `todo_panel.rs` + shortcut Action::ToggleTodoPanel 分支；既有快捷键不受影响

---

## Phase 3 — 前端数据层

### 3.1 前置依赖
- Phase 1 完成（commands 已暴露，类型 `Todo/TodoStatus` 已定义）。可与 Phase 2 并行。

### 3.2 涉及文件
- 修改 `D:\Steno\src\types\steno.ts`（追加 `Todo / TodoStatus / TodoChangeKind / TodoChangePayload / CreateTodoInput / UpdateTodoInput / TodoCategory`）
- 修改 `D:\Steno\src\composables\useDb.ts`（追加 `listTodos / getTodayTodos / createTodo / updateTodo / completeTodo / deleteTodo`）
- 修改 `D:\Steno\src\composables\useAppEvents.ts`（追加 `emitTodoChanged / listenTodoChanged / listenTodoPanelToggle`）
- 新建 `D:\Steno\src\stores\todos.ts`（setup-style，仿 notes.ts:25/72/148）
- 新建 `D:\Steno\src\composables\useTodos.ts`（thin wrapper，提供给浮窗与 TodoView）
- 新建 `D:\Steno\src\stores\todos.test.ts`

### 3.3 实现步骤（COPY 模式）

**3.3.1 类型**（仿 types/steno.ts:73）
```ts
export type TodoStatus = 'todo' | 'doing' | 'paused' | 'done';
export type TodoCategory = 'today' | 'planned' | 'doing' | 'paused' | 'done' | 'all' | 'inbox';
export interface Todo {
  id: string;
  content: string;
  status: TodoStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  dueDate: string | null;
  reminderTime: string | null;
  listId: number;
  isDeleted: boolean;
}
export interface CreateTodoInput { content: string; dueDate?: string | null; }
export interface UpdateTodoInput {
  content?: string; status?: TodoStatus;
  dueDate?: string | null; reminderTime?: string | null;
}
export type TodoChangeKind = 'created' | 'updated' | 'completed' | 'deleted';
export interface TodoChangePayload { kind: TodoChangeKind; id: string; todo?: Todo | null; }
```

**3.3.2 Pinia store**（仿 notes.ts:25 + 148 syncExternalNote 模式）
```ts
export const useTodosStore = defineStore('todos', () => {
  const db = useDb();
  const todos = ref<Todo[]>([]);
  const selectedCategory = ref<TodoCategory>('today');
  const loading = ref(false);

  const todayTodos = computed(() => /* ... 客户端筛选 ... */);
  const byCategory = (c: TodoCategory) => /* ... */;
  const categoryCounts = computed(() => /* {today: n, planned: n, ...} */);

  async function fetchAll() { todos.value = await db.listTodos({}); }
  async function fetchToday(includeCompleted = false) { /* ... */ }
  async function createTodo(input: CreateTodoInput) {
    const t = await db.createTodo(input);
    upsertLocal(t);  // 乐观更新 + 后续广播事件也会触发 applyRemoteChange，但 upsertLocal 是幂等的
    return t;
  }
  async function updateTodo(id: string, patch: UpdateTodoInput) { /* ... */ }
  async function completeTodo(id: string, done: boolean) { /* ... */ }
  async function deleteTodo(id: string) { /* ... */ }
  function applyRemoteChange(p: TodoChangePayload) {
    switch (p.kind) {
      case 'created': case 'updated': case 'completed':
        if (p.todo) upsertLocal(p.todo); break;
      case 'deleted':
        todos.value = todos.value.filter(t => t.id !== p.id); break;
    }
  }
  function upsertLocal(t: Todo) { /* find+splice 或 unshift */ }
  return { todos, selectedCategory, loading,
           todayTodos, byCategory, categoryCounts,
           fetchAll, fetchToday, createTodo, updateTodo,
           completeTodo, deleteTodo, applyRemoteChange };
});
```

**3.3.3 useAppEvents 扩展**（仿 useAppEvents.ts:22/76）
```ts
const TODO_CHANGED_EVENT = 'steno:todo-changed';
const TODO_PANEL_TOGGLE_EVENT = 'steno:todo-panel-toggle';
export type TodoChangedPayload = TodoChangePayload;
// 在 useAppEvents() 返回对象内追加：
emitTodoChanged: (p: TodoChangedPayload) => safeEmit(TODO_CHANGED_EVENT, p),
listenTodoChanged: (h: (p: TodoChangedPayload) => void) =>
  safeListen<TodoChangedPayload>(TODO_CHANGED_EVENT, h),
listenTodoPanelToggle: (h: () => void) =>
  safeListen<void>(TODO_PANEL_TOGGLE_EVENT, () => h()),
```

**3.3.4 App.vue 挂载 listener**（仿 MainView listenNoteSaved 模式）
```ts
// App.vue setup 中（或 main shell 组件）：
const todos = useTodosStore();
let unlisten: (() => void) | null = null;
onMounted(async () => {
  unlisten = await useAppEvents().listenTodoChanged(p => todos.applyRemoteChange(p));
});
onUnmounted(() => unlisten?.());
```

### 3.4 验证
- `pnpm typecheck` 通过
- `pnpm test src/stores/todos.test.ts` 覆盖：fetchAll / createTodo 乐观更新 / applyRemoteChange 四种 kind / categoryCounts getter 正确性

### 3.5 风险与回滚
- **风险**：乐观更新 + 远端 created 事件双触发导致重复条目 → 用 `upsertLocal` 的 id 去重（与 notes.ts:174 同模式）
- **风险**：未在 App.vue 卸载时 unlisten → 切换路由后 listener 堆积 → 严格走 `onMounted/onUnmounted` 配对
- **回滚**：删除 stores/todos.ts + composables/useTodos.ts + 三个新类型；useAppEvents 中删 3 行；useDb 中删 6 行；App.vue 删 listener 块

---

## Phase 4 — 浮窗前端实现

### 4.1 前置依赖
- Phase 2 完成（窗口已能 show/hide + emit toggle 事件）
- Phase 3 完成（store + useAppEvents 就绪）

### 4.2 涉及文件
- 修改 `D:\Steno\src\App.vue`（在最顶层判定 `getCurrent().label === 'todo-panel'` → 渲染 TodoQuickPanel；其它情况走原 shell。也可改为更隔离的入口，见下方备选）
- 新建 `D:\Steno\src\views\TodoQuickPanel.vue`
- 新建 `D:\Steno\src\views\TodoQuickPanel.test.ts`

> 备选实现：新建独立 `D:\Steno\src\todo-panel-main.ts` + 修改 Vite 配置生成第二个 entry → 改 tauri.conf 的 url 为 `todo-panel.html`。**本计划不采用**——增加构建复杂度；选 App.vue label 分流（仿 quicknote 模式，参考 `src/App.vue:135` 链）。

### 4.3 实现步骤

**4.3.1 App.vue 分流**
```vue
<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window';
const isTodoPanelWindow = getCurrentWindow().label === 'todo-panel';
</script>
<template>
  <TodoQuickPanel v-if="isTodoPanelWindow" />
  <!-- 否则保持原 shell -->
  <NConfigProvider v-else>...</NConfigProvider>
</template>
```

**4.3.2 TodoQuickPanel.vue 模板**（按截图 3 的视觉 + ZhiDo TaskPanel.vue 结构）
- 顶部条：日历图标 + "今天" + count badge + 视图切换/pin（可省）+ 关闭 × 按钮；`data-tauri-drag-region`
- quick-add 区：`NInput` size="small" placeholder="添加新任务..." + 末尾发送按钮；@keydown.enter 调 `store.createTodo({ content })`
- 列表区：`NScrollbar` + `v-for` 任务行；每行 `NCheckbox` + 单行截断文本 + hover 显示 `NButton text` 删除
- 空态：圆形 ✓ + "太棒了！" + "所有任务都已完成"（参考 ZhiDo 报告 §C 片段）

**4.3.3 生命周期 / 事件**
```ts
onMounted(async () => {
  await store.fetchToday(true);
  // 监听全局快捷键发来的 toggle（其实窗口本身已 hidden，但若 visible 时再按一次需要本窗口主动 hide）
  unlistenToggle = await useAppEvents().listenTodoPanelToggle(async () => {
    await getCurrentWindow().hide();
  });
  // 监听 todo 变更（与主窗口同源）
  unlistenChanged = await useAppEvents().listenTodoChanged(p => store.applyRemoteChange(p));
  // 自动 focus 输入框
  await nextTick(() => inputRef.value?.focus());
});
onUnmounted(() => { unlistenToggle?.(); unlistenChanged?.(); });
```

**4.3.4 拖拽位置持久化**（设置 `'last'` 时）
```ts
import { getCurrentWindow } from '@tauri-apps/api/window';
getCurrentWindow().onMoved(async ({ payload }) => {
  if (settings.todoQuickPanelPosition !== 'last') return;
  await db.updateSetting('todoQuickPanelLastPos', JSON.stringify(payload));
});
```

**4.3.5 样式（截图 3 配色）**
- 容器：`background: rgba(20,20,24,0.92); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.45); backdrop-filter: blur(20px);`
- 列表项：`color: rgba(255,255,255,0.88); hover { background: rgba(255,255,255,0.06); }`
- 空态：`color: rgba(255,255,255,0.6); ✓ 图标: rgba(120,120,130,0.5);`
- 暖色 accent（来自 Steno 既有调色板）：`#a85f32`（按钮 active）、`#ebcfa9`（次级文字）

### 4.4 验证
- `pnpm typecheck` 通过
- `pnpm test src/views/TodoQuickPanel.test.ts` 覆盖：输入提交、勾选完成、删除按钮、空态渲染、count 同步
- **手动冒烟**：按快捷键 → 浮窗显示 ≤200ms、输入框 focus；输入"测试" + Enter → 立即出现在列表顶部、count +1；点 × → 隐藏；再按快捷键 → 重新显示，输入框再次 focus

### 4.5 风险与回滚
- **风险**：App.vue 分流后破坏主窗口测试（mock `getCurrentWindow` 缺失）→ 在 App.test.ts mock `@tauri-apps/api/window` 让 label 返回 `'main'`
- **风险**：浮窗内 `useMessage()` 因不在 NMessageProvider 内报错 → TodoQuickPanel 自己包一层 NMessageProvider
- **回滚**：App.vue 删分流 if、删除 TodoQuickPanel.vue / .test.ts

---

## Phase 5 — 主窗口待办视图替换

### 5.1 前置依赖
- Phase 3 完成（store + 类型）

### 5.2 涉及文件
- 修改 `D:\Steno\src\App.vue`（去掉 `'todo'` 在 `placeholderMeta` 中的分支；在 `shellModes` Set 中确认包含；新增 `<TodoView v-else-if="ui.mode === 'todo'" />`）
- 新建 `D:\Steno\src\views\TodoView.vue`
- 新建 `D:\Steno\src\views\TodoView.test.ts`
- 可选：把分类侧栏独立成 `D:\Steno\src\components\todo\TodoCategorySidebar.vue`

### 5.3 实现步骤

**5.3.1 App.vue 改造**
```ts
// 之前：
case 'todo': return { title: '待办', description: '功能规划中' };
// 删除该分支
```
```vue
<TodoView v-else-if="ui.mode === 'todo'" />
<PlaceholderView v-else-if="placeholderMeta" :title="..." :description="..." />
```

**5.3.2 TodoView.vue 布局**
- 三栏：左侧分类侧栏（180px）+ 中部任务列表（flex 1）+ 顶部操作区（添加输入框 + 搜索 + 视图密度）
- 左侧：`v-for="cat in categories"`，每项 click → `store.selectedCategory = cat.key`；高亮 + 显示 `store.categoryCounts[cat.key]`
- 任务行：`NCheckbox`（todo↔done）+ 双击文本进入 input 编辑 + 状态徽章 `NDropdown`（todo/doing/paused/done）+ `NDatePicker` 选 due_date + 删除按钮

**5.3.3 行内编辑（仿 MainView 现有 inline title edit 模式）**
```vue
<input v-if="editingId === item.id" v-model="editingContent"
       @blur="save()" @keydown.enter="save()" @keydown.escape="cancel()" />
<span v-else @dblclick="startEdit(item)">{{ item.content }}</span>
```

**5.3.4 分类持久化**
```ts
const STORAGE_KEY = 'steno.todo.selectedCategory';
onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY) as TodoCategory | null;
  if (saved) store.selectedCategory = saved;
});
watch(() => store.selectedCategory, v => localStorage.setItem(STORAGE_KEY, v));
```

### 5.4 验证
- `pnpm typecheck` 通过
- `pnpm test src/views/TodoView.test.ts` 覆盖：分类切换 / 行内编辑 / 状态下拉 / 跨分类计数 / 搜索过滤
- 手动冒烟：从侧栏点"待办" → 渲染 TodoView 而非 PlaceholderView；新建任务在"今天"分类立即可见

### 5.5 风险与回滚
- **风险**：分类计数 getter 在大数据量（>1000 todos）下 O(n) 重算耗 CPU → 用 `computed` 缓存即可；本期不做分页
- **风险**：行内编辑与 NDropdown click outside 冲突 → 编辑时禁用其它行动作
- **回滚**：App.vue 恢复 `'todo'` 分支为 PlaceholderView；删 TodoView.vue / .test.ts；`PlaceholderView` 继续可用

---

## Phase 6 — 设置面板"待办浮窗"分组

### 6.1 前置依赖
- Phase 2 完成（后端能响应 settings 变更重注册快捷键）
- Phase 3 完成（useDb 已能调 settings 命令）

### 6.2 涉及文件
- 修改 `D:\Steno\src\stores\settings.ts`（默认 settings 追加 3 项 + 1 项 last 位置）
- 修改 `D:\Steno\src\views\SettingsView.vue`（按 0.2 设置面板三步法加 `'todo'` 分组）
- 修改 `D:\Steno\src\stores\settings.test.ts`（新设置项的默认值与序列化测试）
- 修改 `D:\Steno\src-tauri\src\commands.rs`（追加 `reload_todo_shortcut` 或复用现有 `reload_shortcuts`）

### 6.3 实现步骤

**6.3.1 默认 settings**
```ts
todoQuickPanelEnabled: true,
todoQuickPanelShortcut: 'CommandOrControl+Shift+T',
todoQuickPanelPosition: 'bottom-right' as const,
todoQuickPanelLastPos: null as { x: number; y: number } | null,
```

**6.3.2 SettingsView 三步走**
- step1: `type SettingsSection = ... | 'todo';`
- step2: `sections` 数组追加 `{ key: 'todo', label: '待办浮窗', eyebrow: '快捷与位置' }`
- step3: 模板追加
```vue
<section v-else-if="activeSection === 'todo'" class="settings-section">
  <h3 class="settings-group">浮窗</h3>
  <div class="settings-row">
    <div class="settings-row__meta">
      <span class="settings-row__title">启用待办浮窗</span>
      <span class="settings-row__desc">按快捷键可在屏幕上呼出今日待办</span>
    </div>
    <NSwitch v-model:value="settings.todoQuickPanelEnabled" @update:value="onTodoEnabledChange"/>
  </div>
  <div class="settings-row" :class="{ disabled: !settings.todoQuickPanelEnabled }">
    <div class="settings-row__meta">
      <span class="settings-row__title">快捷键</span>
      <span v-if="shortcutError" class="settings-row__error">绑定失败：{{ shortcutError }}</span>
    </div>
    <ShortcutInput v-model="settings.todoQuickPanelShortcut" @change="onShortcutChange"/>
  </div>
  <div class="settings-row" :class="{ disabled: !settings.todoQuickPanelEnabled }">
    <div class="settings-row__meta">
      <span class="settings-row__title">弹出位置</span>
    </div>
    <NRadioGroup v-model:value="settings.todoQuickPanelPosition">
      <NRadio value="bottom-right">屏幕右下角</NRadio>
      <NRadio value="cursor">跟随光标</NRadio>
      <NRadio value="last">记住上次位置</NRadio>
    </NRadioGroup>
  </div>
</section>
```

**6.3.3 IPC 触发**
- `onShortcutChange`: `await db.updateSetting('todoQuickPanelShortcut', v); await invoke('reload_shortcuts');`
- 后端 `reload_shortcuts` 已存在（commands.rs:404），只需在 `shortcut::register_from_settings` 内增加 `todoQuickPanelShortcut` 的读取分支

### 6.4 验证
- `pnpm typecheck` 通过
- `pnpm test src/stores/settings.test.ts` 通过
- 手动：改快捷键 → 旧组合失效、新组合生效；关闭"启用" → 快捷键注销、位置控件置灰

### 6.5 风险与回滚
- **风险**：`ShortcutInput` 组件不存在 → 用 `NInput` 临时手填字符串，下版本再做可视化录入
- **风险**：用户输入非法快捷键格式（如 `Ctrl+`） → `parse_shortcut` 返回 None，应在前端先做正则校验
- **回滚**：删除 3 个默认 setting + 删 sections 数组项 + 删模板 `<section v-else-if='todo'>`

---

## Phase 7 — 跨窗口集成与端到端验证

### 7.1 前置依赖
- Phase 1–6 全部完成

### 7.2 涉及文件
- 无新建文件；可能在 `App.vue` / `TodoQuickPanel.vue` / `TodoView.vue` 内微调 listener unmount 时机

### 7.3 验证清单（人工冒烟）
1. ✅ Windows 实机：按 `Ctrl+Shift+T` 唤起浮窗 ≤200ms、focus 正确
2. ✅ macOS 实机（如有）：同上
3. ✅ 浮窗写 → 主窗口"今天"分类 ≤1s 内可见
4. ✅ 主窗口完成任务 → 浮窗对应项消失、count -1
5. ✅ Chrome 占用 `Ctrl+Shift+T` 时启动 → 设置面板红字 + NMessage.error；改键后正常生效
6. ✅ 关闭浮窗功能开关 → 再开启 → 无残留监听 / 重复注册（用 `console.log` 检查注册次数）
7. ✅ 浮窗 hide 后再 show → 输入框再次 focus、列表内容未被清空
8. ✅ 拖拽浮窗到屏幕另一边（设置 `'last'`）→ 下次唤起在同位置

### 7.4 风险与回滚
- **风险**：listener 在窗口隐藏时未清理 → 内存累积 → 严格保证 onUnmounted unlisten
- **回滚**：本 phase 仅验证，无代码改动

---

## Phase 8 — 文档与归档

### 8.1 前置依赖
- Phase 7 通过

### 8.2 步骤
- `pnpm typecheck` → 0 error
- `pnpm test` → 全部通过（含新增 todos 相关 5–7 个 spec）
- `cd src-tauri && cargo test` → 通过
- `cd src-tauri && cargo build --release` → 产物可启动
- 更新 README（如有 "Features" 段）
- `openspec validate add-todo-quick-panel` → valid
- 待用户确认后 `openspec archive add-todo-quick-panel`

### 8.3 风险
- **风险**：cargo test 在 Windows CI 上时区相关测试不稳定 → 用 `chrono::FixedOffset` 显式构造，不用系统时区

---

## Open Questions（来自 Phase 0 调研，需用户在 Phase 1 启动前回答）

1. **快捷键失败提示降级**：要采用 0.3 D4 的"日志 + 设置面板红字 + NMessage" 三重降级，还是新增 `tauri-plugin-notification` 依赖？倾向：先用降级方案，下个变更再补通知插件（保持本变更最小化）。
2. **浮窗第二入口构建**：选 App.vue label 分流（本计划默认）还是单独 `todo-panel.html` 入口？前者无构建改动但 App.vue 略复杂，后者构建多一个 entry。
3. **ESC 关闭浮窗**：design.md §Open Questions 已挂起，本计划默认 **支持**（在 TodoQuickPanel 根节点监听 keydown.esc 调 hide），是否同意？
4. **是否允许浮窗失焦自动隐藏**：design 默认"否"，本计划保持；是否需要在设置里加这个开关？倾向：本期不加，下版本看反馈。

---

## 阶段并行 / 串行甘特图

```
时间轴（向右 = 推进顺序）→

Phase 0  ▰▰         (调研，必须先做，本文档已完成)
Phase 1  ░▰▰▰▰▰     (后端数据层；唯一阻塞 Phase 3)
Phase 2  ░▰▰▰▰▰     (浮窗窗口+快捷键；可与 Phase 1 并行)
Phase 3       ░▰▰▰▰  (前端数据层；等 Phase 1)
Phase 4            ░▰▰▰  (浮窗 UI；等 Phase 2 + Phase 3)
Phase 5            ░▰▰▰  (主窗口 TodoView；等 Phase 3，可与 Phase 4 并行)
Phase 6                 ░▰▰  (设置面板；等 Phase 2 + Phase 3)
Phase 7                      ░▰ (集成验证；等 1–6 全部)
Phase 8                       ░▰ (归档)
```

**并行机会**：
- **Phase 1 ∥ Phase 2**：后端的"数据 / 命令 / 迁移"与"窗口 / 快捷键 / 位置"是两条独立子系统，可由不同人或同时开始。
- **Phase 4 ∥ Phase 5**：浮窗 UI 与主窗口 UI 共享同一个 Pinia store，挂载后互不冲突。
- **Phase 6 与 Phase 4/5**：设置面板可在 4/5 进行中并行——只要 Phase 2 的快捷键 + Phase 3 的 useDb settings 接口就绪即可。

**强串行点**：
- Phase 3 必须等 Phase 1（类型 / 命令）
- Phase 4 必须等 Phase 2（窗口 toggle 事件）+ Phase 3（store）
- Phase 7 / 8 必须等所有实现完成

**推荐执行顺序**（单人）：
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8（保守路径，每 phase 各自单独 PR）
