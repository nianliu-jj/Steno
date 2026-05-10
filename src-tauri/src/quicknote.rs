// 浮窗速记窗口（label = "quicknote"）：无边框 / 置顶 / 不在任务栏 / 默认隐藏。
// PR2.A/B/C 完成窗口骨架与交互；PR2.D 在此追加内存版草稿恢复。
//
// 草稿目前仅存进程内静态变量（Mutex<String>）。退出 Steno 即丢失，
// PR3 接入本地存储后会替换为持久化版本。

use std::sync::Mutex;

use tauri::{AppHandle, Manager};

pub const QUICKNOTE_LABEL: &str = "quicknote";

/// 进程内浮窗草稿。Mutex::new 自 Rust 1.63 起为 const fn，可直接 static 初始化。
static DRAFT: Mutex<String> = Mutex::new(String::new());

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

#[tauri::command]
pub fn load_quicknote_draft() -> String {
    DRAFT.lock().map(|s| s.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn save_quicknote_draft(text: String) {
    if let Ok(mut slot) = DRAFT.lock() {
        *slot = text;
    }
}
