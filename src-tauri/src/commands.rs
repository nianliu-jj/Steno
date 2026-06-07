//! Tauri IPC 命令边界 — 前端 `invoke` 调用的真正入口。
//!
//! ## 线程模型
//! 所有 db 操作通过 [`tauri::async_runtime::spawn_blocking`] 包裹，
//! 避免在 Tokio 多线程 runtime 上阻塞 reactor。
//! `Db` 实现 `Clone`（`Arc<Mutex<Connection>>`），闭包持有 clone 即可。
//!
//! ## 错误模式
//! `tauri::command` 需要 `Result<T, E: Serialize>`。
//! 把 `DbError` / `JoinError` 都格式化成 `String` 返给前端 —
//! 前端有完整错误消息便于排查，同时避免泄露内部结构。

use std::path::{Path, PathBuf};
use std::process::Command;

use base64::Engine;
use tauri::{AppHandle, Emitter, State};

use crate::clipboard::{self, ClipboardEntry};
use crate::db::Db;
use crate::export;
use crate::models::{
    CanvasPosition, ConvertTextToDocumentRequest, CreateWorkspaceRequest, LibraryEntry,
    MainListContext, Note, PinnedWindowConfig, SaveDocumentEntryRequest, SaveNoteRequest,
    SaveTextEntryRequest, SearchNotesRequest, Workspace, EditorEntry,
};
use crate::todo::{
    self, CreateTodoRequest, TodoActivityPoint, TodoChangeKind, TodoChangePayload,
    TodoDailyTrendRequest, TodoStatsRange, TodayTodosRequest, TodoTrendPoint, UpdateTodoRequest,
};
use crate::{quicknote, shortcut, window_manager};

const STENO_ASSET_PREFIX: &str = "steno-asset:";

/// 把任意 Error-like 转成 String，匹配 tauri::command 的 Result<T, String> 约定。
fn to_msg<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePastedImageRequest {
    pub data_url: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPastedImage {
    pub markdown_url: String,
    pub relative_path: String,
    pub absolute_path: String,
}

fn extension_for_image_mime(mime: &str) -> Result<&'static str, String> {
    match mime {
        "image/png" => Ok("png"),
        "image/jpeg" | "image/jpg" => Ok("jpg"),
        "image/gif" => Ok("gif"),
        "image/webp" => Ok("webp"),
        "image/svg+xml" => Ok("svg"),
        _ => Err(format!("unsupported pasted image type: {mime}")),
    }
}

fn parse_image_data_url(data_url: &str) -> Result<(&str, &[u8]), String> {
    let (metadata, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| "invalid pasted image data URL".to_string())?;
    let mime = metadata
        .strip_prefix("data:")
        .and_then(|value| value.strip_suffix(";base64"))
        .ok_or_else(|| "pasted image must be a base64 data URL".to_string())?;
    if !mime.starts_with("image/") {
        return Err("pasted data URL is not an image".to_string());
    }
    Ok((mime, encoded.as_bytes()))
}

fn safe_asset_url(relative_path: &Path) -> String {
    let path = relative_path
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/");
    format!("{STENO_ASSET_PREFIX}{path}")
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
pub async fn save_pasted_image(
    db: State<'_, Db>,
    input: SavePastedImageRequest,
) -> Result<SavedPastedImage, String> {
    let data_dir = db.inner().paths().0;
    tauri::async_runtime::spawn_blocking(move || {
        let (mime, encoded) = parse_image_data_url(&input.data_url)?;
        let ext = extension_for_image_mime(mime)?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|e| format!("invalid pasted image base64: {e}"))?;
        if bytes.is_empty() {
            return Err("pasted image is empty".to_string());
        }

        let date = chrono::Local::now().format("%Y-%m-%d").to_string();
        let relative_dir = PathBuf::from("images").join(date);
        let absolute_dir = data_dir.join(&relative_dir);
        std::fs::create_dir_all(&absolute_dir).map_err(to_msg)?;

        let filename = format!("{}.{}", uuid::Uuid::new_v4(), ext);
        let relative_path = relative_dir.join(filename);
        let absolute_path = data_dir.join(&relative_path);
        std::fs::write(&absolute_path, bytes).map_err(to_msg)?;

        Ok(SavedPastedImage {
            markdown_url: safe_asset_url(&relative_path),
            relative_path: relative_path.to_string_lossy().into_owned(),
            absolute_path: absolute_path.to_string_lossy().into_owned(),
        })
    })
    .await
    .map_err(to_msg)?
}

