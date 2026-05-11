// 多窗口管理（plan Task 3 Step 2）。从 PR1 的 src/window.rs 演进而来：
// - 保留主窗口的 show_main / hide_main / toggle_main helper（PR1/PR2 既有）。
// - 新增 open_sticky_note / close_sticky_note (label = sticky-{id})。
// - 新增 open_canvas / open_search / open_settings / open_zen (单实例)。
//
// 浮窗（quicknote）仍在 src/quicknote.rs 自管（它在 tauri.conf.json 预声明，
// 且自带拖动握手 / 失焦隐藏逻辑），不并入此模块。

use std::path::PathBuf;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const MAIN_LABEL: &str = "main";

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

// ----- 单实例视图：canvas / search / settings / zen --------------------

/// 已存在则前置；不存在则 builder 创建。`url` 是 frontendDist 下的相对路径
/// （或 dev 模式下 vite serve 的相对路径）。
fn ensure_single_window(
    app: &AppHandle,
    label: &str,
    url: &str,
    title: &str,
    width: f64,
    height: f64,
) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(PathBuf::from(url)))
        .title(title)
        .inner_size(width, height)
        .center()
        .build()?;
    Ok(())
}

pub fn open_canvas(app: &AppHandle) -> tauri::Result<()> {
    ensure_single_window(app, "canvas", "index.html", "Steno · 画布", 1024.0, 720.0)
}

pub fn open_search(app: &AppHandle) -> tauri::Result<()> {
    ensure_single_window(app, "search", "search.html", "Steno · 搜索", 720.0, 540.0)
}

pub fn open_settings(app: &AppHandle) -> tauri::Result<()> {
    ensure_single_window(
        app,
        "settings",
        "settings.html",
        "Steno · 设置",
        720.0,
        540.0,
    )
}

/// note_id = Some 时把 ?id=... 透传给 zen 页面（用前端 location.search 解析）。
pub fn open_zen(app: &AppHandle, note_id: Option<&str>) -> tauri::Result<()> {
    let label = "zen";
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let url = match note_id {
        Some(id) => format!("zen.html?id={id}"),
        None => "zen.html".to_string(),
    };
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(PathBuf::from(url)))
        .title("Steno · Zen")
        .inner_size(960.0, 720.0)
        .center()
        .build()?;
    Ok(())
}
