# Steno 粘贴板功能设计

日期：2026-05-25

## 背景

Steno 当前侧边栏已经有“粘贴板”入口，但仍渲染占位页。项目现有 Tauri 后端已经具备 SQLite 数据层、全局快捷键插件、主窗口路由事件和设置项持久化能力。参考项目 `D:\剪贴板\uni` 的剪贴板模块包含完整的 Windows 原生格式读取、来源应用追踪、富文本还原和粘贴回目标窗口能力，但体量较大，不适合一次性完整搬入 Steno。

本次实现采用轻量内置方案：完成复制监听、内容分类、历史展示、快捷键唤出和快捷键可配置。复杂富文本还原、来源应用图标、顺序粘贴、自动粘贴到上一个窗口等能力留给后续迭代。

## 目标

- 监听系统剪贴板变化，把复制内容写入 Steno 的本地 SQLite 数据库。
- 自动按内容类型分类：文本、链接、代码、图片、文件、富文本。
- 替换当前“粘贴板”占位页，展示剪贴板历史、搜索和类型筛选。
- 使用默认全局快捷键 `Ctrl+Shift+V` 呼出主窗口并跳转到粘贴板页。
- 在设置页支持修改粘贴板快捷键，修改后重新注册全局快捷键。
- 提供基础操作：把历史条目复制回系统剪贴板、删除单条、清空普通历史。

## 非目标

- 不实现参考项目的完整 Windows 原生剪贴板格式还原。
- 不接管 `Win+V` 或禁用系统剪贴板。
- 不实现“点击条目后自动粘贴到上一个应用窗口”。
- 不实现来源应用图标、标签管理、置顶排序、顺序粘贴队列。
- 不把图片和附件做复杂的独立资源管理；首版以可展示和可复制为主。

## 后端设计

新增 `src-tauri/src/clipboard.rs` 模块，负责剪贴板历史模型、分类、监控和 IPC 命令。

新增 SQLite 表 `clipboard_history`，通过 `Db::migrate` 升级到下一版 schema：

- `id TEXT PRIMARY KEY`：UUID。
- `content_type TEXT NOT NULL`：`text | url | code | image | file | rich_text`。
- `content TEXT NOT NULL`：文本内容、文件路径列表或图片 data URL。
- `html_content TEXT`：富文本 HTML 快照，首版可为空。
- `preview TEXT NOT NULL`：列表摘要。
- `content_hash TEXT NOT NULL`：去重用。
- `created_at TEXT NOT NULL`：首次记录时间。
- `updated_at TEXT NOT NULL`：最近复制时间。
- `size_bytes INTEGER NOT NULL DEFAULT 0`：粗略大小。

监控逻辑在 Tauri `setup` 阶段启动后台任务。启动时读取当前剪贴板并作为基线，不立即写入历史。之后周期性读取剪贴板，发现内容 hash 改变后分类并入库。首版使用 `arboard` 读取文本和图片；Windows 文件列表、HTML Format 等原生格式暂不完整解析，只通过文本内容和常见路径形态做保守分类。去重策略为同类型同 hash 更新 `updated_at` 并移到顶部，避免重复复制刷屏。

后端命令：

- `list_clipboard_entries(limit, content_type, query)`：返回最近历史。
- `delete_clipboard_entry(id)`：删除单条。
- `clear_clipboard_entries()`：清空未保留历史。
- `copy_clipboard_entry(id)`：把条目复制回系统剪贴板。

后台写入新条目后向前端发 `steno:clipboard-updated` 事件，payload 为新条目。删除和清空操作发 `steno:clipboard-removed` 或 `steno:clipboard-cleared`。

## 快捷键设计

现有 `shortcut.rs` 已注册主窗口和速记浮窗快捷键。本次新增：

- 默认设置项 `clipboardShortcut = "Ctrl+Shift+V"`。
- `Action::OpenClipboard`。
- `register_from_settings` 读取并注册第三个快捷键。
- 触发时调用 `window_manager::open_clipboard(app)`。
- `window_manager::open_clipboard` 复用现有 `navigate_main(app, "clipboard", None)`，显示主窗口并发送导航事件。

设置页新增“粘贴板快捷键”输入项。保存后写入 settings 表并调用现有 `reload_shortcuts` 命令，让 Rust 端重新注册快捷键。快捷键解析首版仍沿用当前 `Ctrl/Shift/Alt/Super + A-Z` 范围；如果设置页已有录制组件，则复用该模式，否则先使用普通输入框加校验。

## 前端设计

新增 `src/views/ClipboardView.vue`，并在 `App.vue` 中将 `ui.mode === "clipboard"` 从占位页切换为实际视图。

新增 `src/stores/clipboard.ts`：

- 保存历史列表、加载状态、搜索词、类型筛选。
- 调用后端命令加载和操作历史。
- 监听 `steno:clipboard-updated`、`steno:clipboard-removed`、`steno:clipboard-cleared` 并同步列表。

界面沿用当前工作台风格：上方是搜索和类型筛选，主体为可滚动列表，空状态保留轻量提示。每条记录展示类型、预览、时间和基础操作按钮。图片条目显示缩略图；文本、链接、代码、富文本显示多行摘要；文件条目显示路径摘要。

侧边栏“粘贴板”计数可以在首版延后；如果实现成本低，可显示当前加载列表数量。

## 错误处理

- 剪贴板读取失败时跳过当前轮询，不弹窗打断用户。
- 数据库写入失败记录日志，不影响主窗口和速记功能。
- 快捷键注册失败时保留旧设置值，并在设置页显示错误。
- 图片过大时可跳过或仅保存文本提示，避免数据库膨胀。
- 非 Tauri 浏览器测试环境下 store 命令调用返回空列表，保证组件可测试。

## 测试计划

Rust 单元测试：

- 内容分类：URL、代码、普通文本、文件路径、空文本。
- 预览生成和长度截断。
- hash 去重：同内容更新原条目而不是新增。
- 默认设置迁移包含 `clipboardShortcut`。
- 快捷键解析能解析 `Ctrl+Shift+V`。

前端测试：

- `ClipboardView` 首屏能渲染空状态和列表状态。
- store 加载历史、按事件插入新条目、按类型和搜索词筛选。
- `App.vue` 在 `clipboard` mode 渲染 `ClipboardView` 而不是 `PlaceholderView`。
- 设置页显示并保存粘贴板快捷键，保存后调用 `reload_shortcuts`。

## 验收标准

- 启动应用后复制文本、链接、代码、图片或文件路径，粘贴板页能自动出现对应条目并显示正确分类。
- 按 `Ctrl+Shift+V` 能呼出主窗口并导航到粘贴板页。
- 在设置页修改粘贴板快捷键后，新快捷键生效，旧快捷键不再触发粘贴板页。
- 点击历史条目的复制操作后，系统剪贴板内容变为该条目内容。
- `pnpm typecheck`、前端相关测试和 Rust 相关测试通过。