#[tauri::command]
pub async fn save_text_entry(
    db: State<'_, Db>,
    input: SaveTextEntryRequest,
) -> Result<LibraryEntry, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.save_text_entry(input))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn save_document_entry(
    db: State<'_, Db>,
    input: SaveDocumentEntryRequest,
) -> Result<LibraryEntry, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.save_document_entry(input))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn convert_text_to_document(
    db: State<'_, Db>,
    input: ConvertTextToDocumentRequest,
) -> Result<LibraryEntry, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.convert_text_to_document(input))
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
pub async fn get_editor_entry(
    db: State<'_, Db>,
    id: String,
) -> Result<Option<EditorEntry>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.get_editor_entry(&id))
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
pub async fn list_library_entries(
    db: State<'_, Db>,
    context: MainListContext,
) -> Result<Vec<LibraryEntry>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.list_library_entries(context))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn list_workspace_tree(
    db: State<'_, Db>,
    workspace_id: String,
) -> Result<Vec<LibraryEntry>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.list_workspace_tree(&workspace_id))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn list_workspaces(db: State<'_, Db>) -> Result<Vec<Workspace>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.list_workspaces())
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn create_workspace(
    db: State<'_, Db>,
    input: CreateWorkspaceRequest,
) -> Result<Workspace, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let name = input
            .name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| {
                std::path::Path::new(&input.root_path)
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("新工作区")
                    .to_string()
            });
        db.create_workspace(&name, std::path::PathBuf::from(input.root_path))
    })
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

/// 把"未保存草稿"（is_draft=1）原子地提升为正式笔记：分配新 UUID、清掉
/// is_draft 标记、删掉原 draft 行；返回新笔记。若指定 id 不存在或不是
/// 草稿则返回 Ok(None)。前端在浮窗"保存"按钮里调用。
#[tauri::command]
pub async fn promote_draft(db: State<'_, Db>, id: String) -> Result<Option<Note>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.promote_draft(&id))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

/// 返回最近一份未保存草稿，按 updated_at 降序取首条；无草稿返回 Ok(None)。
/// 前端浮窗 "继续上一份草稿" 路径调用。
#[tauri::command]
pub async fn get_latest_draft(db: State<'_, Db>) -> Result<Option<Note>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.latest_draft())
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

/// Plan Task 6 Step 1：StickyNote 调整透明度/颜色/字号时单列更新，
/// 避免每次都走 save_note 的整行 INSERT OR REPLACE。
#[tauri::command]
pub async fn update_pinned_window_config(
    db: State<'_, Db>,
    id: String,
    config: PinnedWindowConfig,
) -> Result<Note, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.update_pinned_window_config(&id, &config))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

/// Plan Task 7 Step 1：Canvas 拖卡片释放后单列更新位置。
#[tauri::command]
pub async fn update_canvas_position(
    db: State<'_, Db>,
    id: String,
    position: CanvasPosition,
) -> Result<Note, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.update_canvas_position(&id, &position))
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

// ----- 剪贴板 commands -------------------------------------------------

#[tauri::command]
pub async fn list_clipboard_entries(
    db: State<'_, Db>,
    limit: i64,
    content_type: Option<String>,
    query: Option<String>,
) -> Result<Vec<ClipboardEntry>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.list_clipboard_entries(limit, content_type, query)
    })
    .await
    .map_err(to_msg)?
    .map_err(to_msg)
}

