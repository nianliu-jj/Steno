//! 多窗口管理。
//!
//! 从 PR1 的 `src/window.rs` 演进而来，负责管理所有非浮窗窗口：
//!
//! - **主窗口**：`show_main` / `hide_main` / `toggle_main`
//! - **置顶便签**：`open_sticky_note` / `close_sticky_note`（label = `sticky-{id}`）
//! - **页面型入口**（canvas / settings / zen）：不再创建独立窗口，
//!   而是聚焦 main 窗口并通过 `steno:navigate` 事件切换前端路由
//!
//! 浮窗（quicknote）由 [`quicknote`] 模块自管（`tauri.conf.json` 预声明 +
//! 拖动握手 / 失焦隐藏逻辑），不并入此模块。

use serde::Serialize;
use std::path::PathBuf;

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

use crate::db::Db;
use crate::todo;

pub const MAIN_LABEL: &str = "main";
pub const TODO_PANEL_LABEL: &str = "todo-panel";
const NAVIGATE_EVENT: &str = "steno:navigate";

/// 待办浮窗与屏幕右下角的边距（包含 Windows 任务栏避让）。
const TODO_PANEL_MARGIN_X: i32 = 16;
const TODO_PANEL_MARGIN_BOTTOM: i32 = 56;

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
        return Ok(());
    }
    // URL = index.html；noteId 由前端 ui store 从 label `sticky-{uuid}` 解析。
    // 大小/位置/外观由前端在 mount 时按 pinnedWindowConfig 应用。
    WebviewWindowBuilder::new(app, &label, WebviewUrl::App(PathBuf::from("index.html")))
        .title("Steno · 便签")
        .inner_size(280.0, 220.0)
        .decorations(false)
        .always_on_top(true)
        .transparent(false)
        .resizable(true)
        .skip_taskbar(true)
        .visible(true)
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

pub fn open_clipboard(app: &AppHandle) -> tauri::Result<()> {
    navigate_main(app, "clipboard", None)
}

/// note_id = Some 时把 id 作为导航事件 payload 传给主窗口内的 Zen 页面。
pub fn open_zen(app: &AppHandle, note_id: Option<&str>) -> tauri::Result<()> {
    navigate_main(app, "zen", note_id)
}

// ----- 打印 / 导出 PDF 窗口 -------------------------------------------

fn print_label(note_id: &str) -> String {
    format!("print-{note_id}")
}

/// 打开「打印」窗口（导出 PDF）：独立 webview，label = `print-{id}`，前端按 label
/// 解析出 print 模式 + noteId，渲染只读笔记并自动调用系统打印。已存在则聚焦复用。
pub fn open_print(app: &AppHandle, note_id: &str) -> tauri::Result<()> {
    let label = print_label(note_id);
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(app, &label, WebviewUrl::App(PathBuf::from("index.html")))
        .title("Steno · 打印 / 导出 PDF")
        .inner_size(820.0, 1000.0)
        .center()
        .build()?;
    Ok(())
}

// ----- 待办浮窗（todo-panel） ------------------------------------------

/// 待办浮窗的位置策略 — 与 settings.`todoQuickPanelPosition` 三选一对应。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TodoPanelPosition {
    /// 屏幕右下角（避让任务栏）— 默认值。
    BottomRight,
    /// 跟随当前鼠标位置，但保证不越出屏幕。
    Cursor,
    /// 沿用上次拖拽后保存的位置（无记录则回退到 BottomRight）。
    Last,
}

impl TodoPanelPosition {
    pub fn parse(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "cursor" => TodoPanelPosition::Cursor,
            "last" => TodoPanelPosition::Last,
            // 兼容 "bottom-right" / "bottomright" / 其他 → BottomRight。
            _ => TodoPanelPosition::BottomRight,
        }
    }
}

