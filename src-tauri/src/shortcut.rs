//! 全局快捷键注册与管理。
//!
//! ## 架构
//! 使用 `tauri-plugin-global-shortcut` 注册 OS 级快捷键。
//! plugin handler 不能拿 db state（`'static` 闭包），所以用全局
//! `REGISTRY`（`Vec<(Shortcut, Action)>`）做"按键 → 动作"映射。
//! Vec 线性查找在 N < 10 时比 HashMap 更快。
//!
//! ## 数据流
//! 1. `setup` → `register_from_settings` 从 settings 表读取快捷键字符串
//! 2. `parse_shortcut("Ctrl+Shift+N")` → 解析为 `Shortcut` 结构体
//! 3. 更新全局 REGISTRY → `app.global_shortcut().register(sc)`
//! 4. 设置面板改快捷键 → `reload_shortcuts` command → 重新执行步骤 1-3
//!
//! ## 默认回退
//! settings 读不到或解析失败时回退到硬编码默认值：
//! - 主窗口：`Ctrl+Shift+N`
//! - 速记浮窗：`Ctrl+Shift+M`
//! - 粘贴板：`Ctrl+Shift+V`

use std::sync::{LazyLock, Mutex};

use tauri::{AppHandle, Wry, plugin::TauriPlugin};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::db::{Db, DbError};
use crate::{quicknote, window_manager};

// ----- 默认 fallback ---------------------------------------------------

/// 主窗口呼出/隐藏默认快捷键。settings 读不到时回退到此。
pub fn toggle_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN)
}

/// 浮窗速记默认快捷键。settings 读不到时回退到此。
pub fn quicknote_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyM)
}

/// 粘贴板默认快捷键。settings 读不到时回退到此。
pub fn clipboard_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyV)
}

// ----- 全局 registry ---------------------------------------------------

#[derive(Debug, Clone, Copy)]
enum Action {
    ToggleMain,
    ToggleQuicknote,
    OpenClipboard,
}

static REGISTRY: LazyLock<Mutex<Vec<(Shortcut, Action)>>> =
    LazyLock::new(|| Mutex::new(Vec::new()));

fn lookup_action(s: &Shortcut) -> Option<Action> {
    REGISTRY
        .lock()
        .ok()
        .and_then(|r| r.iter().find(|(sc, _)| sc == s).map(|(_, a)| *a))
}

fn set_registry(entries: Vec<(Shortcut, Action)>) -> Result<(), ShortcutError> {
    let mut reg = REGISTRY.lock().map_err(|_| ShortcutError::Poisoned)?;
    *reg = entries;
    Ok(())
}

// ----- 错误类型 --------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum ShortcutError {
    #[error("database: {0}")]
    Db(#[from] DbError),
    #[error("plugin: {0}")]
    Plugin(#[from] tauri_plugin_global_shortcut::Error),
    #[error("shortcut registry poisoned")]
    Poisoned,
}

// ----- 解析 "Ctrl+Shift+N" 等字符串到 Shortcut --------------------------

fn parse_shortcut(s: &str) -> Option<Shortcut> {
    let mut mods = Modifiers::empty();
    let mut key: Option<Code> = None;
    for part in s.split('+').map(str::trim).filter(|p| !p.is_empty()) {
        match part.to_lowercase().as_str() {
            "ctrl" | "control" | "cmdorctrl" | "commandorcontrol" => mods |= Modifiers::CONTROL,
            "shift" => mods |= Modifiers::SHIFT,
            "alt" | "option" => mods |= Modifiers::ALT,
            "cmd" | "command" | "meta" | "super" => mods |= Modifiers::SUPER,
            other => {
                if let Some(c) = parse_code(other) {
                    key = Some(c);
                }
            }
        }
    }
    key.map(|c| Shortcut::new(Some(mods), c))
}

/// 当前只支持 A-Z 单字母键（覆盖 Ctrl+Shift+{N,M,F} 等用例）。
/// 后续 plan Task 8 SettingsView 加更多键时在此扩展（F1-F12 / 数字 / 方向键）。
fn parse_code(s: &str) -> Option<Code> {
    let s = s.to_uppercase();
    if s.len() != 1 {
        return None;
    }
    let c = s.chars().next()?;
    if !c.is_ascii_alphabetic() {
        return None;
    }
    let idx = (c as u8 - b'A') as usize;
    const CODES: [Code; 26] = [
        Code::KeyA,
        Code::KeyB,
        Code::KeyC,
        Code::KeyD,
        Code::KeyE,
        Code::KeyF,
        Code::KeyG,
        Code::KeyH,
        Code::KeyI,
        Code::KeyJ,
        Code::KeyK,
        Code::KeyL,
        Code::KeyM,
        Code::KeyN,
        Code::KeyO,
        Code::KeyP,
        Code::KeyQ,
        Code::KeyR,
        Code::KeyS,
        Code::KeyT,
        Code::KeyU,
        Code::KeyV,
        Code::KeyW,
        Code::KeyX,
        Code::KeyY,
        Code::KeyZ,
    ];
    CODES.get(idx).copied()
}

// ----- plugin + register ------------------------------------------------

pub fn plugin() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            match lookup_action(shortcut) {
                Some(Action::ToggleMain) => window_manager::toggle_main(app),
                Some(Action::ToggleQuicknote) => quicknote::toggle(app),
                Some(Action::OpenClipboard) => {
                    let _ = window_manager::open_clipboard(app);
                }
                None => {}
            }
        })
        .build()
}

