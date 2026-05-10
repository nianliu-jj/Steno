// 全局快捷键：
//   Ctrl+Shift+N  切换主窗口可见性
//   Ctrl+Shift+M  切换浮窗速记可见性
// PR1/PR2 硬编码；用户自定义入口留给 Phase 1 收尾的设置面板。

use tauri::{AppHandle, Wry, plugin::TauriPlugin};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

use crate::{quicknote, window_manager};

/// 主窗口呼出/隐藏快捷键。macOS 后续按平台分支改为 Cmd+Shift+N。
pub fn toggle_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN)
}

/// 浮窗速记呼出/隐藏快捷键。macOS 后续按平台分支改为 Cmd+Shift+M。
pub fn quicknote_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyM)
}

pub fn plugin() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            if shortcut == &toggle_shortcut() {
                window_manager::toggle_main(app);
            } else if shortcut == &quicknote_shortcut() {
                quicknote::toggle(app);
            }
        })
        .build()
}

pub fn register(app: &AppHandle) -> Result<(), tauri_plugin_global_shortcut::Error> {
    app.global_shortcut().register(toggle_shortcut())?;
    app.global_shortcut().register(quicknote_shortcut())?;
    Ok(())
}
