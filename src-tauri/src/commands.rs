// Tauri commands 边界。Plan Task 3 Step 1。
//
// 所有 db 操作通过 `tauri::async_runtime::spawn_blocking` 包，避免在 Tokio
// 多线程 runtime 上阻塞 reactor。Db 实现 Clone（Arc<Mutex<Connection>>），
// 闭包持有 clone 即可。
//
// 错误模式：tauri::command 需要 Result<T, E: Serialize>。把 DbError /
// JoinError 都格式化成 String 返给前端 — 前端有完整错误消息便于排查，
// 同时避免泄露 DbError 内部结构。

use tauri::{AppHandle, State};

use crate::db::Db;
use crate::models::{Note, SaveNoteRequest, SearchNotesRequest};
use crate::{shortcut, window_manager};

/// 把任意 Error-like 转成 String，匹配 tauri::command 的 Result<T, String> 约定。
fn to_msg<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
pub async fn save_note(db: State<'_, Db>, input: SaveNoteRequest) -> Result<Option<Note>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.save_note(input))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn get_note(db: State<'_, Db>, id: String) -> Result<Option<Note>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.get_note(&id))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn list_notes(db: State<'_, Db>, limit: i64) -> Result<Vec<Note>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.list_notes(limit))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn search_notes(
    db: State<'_, Db>,
    input: SearchNotesRequest,
) -> Result<Vec<Note>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.search_notes(input))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn delete_note(db: State<'_, Db>, id: String) -> Result<(), String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.delete_note(&id))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

/// Plan 3.1 signature 是 set_note_pinned(app, db, id, is_pinned) → Note，
/// 让命令同时联动 sticky 窗口。当前 commit 只更新 db，**窗口联动留给前端**
/// 在 invoke 后自己调 open_sticky_note_window / close_sticky_note_window
/// （Commit 2 落地 window_manager 后会暴露这两个命令）。
#[tauri::command]
pub async fn set_note_pinned(
    db: State<'_, Db>,
    id: String,
    is_pinned: bool,
) -> Result<Note, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.set_pinned(&id, is_pinned))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn list_pinned_notes(db: State<'_, Db>) -> Result<Vec<Note>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.list_pinned())
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn get_setting(db: State<'_, Db>, key: String) -> Result<Option<String>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.get_setting(&key))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn set_setting(db: State<'_, Db>, key: String, value: String) -> Result<(), String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.set_setting(&key, &value))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

// ----- 窗口管理 commands（Plan Task 3 Step 2 暴露给前端） ---------------

#[tauri::command]
pub fn open_sticky_note_window(app: AppHandle, id: String) -> Result<(), String> {
    window_manager::open_sticky_note(&app, &id).map_err(to_msg)
}

#[tauri::command]
pub fn close_sticky_note_window(app: AppHandle, id: String) -> Result<(), String> {
    window_manager::close_sticky_note(&app, &id).map_err(to_msg)
}

#[tauri::command]
pub fn open_canvas_window(app: AppHandle) -> Result<(), String> {
    window_manager::open_canvas(&app).map_err(to_msg)
}

#[tauri::command]
pub fn open_search_window(app: AppHandle) -> Result<(), String> {
    window_manager::open_search(&app).map_err(to_msg)
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    window_manager::open_settings(&app).map_err(to_msg)
}

#[tauri::command]
pub fn open_zen_window(app: AppHandle, id: Option<String>) -> Result<(), String> {
    window_manager::open_zen(&app, id.as_deref()).map_err(to_msg)
}

// ----- 快捷键 ----------------------------------------------------------

/// 设置面板写完 mainWindowShortcut / quicknoteShortcut 后调用，让 Rust 端
/// unregister_all + 用新值重新 register。同步 command：只做一次 db 查询和
/// OS register，无需 spawn_blocking。
#[tauri::command]
pub fn reload_shortcuts(app: AppHandle, db: State<'_, Db>) -> Result<(), String> {
    shortcut::register_from_settings(&app, db.inner()).map_err(to_msg)
}