#[tauri::command]
pub async fn delete_clipboard_entry(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
) -> Result<(), String> {
    let db = db.inner().clone();
    let id_for_emit = id.clone();
    tauri::async_runtime::spawn_blocking(move || db.delete_clipboard_entry(&id))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)?;
    let _ = app.emit(clipboard::CLIPBOARD_REMOVED_EVENT, id_for_emit);
    Ok(())
}

#[tauri::command]
pub async fn clear_clipboard_entries(app: AppHandle, db: State<'_, Db>) -> Result<(), String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.clear_clipboard_entries())
        .await
        .map_err(to_msg)?
        .map_err(to_msg)?;
    let _ = app.emit(clipboard::CLIPBOARD_CLEARED_EVENT, ());
    Ok(())
}

#[tauri::command]
pub async fn copy_clipboard_entry(
    app: AppHandle,
    db: State<'_, Db>,
    echo: State<'_, clipboard::ClipboardEcho>,
    id: String,
) -> Result<(), String> {
    let db = db.inner().clone();
    let echo = echo.inner().clone();
    let entry = tauri::async_runtime::spawn_blocking(move || -> Result<ClipboardEntry, String> {
        let entry = db
            .get_clipboard_entry(&id)
            .map_err(to_msg)?
            .ok_or_else(|| format!("剪贴板条目不存在：{id}"))?;
        clipboard::write_entry_to_system_clipboard(&entry, &echo)?;
        // 复制即"使用一次"：刷新 last_used_at 让卡片重排到头部（不动 updated_at，不误标已修改）。
        db.touch_clipboard_entry(&entry.id).map_err(to_msg)
    })
    .await
    .map_err(to_msg)??;
    let _ = app.emit(clipboard::CLIPBOARD_UPDATED_EVENT, entry);
    Ok(())
}

#[tauri::command]
pub async fn paste_clipboard_entry(
    app: AppHandle,
    db: State<'_, Db>,
    echo: State<'_, clipboard::ClipboardEcho>,
    id: String,
) -> Result<(), String> {
    let db = db.inner().clone();
    let echo = echo.inner().clone();
    let entry = tauri::async_runtime::spawn_blocking(move || -> Result<ClipboardEntry, String> {
        let entry = db
            .get_clipboard_entry(&id)
            .map_err(to_msg)?
            .ok_or_else(|| format!("剪贴板条目不存在：{id}"))?;
        clipboard::paste_entry_to_active_cursor(&entry, &echo)?;
        // 粘贴即"使用一次"：刷新 last_used_at 让卡片重排到头部（不动 updated_at）。
        db.touch_clipboard_entry(&entry.id).map_err(to_msg)
    })
    .await
    .map_err(to_msg)??;
    let _ = app.emit(clipboard::CLIPBOARD_UPDATED_EVENT, entry);
    Ok(())
}

#[tauri::command]
pub async fn update_clipboard_entry(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    content: String,
    html_content: Option<String>,
) -> Result<ClipboardEntry, String> {
    let db = db.inner().clone();
    let entry = tauri::async_runtime::spawn_blocking(move || {
        db.update_clipboard_entry_content(&id, &content, html_content.as_deref())
    })
    .await
    .map_err(to_msg)?
    .map_err(to_msg)?;
    let _ = app.emit(clipboard::CLIPBOARD_UPDATED_EVENT, entry.clone());
    Ok(entry)
}

#[tauri::command]
pub async fn add_image_clipboard_entry(
    app: AppHandle,
    db: State<'_, Db>,
    data_url: String,
) -> Result<ClipboardEntry, String> {
    let entry = clipboard::image_entry_from_data_url(data_url)
        .ok_or_else(|| "无效的图片数据".to_string())?;
    let db = db.inner().clone();
    let saved = tauri::async_runtime::spawn_blocking(move || db.upsert_clipboard_entry(entry))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)?;
    let _ = app.emit(clipboard::CLIPBOARD_UPDATED_EVENT, saved.clone());
    Ok(saved)
}

