mod quicknote;
mod shortcut;
mod tray;
mod window;

pub fn run() {
    tauri::Builder::default()
        .plugin(shortcut::plugin())
        .invoke_handler(tauri::generate_handler![
            quicknote::load_quicknote_draft,
            quicknote::save_quicknote_draft,
        ])
        .on_window_event(|window, event| match event {
            // 关闭按钮 = 隐藏，不真正退出。真正退出走托盘菜单"退出"项。
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();
                api.prevent_close();
            }
            // 浮窗失焦自动隐藏：点击其它窗口/桌面即收起，符合"瞬开瞬记"语义。
            // 主窗口和其它窗口不受此规则影响。
            tauri::WindowEvent::Focused(false)
                if window.label() == quicknote::QUICKNOTE_LABEL =>
            {
                let _ = window.hide();
            }
            _ => {}
        })
        .setup(|app| {
            tray::setup(app)?;
            shortcut::register(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running steno application");
}
