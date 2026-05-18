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

use tauri::{AppHandle, Emitter, Manager};

pub const QUICKNOTE_LABEL: &str = "quicknote";

/// 推给前端的 hydrate 事件名。FloatingEditor 监听 payload (Option<String>) 决定
/// 是清空进入新建模式还是按 id 加载已有 text entry。
pub const QUICKNOTE_HYDRATE_EVENT: &str = "quicknote://hydrate";

/// 唤起浮窗时的 hydrate 策略。
/// - `Skip`：不发 hydrate 事件，浮窗前端 state 保持上次未提交的内容（快捷键/失焦关闭后再次唤起会"恢复上次窗口"）。
/// - `Reset`：发 hydrate 事件 payload=None，浮窗清空进入全新会话（主页"速记"按钮、托盘"新笔记"）。
/// - `Entry(id)`：发 hydrate 事件 payload=Some(id)，浮窗按 id 加载已有 text entry（主页双击文本卡片）。
pub enum HydrateMode {
    Skip,
    Reset,
    Entry(String),
}

pub fn show(app: &AppHandle, mode: HydrateMode) {
    if let Some(w) = app.get_webview_window(QUICKNOTE_LABEL) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        match mode {
            HydrateMode::Skip => {}
            HydrateMode::Reset => {
                let _ = w.emit_to(QUICKNOTE_LABEL, QUICKNOTE_HYDRATE_EVENT, Option::<String>::None);
            }
            HydrateMode::Entry(id) => {
                let _ = w.emit_to(QUICKNOTE_LABEL, QUICKNOTE_HYDRATE_EVENT, Some(id));
            }
        }
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
        _ => show(app, HydrateMode::Skip),
    }
}
