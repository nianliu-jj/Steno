// 主窗口（label = "main"）的显示/隐藏/切换辅助函数。
// 后续 PR2/PR3 再加浮窗、便签等其他 label 的窗口管理。

use tauri::{AppHandle, Manager};

pub const MAIN_LABEL: &str = "main";

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN_LABEL) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn hide_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN_LABEL) {
        let _ = w.hide();
    }
}

pub fn toggle_main(app: &AppHandle) {
    let Some(w) = app.get_webview_window(MAIN_LABEL) else {
        return;
    };
    match w.is_visible() {
        Ok(true) => {
            let _ = w.hide();
        }
        _ => show_main(app),
    }
}