/// 计算待办浮窗左上角应当落到的物理像素坐标。
///
/// 纯函数，便于单测；不依赖任何 Tauri runtime。
/// - `screen_size`: 物理像素的 (宽, 高)
/// - `panel_size`: 物理像素的 (宽, 高)
/// - `cursor`: `Cursor` 策略下使用；其他策略可传 `None`
/// - `last`: `Last` 策略下使用；为 `None` 时回退 BottomRight
pub fn compute_todo_panel_origin(
    strategy: TodoPanelPosition,
    screen_size: (i32, i32),
    panel_size: (i32, i32),
    cursor: Option<(i32, i32)>,
    last: Option<(i32, i32)>,
) -> (i32, i32) {
    let (sw, sh) = screen_size;
    let (pw, ph) = panel_size;

    let bottom_right = || -> (i32, i32) {
        let x = (sw - pw - TODO_PANEL_MARGIN_X).max(0);
        let y = (sh - ph - TODO_PANEL_MARGIN_BOTTOM).max(0);
        (x, y)
    };

    match strategy {
        TodoPanelPosition::BottomRight => bottom_right(),
        TodoPanelPosition::Cursor => {
            let Some((cx, cy)) = cursor else {
                return bottom_right();
            };
            // 让浮窗左上角靠近光标，但保证整窗在屏幕内。
            let raw_x = cx + 12;
            let raw_y = cy + 12;
            let max_x = (sw - pw).max(0);
            let max_y = (sh - ph).max(0);
            let x = raw_x.clamp(0, max_x);
            let y = raw_y.clamp(0, max_y);
            (x, y)
        }
        TodoPanelPosition::Last => {
            let Some((lx, ly)) = last else {
                return bottom_right();
            };
            // 沿用历史位置，但仍 clamp 进屏幕（屏幕变小 / 主显示器切换）。
            let max_x = (sw - pw).max(0);
            let max_y = (sh - ph).max(0);
            let x = lx.clamp(0, max_x);
            let y = ly.clamp(0, max_y);
            (x, y)
        }
    }
}

/// 解析 `todoQuickPanelLastPos` 设置项（格式 "x,y"），失败返回 None。
pub fn parse_last_position(raw: &str) -> Option<(i32, i32)> {
    let mut iter = raw.split(',').map(str::trim);
    let x = iter.next()?.parse::<i32>().ok()?;
    let y = iter.next()?.parse::<i32>().ok()?;
    Some((x, y))
}

/// 把当前浮窗位置序列化成 settings 字符串（`"x,y"`）。Phase 4 拖拽持久化时调用。
#[allow(dead_code)]
pub fn format_last_position(pos: (i32, i32)) -> String {
    format!("{},{}", pos.0, pos.1)
}

fn apply_position_to_panel(
    app: &AppHandle,
    db: &Db,
    strategy: TodoPanelPosition,
) -> tauri::Result<()> {
    let Some(panel) = app.get_webview_window(TODO_PANEL_LABEL) else {
        return Ok(());
    };
    let panel_size = panel
        .outer_size()
        .map(|s| (s.width as i32, s.height as i32))
        .unwrap_or((320, 480));
    let monitor = panel.current_monitor().ok().flatten();
    let screen_size = monitor
        .as_ref()
        .map(|m| (m.size().width as i32, m.size().height as i32))
        .unwrap_or((1920, 1080));
    let cursor = panel
        .cursor_position()
        .ok()
        .map(|p| (p.x as i32, p.y as i32));
    let last = db
        .get_setting("todoQuickPanelLastPos")
        .ok()
        .flatten()
        .as_deref()
        .and_then(parse_last_position);

    let (x, y) = compute_todo_panel_origin(strategy, screen_size, panel_size, cursor, last);
    panel.set_position(PhysicalPosition::new(x, y))?;
    Ok(())
}

pub fn show_todo_panel(
    app: &AppHandle,
    db: &Db,
    strategy: TodoPanelPosition,
) -> tauri::Result<()> {
    apply_position_to_panel(app, db, strategy)?;
    if let Some(panel) = app.get_webview_window(TODO_PANEL_LABEL) {
        panel.show()?;
        panel.set_focus()?;
        // 通知前端 panel 已唤起（可用于 focus 输入框等附加动作）。
        let _ = panel.emit(todo::TODO_PANEL_TOGGLE_EVENT, true);
    }
    Ok(())
}

pub fn hide_todo_panel(app: &AppHandle) -> tauri::Result<()> {
    if let Some(panel) = app.get_webview_window(TODO_PANEL_LABEL) {
        panel.hide()?;
        let _ = panel.emit(todo::TODO_PANEL_TOGGLE_EVENT, false);
    }
    Ok(())
}

