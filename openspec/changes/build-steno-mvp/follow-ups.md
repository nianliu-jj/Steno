# Steno MVP 遗留事项与跨平台差异

Plan Task 9.4 产出。MVP 已经覆盖 spec 中所有 Requirement，但有几处主动留白或仅在某平台验证过。下面列后续可作为独立 OpenSpec change 推进的事项。

## 跨平台差异

### 全局快捷键默认值

`src-tauri/src/db.rs::ensure_default_settings` 当前在所有平台都写入 `Ctrl+Shift+N` / `Ctrl+Shift+M` / `Ctrl+Shift+F`。`shortcut::parse_shortcut` 已支持 `Cmd / Command / Meta / Super` 别名（macOS 用户改完设置仍然能识别），但默认值没有按 `cfg(target_os)` 分支。

- **影响**：macOS 首次启动会看到 Ctrl 而不是 Cmd，需要手动改一次。
- **建议**：在 `ensure_default_settings` 里按 `cfg!(target_os = "macos")` 写入 `Cmd+Shift+N` 等。同步在 `settings.ts::DEFAULTS` 里做对应分支（前端 store 在 settings 未加载时显示默认）。

### 文件路径分隔符

`build_output_path_joins_dir_and_filename` 测试最初用 `to_string_lossy() == "/tmp/exports/..."` 比较，在 Windows 上 PathBuf::join 会插入 `\`，导致断言失败。修复方式是改用 `file_name()` + `parent()` 各自比较。

- **影响**：编写测试时容易写出"在 Linux 通过、在 Windows 红"的断言。
- **建议**：项目 CONTRIBUTING.md 增加一行"涉及 PathBuf 的测试用 file_name/parent 拆分比较，避免硬编码分隔符"。

### 托盘图标

`tray::setup` 使用 `app.default_window_icon()` 作为托盘图标。在 macOS 上托盘期望使用单色 template icon（黑色 + alpha），目前没有专门提供。

- **影响**：macOS 用户在浅色菜单栏上看到的是彩色图标，与原生风格不一致。
- **建议**：在 `src-tauri/icons/` 下新增 `tray-template.png`（黑色像素 + alpha），在 macOS 分支下加载该 asset。

### 透明便签

`window_manager::open_sticky_note` 在所有平台都启用 `transparent(true)`。
- macOS 与 Windows 11 工作良好。
- Linux 部分桌面环境（无 compositor）下会回退成不透明黑底。

- **影响**：Linux 用户在不开 compositor 的环境下会看到便签 opacity 滑块没有效果。
- **建议**：在 Linux 分支下尝试探测 X11/Wayland compositor，缺失时关闭 transparent 并改用纯色背景。MVP 阶段先在 README 注明。

## 主动留白的 follow-up

### 1. 搜索快捷键还没注册到 OS

`shortcut::register_from_settings` 目前只把 `mainWindowShortcut` 和 `quicknoteShortcut` 写到 OS 全局快捷键。`searchShortcut` 在 `settings` 表里有字段、SettingsView 也有输入框，但**未注册到 OS**。SettingsView 文案里已经注明 "（未注册到 OS）"。

- **下一步**：在 `register_from_settings` 加一条 `Action::OpenSearch`，调用 `window_manager::open_search`。

### 2. PDF 导出适配器

`export::export_pdf` 永远返回 `PdfUnavailable`，前端用 message 提示 "请通过浏览器打印或外部工具完成"。这满足 spec `Scenario: 导出 PDF` 的"失败时显示明确失败原因"，但用户拿不到真实 PDF。

- **下一步**：在 `export.rs` 内引入适配器枚举，至少加 1 种实现：
  - 选项 A：调用 Tauri 的 `webview2 / WKWebView print to pdf` API（跨平台、需要打开一个隐藏 webview 渲染 html_content）。
  - 选项 B：调用系统 `wkhtmltopdf` / `chromium --headless`（要求用户机器装好）。
  - 选项 C：用 `printpdf` crate 从 Markdown AST 直接排版（无字体回退会很丑）。

### 3. 备份 "每天首次" 触发还没实现

`backup::BackupService::maybe_backup` 已实现 "每 N 次修改" 触发，但 spec 还要求 "每天首次保存时也备份一次"。`Db::set_setting` 可以记 `lastBackupDate`，进程内用一个 `AtomicI64` 缓存即可。

- **下一步**：在 commands::save_note / delete_note / set_pinned 成功后调用 `BackupService::maybe_backup`，并传入累计 change_count + last_backup_date 双触发条件。

### 4. tauri-plugin-dialog 还未集成

MVP 导出路径自动写到 `~/.steno/exports/<title>-<short_id>.md`，没有"另存为"对话框。用户改不了文件名也选不了目录。

- **下一步**：加 `tauri-plugin-dialog` 到 `Cargo.toml`，在 `commands::export_note_markdown` 接收可选 `path` 参数（None 时走当前默认逻辑），前端导出菜单加"另存为…"调用 `dialog.save()`。

### 5. Markdown 渲染 sanitize

`useMarkdown.renderHtml` 直接把 marked 输出塞 v-html。MVP 阶段所有内容都是本地用户自己写的，可信。但导入/同步功能上线后这个边界会失守。

- **下一步**：引入 DOMPurify，在 renderHtml 末尾加一层 sanitize。同时考虑后端 `db::render_markdown`（用于 html_content 缓存）是否需要同样保护。

### 6. 失焦关闭误触发

FloatingEditor 通过 `dragUntil` 处理拖窗握手；但用户用 `Alt+Tab` 切窗口、或者切到 Dock 时也会触发 blur。当前 800ms 延迟里如果窗口快速回来不会触发，但在多显示器分屏场景下偶发误关闭。

- **下一步**：把 `blurCloseDelayMs` 默认抬到 1200ms，并在设置里加 "完全禁用失焦关闭" 选项（值为 0 时跳过 timer）。

### 7. 测试覆盖

| 模块 | 单测 | 集成 |
|---|---|---|
| db.rs | ✅ 11 条 | – |
| shortcut.rs | ✅ 4 条 | – |
| backup.rs | ✅ 2 条 | 缺：实际文件写入路径用 tmp dir 端到端 |
| export.rs | ✅ 8 条 | – |
| 前端 composables | ❌ | useAutosave debounce 行为应该有 vitest |
| 前端组件 | ❌ | FloatingEditor "空内容丢弃" 和 "blur 自动关闭" 应有组件测试 |

- **下一步**：Phase 4 收尾前补 vitest，至少覆盖 useAutosave + useMarkdown。

### 8. main.rs / lib.rs 退出前保存

`lib.rs` setup 阶段挂了 `on_window_event(CloseRequested -> hide + prevent_close)`，但**没有处理"托盘菜单退出"前的最后一次 flush**。当前 `tray::quit -> app.exit(0)` 会直接结束进程，浮窗里未保存的内容（在前端 1s debounce 里）可能丢失。

- **下一步**：tray quit handler 改成：先 emit "app://before-quit" 事件，前端所有 view 收到事件后 `flushSave()`，再调 `app.exit(0)`。或者后端在 quit 前 broadcast 一个 channel + 等所有窗口 ack。

## 未在本仓库做的验证

- macOS 与 Linux 的实际 `pnpm tauri:dev` 启动。本仓库目前只在 Windows 11 验证过 `cargo check` 和 `pnpm build`。
- 应用打包（`pnpm tauri:build` 出 `.msi` / `.dmg` / `.AppImage`）尚未跑过。打包阶段可能暴露 icon 路径、bundle identifier、code signing 等问题。
