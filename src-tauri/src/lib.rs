mod backup;
mod commands;
mod db;
mod models;
mod quicknote;
mod shortcut;
mod sync;
mod tray;
mod window;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(shortcut::plugin())
        .invoke_handler(tauri::generate_handler![
            quicknote::load_quicknote_draft,
            quicknote::save_quicknote_draft,
            quicknote::quicknote_begin_drag,
            commands::save_note,
            commands::get_note,
            commands::list_notes,
            commands::search_notes,
            commands::delete_note,
            commands::set_note_pinned,
            commands::list_pinned_notes,
            commands::get_setting,
            commands::set_setting,
        ])
        .on_window_event(|window, event| match event {
            // 关闭按钮 = 隐藏，不真正退出。真正退出走托盘菜单"退出"项。
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();
                api.prevent_close();
            }
            // 浮窗失焦自动隐藏。拖动握手期间（500ms 内）跳过，避免
            // startDragging 接管鼠标瞬间触发的 Focused(false) 把浮窗收掉。
            tauri::WindowEvent::Focused(false)
                if window.label() == quicknote::QUICKNOTE_LABEL
                    && quicknote::should_hide_on_blur() =>
            {
                let _ = window.hide();
            }
            _ => {}
        })
        .setup(|app| {
            // SQLite 句柄进 Tauri State，供后续 commands 通过
            // `tauri::State<'_, db::Db>` 取用。
            let database = db::Db::init()?;
            app.manage(database);

            tray::setup(app)?;
            shortcut::register(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running steno application");
}
