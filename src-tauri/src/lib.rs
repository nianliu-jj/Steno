//! Steno 应用库 — Tauri 后端核心。
//!
//! ## 模块结构
//! - [`db`] — SQLite 数据访问层（连接管理、迁移、CRUD）
//! - [`models`] — IPC 序列化 DTO（与前端 TypeScript 对齐）
//! - [`commands`] — Tauri IPC 命令（前端 invoke 入口）
//! - [`window_manager`] — 多窗口管理（主窗口、置顶便签、页面路由）
//! - [`quicknote`] — 速记浮窗管理
//! - [`shortcut`] — 全局快捷键注册
//! - [`tray`] — 系统托盘
//! - [`export`] — 笔记导出（Markdown / HTML / PDF）
//! - [`backup`] — 数据库备份
//! - [`sync`] — 同步服务接口（预留）
//!
//! ## 入口
//! `pub fn run()` 由 `main.rs` 调用，配置 Tauri Builder、注册 commands、
//! 初始化数据库和快捷键、设置系统托盘。

mod backup;
pub mod clipboard;
mod cleanup_scheduler;
mod commands;
mod db;
mod export;
mod logging;
mod models;
mod quicknote;
mod reminder_scheduler;
mod shortcut;
mod sync;
mod todo;
mod tray;
mod window_manager;
mod workspace_fs;

use tauri::Manager;

/// 启动 Tauri 应用。
///
/// 初始化顺序：
/// 1. 注册 shortcut plugin
/// 2. 注册所有 IPC commands
/// 3. 设置 CloseRequested → hide（不退出）
/// 4. setup：初始化 SQLite → 恢复置顶便签窗口 → 注册快捷键 → 设置托盘
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(shortcut::plugin())
        .invoke_handler(tauri::generate_handler![
            commands::save_note,
            commands::save_pasted_image,
            commands::save_text_entry,
            commands::save_document_entry,
            commands::convert_text_to_document,
            commands::get_note,
            commands::get_editor_entry,
            commands::list_notes,
            commands::search_notes,
            commands::list_library_entries,
            commands::list_workspace_tree,
            commands::list_workspaces,
            commands::create_workspace,
            commands::delete_note,
            commands::set_note_pinned,
            commands::list_pinned_notes,
            commands::promote_draft,
            commands::get_latest_draft,
            commands::update_pinned_window_config,
            commands::update_canvas_position,
            commands::get_setting,
            commands::set_setting,
            commands::list_clipboard_entries,
            commands::delete_clipboard_entry,
            commands::clear_clipboard_entries,
            commands::copy_clipboard_entry,
            commands::paste_clipboard_entry,
            commands::update_clipboard_entry,
            commands::add_image_clipboard_entry,
            commands::copy_edited_image_to_clipboard,
            commands::pin_clipboard_entry,
            commands::unpin_clipboard_entry,
            commands::count_clipboard_entries,
            commands::open_sticky_note_window,
            commands::close_sticky_note_window,
            commands::open_canvas_window,
            commands::open_settings_window,
            commands::open_quicknote_window,
            commands::open_zen_window,
            commands::open_print_window,
            commands::open_path_in_file_manager,
            commands::open_url,
            commands::reload_shortcuts,
            commands::export_note_markdown,
            commands::export_note_html,
            commands::export_note_pdf,
            commands::get_data_paths,
            commands::list_todos,
            commands::get_today_todos,
            commands::create_todo,
            commands::update_todo,
            commands::complete_todo,
            commands::delete_todo,
            commands::get_todo_activity,
            commands::get_todo_daily_trend,
            commands::reset_todo_stats,
            commands::show_todo_panel,
            commands::hide_todo_panel,
            commands::toggle_todo_panel,
            commands::set_launch_at_startup,
            commands::is_launch_at_startup_enabled,
        ])
        .on_window_event(|window, event| match event {
            // 关闭按钮 = 隐藏，不真正退出。真正退出走托盘菜单"退出"项。
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();
                api.prevent_close();
            }
            _ => {}
        })
        .setup(|app| {
            // macOS：隐藏 Dock 图标，仅保留任务栏托盘。
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // 初始化文件日志（~/.steno/data/logs），失败不致命。
            if let Ok(dir) = db::Db::data_dir() {
                logging::init(&dir);
            }

            // SQLite 句柄进 Tauri State，供后续 commands 通过
            // `tauri::State<'_, db::Db>` 取用。
            let database = db::Db::init()?;

            // 启动恢复（plan 3.8）：列出 is_pinned=true 的笔记，逐一打开
            // sticky 窗口。WebviewWindowBuilder 内部 channel 切主线程，
            // 可在 setup 同步调用。
            if let Ok(pinned) = database.list_pinned() {
                for n in &pinned {
                    let _ = window_manager::open_sticky_note(app.handle(), &n.id);
                }
            }

            // 先从 settings 读快捷键并 register（需要 &Db），之后再 manage()
            // 把 db 交给 State。reload_shortcuts command 后续会从 State 拿。
            shortcut::register_from_settings(app.handle(), &database)?;

            // 剪贴板监视器与 copy/paste 命令共享的回显守卫（去重 Steno 自身写入）。
            let clipboard_echo = clipboard::ClipboardEcho::default();
            clipboard::start_monitor(
                app.handle().clone(),
                database.clone(),
                clipboard_echo.clone(),
            );

            // 提醒调度器需要持有 Db 克隆，单独保留以传给后台 tokio 任务。
            let db_for_scheduler = database.clone();
            // 清理调度器同样需要独立的 Db 克隆。
            let db_for_cleanup = database.clone();

            app.manage(database);
            // 剪贴板"自身写入回显"守卫：供 copy/paste 命令记录、监视器消费。
            app.manage(clipboard_echo);

            tray::setup(app)?;

            // 启动 30s 周期的提醒调度器：扫描到期任务并触发系统通知。
            reminder_scheduler::start_scheduler(app.handle().clone(), db_for_scheduler);

            // 启动 6h 周期的清理调度器：清除过期未保存草稿与粘贴板条目。
            cleanup_scheduler::start_scheduler(app.handle().clone(), db_for_cleanup);

            // 异步按需请求通知权限：仅当库里至少有一条 reminder_time 时弹权限框。
            let handle_for_perm = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                reminder_scheduler::maybe_request_permission(&handle_for_perm).await;
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running steno application");
}
