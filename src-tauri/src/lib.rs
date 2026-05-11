mod backup;
mod commands;
mod db;
mod models;
mod quicknote;
mod shortcut;
mod sync;
mod tray;
mod window_manager;

use tauri::Manager;

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
            commands::update_pinned_window_config,
            commands::update_canvas_position,
            commands::get_setting,
            commands::set_setting,
            commands::open_sticky_note_window,
            commands::close_sticky_note_window,
            commands::open_canvas_window,
            commands::open_search_window,
            commands::open_settings_window,
            commands::open_zen_window,
            commands::reload_shortcuts,
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

            app.manage(database);

            tray::setup(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running steno application");
}
