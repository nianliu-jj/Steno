// 浮窗速记窗口（label = "quicknote"）：无边框 / 置顶 / 不在任务栏 / 默认隐藏。
// PR2.A/B/C 完成窗口骨架与交互；PR2.D 在此追加内存版草稿恢复。
//
// 草稿目前仅存进程内静态变量（Mutex<String>）。退出 Steno 即丢失，
// PR3 接入本地存储后会替换为持久化版本。
//
// 拖动 vs 失焦自动隐藏的协调：
// 用户按下顶栏 → 前端 invoke `quicknote_begin_drag` → 设一个 500ms 的截止
// 时间 → 调 `startDragging()` → OS 接管鼠标，webview 短暂失焦 →
// `Focused(false)` 守护读到截止时间未过期，跳过 hide。截止时间到期后下一次
// 失焦回到正常隐藏行为。500ms 足以覆盖 startDragging 的接管瞬时。

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

pub const QUICKNOTE_LABEL: &str = "quicknote";

/// 进程内浮窗草稿。Mutex::new 自 Rust 1.63 起为 const fn，可直接 static 初始化。
static DRAFT: Mutex<String> = Mutex::new(String::new());

/// 拖动握手：截止时间内的失焦不触发自动隐藏。
static DRAG_DEADLINE: Mutex<Option<Instant>> = Mutex::new(None);
const DRAG_GRACE: Duration = Duration::from_millis(500);

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

/// `Focused(false)` 处理读取此函数；返回 false 时跳过自动隐藏。
pub fn should_hide_on_blur() -> bool {
    let Ok(slot) = DRAG_DEADLINE.lock() else {
        return true;
    };
    match *slot {
        Some(deadline) if Instant::now() < deadline => false,
        _ => true,
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

#[tauri::command]
pub fn quicknote_begin_drag() {
    if let Ok(mut slot) = DRAG_DEADLINE.lock() {
        *slot = Some(Instant::now() + DRAG_GRACE);
    }
}
