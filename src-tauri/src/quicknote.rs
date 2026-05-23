// 浮窗速记窗口（label = "quicknote"）。
//
// 窗口本身由 tauri.conf.json 预声明（visible=false / alwaysOnTop / skipTaskbar）；
// URL 指向 index.html#floating，由 App.vue 路由到 FloatingEditor.vue。
//
// Rust 这边只剩窗口可见性 helper：show / hide / toggle，外加一个事件 emit：
// 每次显示浮窗时把"是否新开一份空白草稿"经 `quicknote:open` 事件传给前端，
// 让 FloatingEditor 决定 hydrate 最新 draft 还是 reset 进 fresh 模式。

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const QUICKNOTE_LABEL: &str = "quicknote";
pub const QUICKNOTE_OPEN_EVENT: &str = "quicknote:open";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuicknoteOpenPayload {
    pub fresh: bool,
}

pub fn show(app: &AppHandle, fresh: bool) {
    if let Some(w) = app.get_webview_window(QUICKNOTE_LABEL) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        let _ = w.emit(QUICKNOTE_OPEN_EVENT, QuicknoteOpenPayload { fresh });
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
        // 全局快捷键唤起：默认按"继续上一份草稿"打开。
        _ => show(app, false),
    }
}