/// setup 阶段调用一次；设置面板改了 mainWindowShortcut / quicknoteShortcut /
/// clipboardShortcut 后再调一次（通过 reload_shortcuts command）。
///
/// 流程：unregister_all → 读 settings (mainWindowShortcut / quicknoteShortcut / clipboardShortcut)
/// → 解析失败回退默认 → 更新 registry → 重新 register OS。
pub fn register_from_settings(app: &AppHandle, db: &Db) -> Result<(), ShortcutError> {
    let main_str = db
        .get_setting("mainWindowShortcut")?
        .unwrap_or_else(|| "Ctrl+Shift+N".to_string());
    let quicknote_str = db
        .get_setting("quicknoteShortcut")?
        .unwrap_or_else(|| "Ctrl+Shift+M".to_string());
    let clipboard_str = db
        .get_setting("clipboardShortcut")?
        .unwrap_or_else(|| "Ctrl+Shift+V".to_string());

    let main_sc = parse_shortcut(&main_str).unwrap_or_else(toggle_shortcut);
    let quicknote_sc = parse_shortcut(&quicknote_str).unwrap_or_else(quicknote_shortcut);
    let clipboard_sc = parse_shortcut(&clipboard_str).unwrap_or_else(clipboard_shortcut);

    // 先把 OS 端老的注销掉；首次注册时 registry 为空，unregister_all 也安全。
    let _ = app.global_shortcut().unregister_all();

    set_registry(vec![
        (main_sc, Action::ToggleMain),
        (quicknote_sc, Action::ToggleQuicknote),
        (clipboard_sc, Action::OpenClipboard),
    ])?;

    app.global_shortcut().register(main_sc)?;
    app.global_shortcut().register(quicknote_sc)?;
    app.global_shortcut().register(clipboard_sc)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ctrl_shift_n() {
        let sc = parse_shortcut("Ctrl+Shift+N").expect("parse");
        assert_eq!(sc, toggle_shortcut());
    }

    #[test]
    fn parse_ctrl_shift_m_lowercase() {
        let sc = parse_shortcut("ctrl+shift+m").expect("parse");
        assert_eq!(sc, quicknote_shortcut());
    }

    #[test]
    fn parse_ctrl_shift_v_for_clipboard() {
        let sc = parse_shortcut("Ctrl+Shift+V").expect("parse");
        assert_eq!(sc, clipboard_shortcut());
    }

    #[test]
    fn clipboard_shortcut_default_uses_ctrl_shift_v() {
        assert_eq!(
            clipboard_shortcut(),
            Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyV),
        );
    }

    #[test]
    fn parse_with_cmdorctrl_alias() {
        // plan 默认值用了 "CmdOrCtrl+Shift+N"，应当也被识别为 Ctrl+Shift+N。
        let sc = parse_shortcut("CmdOrCtrl+Shift+N").expect("parse");
        assert_eq!(sc, toggle_shortcut());
    }

    #[test]
    fn parse_unsupported_key_returns_none() {
        assert!(
            parse_shortcut("Ctrl+Shift+F12").is_none(),
            "F12 not yet supported"
        );
        assert!(parse_shortcut("just text").is_none());
        assert!(parse_shortcut("").is_none());
    }
}
