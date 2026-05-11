// 浮窗速记窗口（label = "quicknote"）。
//
// 窗口本身由 tauri.conf.json 预声明（visible=false / alwaysOnTop / skipTaskbar）；
// URL 指向 index.html#floating，由 App.vue 路由到 FloatingEditor.vue。
//
// Rust 这边只剩窗口可见性 helper：show / hide / toggle。
// - 失焦保存关闭、拖动握手、空内容丢弃、置顶联动 都改由前端 FloatingEditor 实现
//   （plan Task 5.4/5.5/5.6 + useAutosave + 前端 dragUntil 节流）。
// - PR2.D 的进程内 Mutex<String> 草稿在 Task 5 之后被真实 SQLite 保存替代，
//   连同 load_quicknote_draft / save_quicknote_draft / quicknote_begin_drag /
//   should_hide_on_blur 一并下掉。

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