#[tauri::command]
pub async fn copy_edited_image_to_clipboard(data_url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        clipboard::write_image_data_url_to_system_clipboard(&data_url)
    })
    .await
    .map_err(to_msg)?
}

#[tauri::command]
pub async fn pin_clipboard_entry(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
) -> Result<ClipboardEntry, String> {
    let db = db.inner().clone();
    let entry = tauri::async_runtime::spawn_blocking(move || db.pin_clipboard_entry(&id))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)?;
    let _ = app.emit(clipboard::CLIPBOARD_UPDATED_EVENT, entry.clone());
    Ok(entry)
}

#[tauri::command]
pub async fn unpin_clipboard_entry(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
) -> Result<ClipboardEntry, String> {
    let db = db.inner().clone();
    let entry = tauri::async_runtime::spawn_blocking(move || db.unpin_clipboard_entry(&id))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)?;
    let _ = app.emit(clipboard::CLIPBOARD_UPDATED_EVENT, entry.clone());
    Ok(entry)
}

#[tauri::command]
pub async fn count_clipboard_entries(
    db: State<'_, Db>,
    content_type: Option<String>,
    query: Option<String>,
) -> Result<i64, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.count_clipboard_entries(content_type, query))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

// ----- 窗口管理 commands（Plan Task 3 Step 2 暴露给前端） ---------------

#[tauri::command]
pub async fn open_sticky_note_window(app: AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || window_manager::open_sticky_note(&app, &id))
        .await
        .map_err(|e| format!("spawn_blocking failed: {e}"))?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn close_sticky_note_window(app: AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || window_manager::close_sticky_note(&app, &id))
        .await
        .map_err(|e| format!("spawn_blocking failed: {e}"))?
        .map_err(to_msg)
}

#[tauri::command]
pub fn open_canvas_window(app: AppHandle) -> Result<(), String> {
    window_manager::open_canvas(&app).map_err(to_msg)
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    window_manager::open_settings(&app).map_err(to_msg)
}

/// `fresh=true`：笔记列表页"新建速记"按钮调用，强制空白；
/// `fresh=false`（默认）：全局快捷键调用，由前端继续 latest_draft；
/// `note_id`：指定 hydrate 哪份草稿（点击列表卡片的编辑入口时使用）。
#[tauri::command]
pub fn open_quicknote_window(
    app: AppHandle,
    fresh: Option<bool>,
    note_id: Option<String>,
    initial_content: Option<String>,
    clipboard_context: Option<bool>,
    clipboard_entry_id: Option<String>,
) -> Result<(), String> {
    quicknote::show(&app, fresh.unwrap_or(false), note_id, initial_content, clipboard_context, clipboard_entry_id);
    Ok(())
}

#[tauri::command]
pub fn open_zen_window(app: AppHandle, id: Option<String>) -> Result<(), String> {
    window_manager::open_zen(&app, id.as_deref()).map_err(to_msg)
}

#[tauri::command]
pub async fn open_path_in_file_manager(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_path_in_file_manager_sync(&path))
        .await
        .map_err(to_msg)?
}

fn open_path_in_file_manager_sync(path: &str) -> Result<(), String> {
    let target = PathBuf::from(path);
    if target.as_os_str().is_empty() {
        return Err("路径不能为空".to_string());
    }
    if !target.exists() {
        return Err(format!("路径不存在：{}", target.to_string_lossy()));
    }

    let status = platform_open_command(&target).status().map_err(to_msg)?;
    if status.success() {
        return Ok(());
    }

    Err(format!(
        "打开路径失败：{}",
        target.to_string_lossy()
    ))
}

fn platform_open_command(path: &PathBuf) -> Command {
    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        command.arg(path);
        command
    }

    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("explorer");
        command.arg(path);
        command
    }

    #[cfg(target_os = "linux")]
    {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    }
}

