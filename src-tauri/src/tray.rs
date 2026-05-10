// 系统托盘：紫色 "S" 图标 + 右键菜单（新建速记/显示主窗口/退出）+ 左键单击呼出主窗口。
// "新建速记" 自 PR2.A 起打开浮窗；左键单击仍呼出主窗口（与状态栏入口语义一致）。

use tauri::{
    App,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use crate::{quicknote, window};

pub fn setup(app: &App) -> tauri::Result<()> {
    let new_note = MenuItem::with_id(app, "new_note", "新建速记", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出 Steno", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&new_note, &show, &sep, &quit])?;

    let _tray = TrayIconBuilder::with_id("steno-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Steno · 速记")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "new_note" => quicknote::show(app),
            "show" => window::show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                window::show_main(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}
