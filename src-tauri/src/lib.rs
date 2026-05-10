mod window;

pub fn run() {
    tauri::Builder::default()
        .on_window_event(|window, event| {
            // 关闭按钮 = 隐藏，不真正退出。真正退出走托盘菜单"退出"项（Phase 1 PR1.D 提供）。
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running steno application");
}
