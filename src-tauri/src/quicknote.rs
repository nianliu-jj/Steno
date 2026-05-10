// 浮窗速记窗口（label = "quicknote"）：无边框 / 置顶 / 不在任务栏 / 默认隐藏。
// PR2.A 只提供窗口骨架与 show/hide/toggle；快捷键、失焦自动收起、草稿恢复留给后续小步。

use tauri::{AppHandle, Manager};

pub const QUICKNOTE_LABEL: &str = "quicknote";

pub fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(QUICKNOTE_LABEL) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[allow(dead_code)]
pub fn hide(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(QUICKNOTE_LABEL) {
        let _ = w.hide();
    }
}

#[allow(dead_code)]
pub fn toggle(app: &AppHandle) {
    let Some(w) = app.get_webview_window(QUICKNOTE_LABEL) else {
        return;
    };
    match w.is_visible() {
        Ok(true) => {
            let _ = w.hide();
        }
        _ => show(app),
    }
}