#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        {
            Command::new("open").arg(&url).status()
        }
        #[cfg(target_os = "windows")]
        {
            Command::new("cmd").args(["/C", "start", &url]).status()
        }
        #[cfg(target_os = "linux")]
        {
            Command::new("xdg-open").arg(&url).status()
        }
    })
    .await
    .map_err(to_msg)?
    .map_err(to_msg)?;
    Ok(())
}

// ----- 快捷键 ----------------------------------------------------------

/// 设置面板写完 mainWindowShortcut / quicknoteShortcut 后调用，让 Rust 端
/// unregister_all + 用新值重新 register。同步 command：只做一次 db 查询和
/// OS register，无需 spawn_blocking。
#[tauri::command]
pub fn reload_shortcuts(app: AppHandle, db: State<'_, Db>) -> Result<(), String> {
    shortcut::register_from_settings(&app, db.inner()).map_err(to_msg)
}

// ----- 导出 commands（Plan Task 8.4） ----------------------------------

/// 把指定笔记导出为 Markdown 文件到 `<data_dir>/exports/<title>-<short_id>.md`。
/// 返回完整路径字符串，UI 拿到后可展示给用户并提供"打开目录"等操作。
/// 失败时不动数据库，仅返回错误字符串给前端。
#[tauri::command]
pub async fn export_note_markdown(db: State<'_, Db>, id: String) -> Result<String, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let note = db
            .get_note(&id)
            .map_err(to_msg)?
            .ok_or_else(|| format!("笔记不存在：{id}"))?;
        let (data_dir, _db_path, _backup) = db.paths();
        let exports_dir = data_dir.join("exports");
        // 含本地图片时打包成文件夹（.md + assets/），否则保持单文件导出。
        if export::has_local_images(&note.content, &data_dir) {
            let bundle_dir = exports_dir.join(export::default_filename(&note));
            let md_path =
                export::export_markdown_bundle(&note, &data_dir, &bundle_dir).map_err(to_msg)?;
            Ok(md_path.to_string_lossy().into_owned())
        } else {
            let path = export::build_output_path(&exports_dir, &note, "md");
            export::export_markdown(&note, &path).map_err(to_msg)?;
            Ok(path.to_string_lossy().into_owned())
        }
    })
    .await
    .map_err(to_msg)?
}

/// 把指定笔记导出为 HTML 文件到 `<data_dir>/exports/<title>-<short_id>.html`。
/// 返回完整路径字符串，失败时不动数据库。
#[tauri::command]
pub async fn export_note_html(db: State<'_, Db>, id: String) -> Result<String, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let note = db
            .get_note(&id)
            .map_err(to_msg)?
            .ok_or_else(|| format!("笔记不存在：{id}"))?;
        let (data_dir, _db_path, _backup) = db.paths();
        let exports_dir = data_dir.join("exports");
        let path = export::build_output_path(&exports_dir, &note, "html");
        export::export_html(&note, &data_dir, &path).map_err(to_msg)?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(to_msg)?
}

/// MVP 当前没有跨平台 PDF 适配器；总是返回明确失败原因，让 UI 提示
/// 用户使用浏览器打印或外部工具。
#[tauri::command]
pub async fn export_note_pdf(db: State<'_, Db>, id: String) -> Result<String, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let note = db
            .get_note(&id)
            .map_err(to_msg)?
            .ok_or_else(|| format!("笔记不存在：{id}"))?;
        let (data_dir, _db_path, _backup) = db.paths();
        let exports_dir = data_dir.join("exports");
        let path = export::build_output_path(&exports_dir, &note, "pdf");
        export::export_pdf(&note, &path).map_err(to_msg)?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(to_msg)?
}

// ----- 存储路径（SettingsView 展示） -----------------------------------

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataPaths {
    pub data_dir: String,
    pub db_path: String,
    pub backup_dir: String,
}