/// 切换浮窗显示状态。由全局快捷键 handler / 托盘菜单 / `toggle_todo_panel` 命令共用。
pub fn toggle_todo_panel(app: &AppHandle, db: &Db) -> tauri::Result<()> {
    let Some(panel) = app.get_webview_window(TODO_PANEL_LABEL) else {
        return Ok(());
    };
    if panel.is_visible().unwrap_or(false) {
        hide_todo_panel(app)
    } else {
        let strategy = db
            .get_setting("todoQuickPanelPosition")
            .ok()
            .flatten()
            .as_deref()
            .map(TodoPanelPosition::parse)
            .unwrap_or(TodoPanelPosition::BottomRight);
        show_todo_panel(app, db, strategy)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn main_route_url_for_plain_page_uses_hash_route() {
        assert_eq!(main_route_url("canvas", None), "index.html#canvas");
    }

    #[test]
    fn main_route_url_for_clipboard_uses_hash_route() {
        assert_eq!(main_route_url("clipboard", None), "index.html#clipboard");
    }

    #[test]
    fn main_route_url_for_zen_keeps_encoded_note_id() {
        assert_eq!(
            main_route_url("zen", Some("abc 123")),
            "index.html#zen?id=abc+123"
        );
    }

    // --- 待办浮窗位置计算 ---

    #[test]
    fn bottom_right_places_panel_with_margin() {
        let origin = compute_todo_panel_origin(
            TodoPanelPosition::BottomRight,
            (1920, 1080),
            (320, 480),
            None,
            None,
        );
        assert_eq!(
            origin,
            (
                1920 - 320 - TODO_PANEL_MARGIN_X,
                1080 - 480 - TODO_PANEL_MARGIN_BOTTOM,
            ),
        );
    }

    #[test]
    fn bottom_right_clamps_when_panel_larger_than_screen() {
        // 桌面尺寸小于浮窗时不允许负坐标。
        let origin = compute_todo_panel_origin(
            TodoPanelPosition::BottomRight,
            (200, 200),
            (320, 480),
            None,
            None,
        );
        assert_eq!(origin, (0, 0));
    }

    #[test]
    fn cursor_strategy_falls_back_to_bottom_right_when_unknown_cursor() {
        let origin = compute_todo_panel_origin(
            TodoPanelPosition::Cursor,
            (1920, 1080),
            (320, 480),
            None,
            None,
        );
        assert_eq!(
            origin,
            (
                1920 - 320 - TODO_PANEL_MARGIN_X,
                1080 - 480 - TODO_PANEL_MARGIN_BOTTOM,
            ),
        );
    }

    #[test]
    fn cursor_strategy_offsets_from_cursor_but_clamps_into_screen() {
        // 光标在屏幕中央：浮窗应该出现在光标右下 12px。
        let origin =
            compute_todo_panel_origin(TodoPanelPosition::Cursor, (1920, 1080), (320, 480), Some((800, 400)), None);
        assert_eq!(origin, (812, 412));

        // 光标贴近右下角：浮窗位置应被 clamp，保证整窗在屏幕内。
        let origin = compute_todo_panel_origin(
            TodoPanelPosition::Cursor,
            (1920, 1080),
            (320, 480),
            Some((1900, 1070)),
            None,
        );
        assert_eq!(origin, (1920 - 320, 1080 - 480));
    }

    #[test]
    fn last_strategy_uses_saved_position_when_in_range() {
        let origin = compute_todo_panel_origin(
            TodoPanelPosition::Last,
            (1920, 1080),
            (320, 480),
            None,
            Some((100, 200)),
        );
        assert_eq!(origin, (100, 200));
    }

    #[test]
    fn last_strategy_clamps_off_screen_position_back_into_range() {
        // 用户曾把浮窗拖到第二显示器后又拔掉了第二显示器：last 坐标位于(3000, 2000)
        // 但当前主屏只有 1920x1080，应被 clamp。
        let origin = compute_todo_panel_origin(
            TodoPanelPosition::Last,
            (1920, 1080),
            (320, 480),
            None,
            Some((3000, 2000)),
        );
        assert_eq!(origin, (1920 - 320, 1080 - 480));
    }

    #[test]
    fn last_strategy_falls_back_when_no_record() {
        let origin = compute_todo_panel_origin(
            TodoPanelPosition::Last,
            (1920, 1080),
            (320, 480),
            None,
            None,
        );
        assert_eq!(
            origin,
            (
                1920 - 320 - TODO_PANEL_MARGIN_X,
                1080 - 480 - TODO_PANEL_MARGIN_BOTTOM,
            ),
        );
    }

    #[test]
    fn parse_last_position_handles_valid_and_invalid_inputs() {
        assert_eq!(parse_last_position("120,340"), Some((120, 340)));
        assert_eq!(parse_last_position(" 12 , 34 "), Some((12, 34)));
        assert_eq!(parse_last_position("12"), None);
        assert_eq!(parse_last_position("a,b"), None);
        assert_eq!(parse_last_position(""), None);
    }

    #[test]
    fn format_last_position_round_trip() {
        let raw = format_last_position((42, 99));
        assert_eq!(raw, "42,99");
        assert_eq!(parse_last_position(&raw), Some((42, 99)));
    }

    #[test]
    fn todo_panel_position_parse_is_case_insensitive_and_defaults_to_bottom_right() {
        assert_eq!(
            TodoPanelPosition::parse("cursor"),
            TodoPanelPosition::Cursor
        );
        assert_eq!(TodoPanelPosition::parse("LAST"), TodoPanelPosition::Last);
        assert_eq!(
            TodoPanelPosition::parse("bottom-right"),
            TodoPanelPosition::BottomRight
        );
        assert_eq!(
            TodoPanelPosition::parse("nonsense"),
            TodoPanelPosition::BottomRight
        );
    }
}
