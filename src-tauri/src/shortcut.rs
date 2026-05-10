// 全局快捷键：Ctrl+Shift+N 切换主窗口可见性。
// PR1 硬编码；用户自定义入口留给 Phase 1 收尾的设置面板。

use tauri::{AppHandle, Wry, plugin::TauriPlugin};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

use crate::window;

/// 默认呼出/隐藏快捷键。
/// macOS 后续按平台分支改为 Cmd+Shift+N。
pub fn toggle_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN)
}

pub fn plugin() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() == ShortcutState::Pressed && shortcut == &toggle_shortcut() {
                window::toggle_main(app);
            }
        })
        .build()
}

pub fn register(app: &AppHandle) -> tauri::Result<()> {
    app.global_shortcut().register(toggle_shortcut())?;
    Ok(())
}