#[tauri::command]
pub fn get_data_paths(db: State<'_, Db>) -> DataPaths {
    let (data_dir, db_path, backup_dir) = db.paths();
    DataPaths {
        data_dir: data_dir.to_string_lossy().into_owned(),
        db_path: db_path.to_string_lossy().into_owned(),
        backup_dir: backup_dir.to_string_lossy().into_owned(),
    }
}

// ----- 待办（Todo） -----------------------------------------------------
//
// 写操作均在 spawn_blocking 内完成 DB 调用，回到主 future 后通过
// `app.emit` 广播 `steno:todo-changed`。`emit` 失败不阻塞业务返回。

#[tauri::command]
pub async fn list_todos(db: State<'_, Db>) -> Result<Vec<todo::Todo>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.list_todos())
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn get_today_todos(
    db: State<'_, Db>,
    input: Option<TodayTodosRequest>,
) -> Result<Vec<todo::Todo>, String> {
    let db = db.inner().clone();
    let include_completed = input.map(|i| i.include_completed).unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || db.list_today_todos(include_completed))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn create_todo(
    app: AppHandle,
    db: State<'_, Db>,
    input: CreateTodoRequest,
) -> Result<todo::Todo, String> {
    let db = db.inner().clone();
    let saved = tauri::async_runtime::spawn_blocking(move || db.create_todo(input))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)?;
    let _ = app.emit(
        todo::TODO_CHANGED_EVENT,
        TodoChangePayload {
            kind: TodoChangeKind::Created,
            id: saved.id.clone(),
            todo: Some(saved.clone()),
        },
    );
    Ok(saved)
}

#[tauri::command]
pub async fn update_todo(
    app: AppHandle,
    db: State<'_, Db>,
    input: UpdateTodoRequest,
) -> Result<todo::Todo, String> {
    let db = db.inner().clone();
    let saved = tauri::async_runtime::spawn_blocking(move || db.update_todo(input))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)?;
    // status 切到 done 时使用 Completed kind，便于前端按需播放完成动效。
    let kind = if saved.status == todo::TodoStatus::Done {
        TodoChangeKind::Completed
    } else {
        TodoChangeKind::Updated
    };
    let _ = app.emit(
        todo::TODO_CHANGED_EVENT,
        TodoChangePayload {
            kind,
            id: saved.id.clone(),
            todo: Some(saved.clone()),
        },
    );
    Ok(saved)
}

#[tauri::command]
pub async fn complete_todo(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
) -> Result<todo::Todo, String> {
    let db = db.inner().clone();
    let saved = tauri::async_runtime::spawn_blocking(move || db.complete_todo(&id))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)?;
    let _ = app.emit(
        todo::TODO_CHANGED_EVENT,
        TodoChangePayload {
            kind: TodoChangeKind::Completed,
            id: saved.id.clone(),
            todo: Some(saved.clone()),
        },
    );
    Ok(saved)
}

#[tauri::command]
pub async fn delete_todo(app: AppHandle, db: State<'_, Db>, id: String) -> Result<(), String> {
    let db = db.inner().clone();
    let id_for_emit = id.clone();
    tauri::async_runtime::spawn_blocking(move || db.delete_todo(&id))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)?;
    let _ = app.emit(
        todo::TODO_CHANGED_EVENT,
        TodoChangePayload {
            kind: TodoChangeKind::Deleted,
            id: id_for_emit,
            todo: None,
        },
    );
    Ok(())
}

#[tauri::command]
pub async fn get_todo_activity(
    db: State<'_, Db>,
    input: TodoStatsRange,
) -> Result<Vec<TodoActivityPoint>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.get_activity(&input.start, &input.end))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn get_todo_daily_trend(
    db: State<'_, Db>,
    input: TodoDailyTrendRequest,
) -> Result<Vec<TodoTrendPoint>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.get_daily_trend(
            &input.start,
            &input.end,
            input.status_filter.as_deref(),
        )
    })
    .await
    .map_err(to_msg)?
    .map_err(to_msg)
}

