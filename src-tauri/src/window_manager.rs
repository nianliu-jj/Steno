// 多窗口管理（plan Task 3 Step 2）。从 PR1 的 src/window.rs 演进而来：
// - 保留主窗口的 show_main / hide_main / toggle_main helper（PR1/PR2 既有）。
// - 新增 open_sticky_note / close_sticky_note (label = sticky-{id})。
// - open_canvas / open_settings / open_zen 不再创建页面窗口，
//   而是显示 main 窗口并通过前端路由切换视图。
//
// 浮窗（quicknote）仍在 src/quicknote.rs 自管（它在 tauri.conf.json 预声明，
// 且自带拖动握手 / 失焦隐藏逻辑），不并入此模块。

use serde::Serialize;
use std::path::PathBuf;

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const MAIN_LABEL: &str = "main";
const NAVIGATE_EVENT: &str = "steno:navigate";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MainRoutePayload {
    mode: String,
    note_id: Option<String>,
}

// ----- 主窗口（PR1 既有，从 window.rs 平移） ---------------------------

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN_LABEL) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[allow(dead_code)]
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

// ----- 置顶便签 -------------------------------------------------------

fn sticky_label(note_id: &str) -> String {
    format!("sticky-{note_id}")
}

pub fn open_sticky_note(app: &AppHandle, note_id: &str) -> tauri::Result<()> {
    let label = sticky_label(note_id);
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    // URL = index.html；noteId 由前端 ui store 从 label `sticky-{uuid}` 解析。
    // 大小/位置/外观由 StickyNote.vue 在 mount 时按 pinnedWindowConfig 应用。
    WebviewWindowBuilder::new(app, &label, WebviewUrl::App(PathBuf::from("index.html")))
        .title("Steno · 便签")
        .inner_size(280.0, 220.0)
        .decorations(false)
        .always_on_top(true)
        .transparent(true)
        .resizable(true)
        .skip_taskbar(true)
        .build()?;
    Ok(())
}

pub fn close_sticky_note(app: &AppHandle, note_id: &str) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window(&sticky_label(note_id)) {
        let _ = w.close();
    }
    Ok(())
}

// ----- 主窗口内页面路由：canvas / settings / zen ---------------

fn encode_query_value(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for b in value.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(char::from(b));
            }
            b' ' => encoded.push('+'),
            _ => {
                use std::fmt::Write;
                let _ = write!(encoded, "%{b:02X}");
            }
        }
    }
    encoded
}

fn main_route_url(mode: &str, note_id: Option<&str>) -> String {
    match note_id {
        Some(id) => format!("index.html#{mode}?id={}", encode_query_value(id)),
        None => format!("index.html#{mode}"),
    }
}

/// 页面型入口统一落在 main 窗口里：main 已存在就 emit 前端导航事件；如果
/// 极端情况下 main 不存在，则用 hash URL 创建一个 main 窗口作为兜底。
fn navigate_main(app: &AppHandle, mode: &str, note_id: Option<&str>) -> tauri::Result<()> {
    let payload = MainRoutePayload {
        mode: mode.to_string(),
        note_id: note_id.map(ToOwned::to_owned),
    };

    if let Some(w) = app.get_webview_window(MAIN_LABEL) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        w.emit(NAVIGATE_EVENT, payload)?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        MAIN_LABEL,
        WebviewUrl::App(PathBuf::from(main_route_url(mode, note_id))),
    )
        .title("Steno")
        .inner_size(800.0, 600.0)
        .min_inner_size(480.0, 360.0)
        .center()
        .build()?;
    Ok(())
}

pub fn open_canvas(app: &AppHandle) -> tauri::Result<()> {
    navigate_main(app, "canvas", None)
}

pub fn open_settings(app: &AppHandle) -> tauri::Result<()> {
    navigate_main(app, "settings", None)
}

/// note_id = Some 时把 id 作为导航事件 payload 传给主窗口内的 Zen 页面。
pub fn open_zen(app: &AppHandle, note_id: Option<&str>) -> tauri::Result<()> {
    navigate_main(app, "zen", note_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn main_route_url_for_plain_page_uses_hash_route() {
        assert_eq!(main_route_url("canvas", None), "index.html#canvas");
    }

    #[test]
    fn main_route_url_for_zen_keeps_encoded_note_id() {
        assert_eq!(
            main_route_url("zen", Some("abc 123")),
            "index.html#zen?id=abc+123"
        );
    }
}
