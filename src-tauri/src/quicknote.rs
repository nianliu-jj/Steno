//! 速记浮窗管理（label = `"quicknote"`）。
//!
//! 窗口本身由 `tauri.conf.json` 预声明（`visible=false` / `alwaysOnTop` / `skipTaskbar`），
//! URL 指向 `index.html#floating`，由 `App.vue` 路由到 `FloatingEditor.vue`。
//!
//! Rust 端只提供窗口可见性 helper（`show` / `hide` / `toggle`）和一个事件
//! emit：每次显示浮窗时通过 `quicknote:open` 事件告诉前端"是否新开空白草稿"，
//! FloatingEditor 据此决定 hydrate 最新 draft 还是 reset 进入 fresh 模式。

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const QUICKNOTE_LABEL: &str = "quicknote";
pub const QUICKNOTE_OPEN_EVENT: &str = "quicknote:open";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuicknoteOpenPayload {
    pub fresh: bool,
    /// 指定 hydrate 哪份草稿。`None` 时由前端调 `get_latest_draft`
    /// 取最新一份草稿（快捷键续写场景）；`fresh=true` 时忽略。
    pub note_id: Option<String>,
    /// 直接传入的初始内容。当有值时，前端直接填充编辑器，无需查数据库。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initial_content: Option<String>,
    /// 粘贴板上下文。为 `true` 时，关闭浮窗不创建草稿笔记。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clipboard_context: Option<bool>,
    /// 粘贴板条目 ID。有值时编辑内容会自动保存回该条目。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clipboard_entry_id: Option<String>,
}

pub fn show(
    app: &AppHandle,
    fresh: bool,
    note_id: Option<String>,
    initial_content: Option<String>,
    clipboard_context: Option<bool>,
    clipboard_entry_id: Option<String>,
) {
    if let Some(w) = app.get_webview_window(QUICKNOTE_LABEL) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        let _ = w.emit(
            QUICKNOTE_OPEN_EVENT,
            QuicknoteOpenPayload {
                fresh,
                note_id,
                initial_content,
                clipboard_context,
                clipboard_entry_id,
            },
        );
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
        _ => show(app, false, None, None, None, None),
    }
}
