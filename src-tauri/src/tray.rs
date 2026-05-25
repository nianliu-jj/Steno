//! 系统托盘。
//!
//! 功能：
//! - **托盘图标**：紫色 "S" 图标
//! - **左键单击**：呼出主窗口
//! - **右键菜单**：新建速记 / 显示主窗口 / 显示置顶便签 / 打开画布 / 设置 / 退出
//!
//! 页面型入口（画布/设置）统一回到 main 窗口，由前端路由切换视图。
//! 退出菜单调用 `app.exit(0)`，真正退出进程（区别于窗口关闭按钮只 hide）。

use tauri::{
    App, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use crate::{db::Db, quicknote, window_manager};

pub fn setup(app: &App) -> tauri::Result<()> {
    let new_note = MenuItem::with_id(app, "new_note", "新建速记", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let show_stickies =
        MenuItem::with_id(app, "show_stickies", "显示置顶便签", true, None::<&str>)?;
    let open_canvas = MenuItem::with_id(app, "open_canvas", "打开画布", true, None::<&str>)?;
    let open_settings = MenuItem::with_id(app, "open_settings", "设置", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出 Steno", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &new_note,
            &show,
            &sep1,
            &show_stickies,
            &open_canvas,
            &open_settings,
            &sep2,
            &quit,
        ],
    )?;

    let _tray = TrayIconBuilder::with_id("steno-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Steno · 速记")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "new_note" => quicknote::show(app, true, None),
            "show" => window_manager::show_main(app),
            "show_stickies" => {
                // 查 db 拿所有置顶笔记，逐一打开 sticky 窗口；DB 查询很快，
                // 阻塞托盘菜单 callback 几 ms 可接受（且 WebviewWindowBuilder
                // 内部 channel 到主线程，不会卡死托盘线程）。
                if let Some(db) = app.try_state::<Db>() {
                    if let Ok(notes) = db.list_pinned() {
                        for n in notes {
                            let _ = window_manager::open_sticky_note(app, &n.id);
                        }
                    }
                }
            }
            "open_canvas" => {
                let _ = window_manager::open_canvas(app);
            }
            "open_settings" => {
                let _ = window_manager::open_settings(app);
            }
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
                window_manager::show_main(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}
