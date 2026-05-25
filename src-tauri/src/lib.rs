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
mod commands;
mod db;
mod export;
mod models;
mod quicknote;
mod shortcut;
mod sync;
mod tray;
mod window_manager;

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
        .plugin(shortcut::plugin())
        .invoke_handler(tauri::generate_handler![
            commands::save_note,
            commands::get_note,
            commands::list_notes,
            commands::search_notes,
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
            commands::open_sticky_note_window,
            commands::close_sticky_note_window,
            commands::open_canvas_window,
            commands::open_settings_window,
            commands::open_quicknote_window,
            commands::open_zen_window,
            commands::reload_shortcuts,
            commands::export_note_markdown,
            commands::export_note_html,
            commands::export_note_pdf,
            commands::get_data_paths,
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

            clipboard::start_monitor(app.handle().clone(), database.clone());

            app.manage(database);

            tray::setup(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running steno application");
}