#[tauri::command]
pub async fn reset_todo_stats(app: AppHandle, db: State<'_, Db>) -> Result<usize, String> {
    let db = db.inner().clone();
    let affected = tauri::async_runtime::spawn_blocking(move || db.reset_stats())
        .await
        .map_err(to_msg)?
        .map_err(to_msg)?;
    let _ = app.emit(
        todo::TODO_CHANGED_EVENT,
        TodoChangePayload {
            kind: TodoChangeKind::Reset,
            id: String::new(),
            todo: None,
        },
    );
    Ok(affected)
}

// ----- 待办浮窗窗口控制 ------------------------------------------------

/// 显示待办浮窗。`position` 可选：传入 "bottom-right" / "cursor" / "last"，
/// 缺省时从 settings 读 `todoQuickPanelPosition`。
#[tauri::command]
pub fn show_todo_panel(
    app: AppHandle,
    db: State<'_, Db>,
    position: Option<String>,
) -> Result<(), String> {
    let strategy = match position {
        Some(value) => window_manager::TodoPanelPosition::parse(&value),
        None => db
            .get_setting("todoQuickPanelPosition")
            .map_err(to_msg)?
            .as_deref()
            .map(window_manager::TodoPanelPosition::parse)
            .unwrap_or(window_manager::TodoPanelPosition::BottomRight),
    };
    window_manager::show_todo_panel(&app, db.inner(), strategy).map_err(to_msg)
}

#[tauri::command]
pub fn hide_todo_panel(app: AppHandle) -> Result<(), String> {
    window_manager::hide_todo_panel(&app).map_err(to_msg)
}

#[tauri::command]
pub fn toggle_todo_panel(app: AppHandle, db: State<'_, Db>) -> Result<(), String> {
    window_manager::toggle_todo_panel(&app, db.inner()).map_err(to_msg)
}

// ----- 开机自启动 ------------------------------------------------------

const AUTOSTART_APP_NAME: &str = "Steno";

#[tauri::command]
pub fn set_launch_at_startup(enabled: bool) -> Result<(), String> {
    set_launch_at_startup_impl(enabled)
}

#[tauri::command]
pub fn is_launch_at_startup_enabled() -> Result<bool, String> {
    is_launch_at_startup_enabled_impl()
}

#[cfg(target_os = "windows")]
fn set_launch_at_startup_impl(enabled: bool) -> Result<(), String> {
    const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    if enabled {
        let exe = std::env::current_exe().map_err(to_msg)?;
        let value = format!("\"{}\"", exe.display());
        let status = Command::new("reg")
            .args([
                "add",
                RUN_KEY,
                "/v",
                AUTOSTART_APP_NAME,
                "/t",
                "REG_SZ",
                "/d",
                &value,
                "/f",
            ])
            .status()
            .map_err(to_msg)?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("写入开机自启动注册表失败：{status}"))
        }
    } else {
        let status = Command::new("reg")
            .args(["delete", RUN_KEY, "/v", AUTOSTART_APP_NAME, "/f"])
            .status()
            .map_err(to_msg)?;
        if status.success() || !is_launch_at_startup_enabled_impl()? {
            Ok(())
        } else {
            Err(format!("删除开机自启动注册表失败：{status}"))
        }
    }
}

#[cfg(target_os = "windows")]
fn is_launch_at_startup_enabled_impl() -> Result<bool, String> {
    const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    let status = Command::new("reg")
        .args(["query", RUN_KEY, "/v", AUTOSTART_APP_NAME])
        .status()
        .map_err(to_msg)?;
    Ok(status.success())
}

#[cfg(not(target_os = "windows"))]
fn set_launch_at_startup_impl(_enabled: bool) -> Result<(), String> {
    Err("开机自启动当前仅支持 Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
fn is_launch_at_startup_enabled_impl() -> Result<bool, String> {
    Ok(false)
}
