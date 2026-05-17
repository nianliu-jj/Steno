// 共享数据模型（DTO）：Rust 端用，序列化按 camelCase 与前端 TypeScript 对齐。
// Plan Task 2 Step 1。
//
// 注意 Note 的 11 个字段对应 SQL 表的 11 列（plan/spec 一致）；草稿单条记录
// （quicknote-draft）仍走这套模型，title/html_content 留空串、tags 为空数组、
// is_pinned=false、其它窗口/画布字段为 None。
//
// DTO 字段会被 serde 反序列化"使用"，但编译器看不到，所以模块整体允许
// dead_code，避免 Commit A→B 之间的过渡噪声。

#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EntryKind {
    Workspace,
    Folder,
    Group,
    Text,
    Document,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    pub id: String,
    pub kind: EntryKind,
    pub title: String,
    pub preview_text: String,
    pub tags: Vec<String>,
    pub workspace_id: Option<String>,
    pub parent_id: Option<String>,
    pub group_id: Option<String>,
    pub file_path: Option<String>,
    pub word_count: i64,
    pub byte_size: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 置顶便签窗口配置（位置、尺寸、外观）。存 SQLite 时序列化为 JSON 写入
/// `notes.pinned_window_config` 列。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PinnedWindowConfig {
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: f64,
    pub height: f64,
    pub opacity: f64,
    pub color: String,
    pub font_size: u16,
}

/// 无限画布上某张卡片的位置 + 视图缩放。存 SQLite 时序列化为 JSON 写入
/// `notes.canvas_position` 列。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CanvasPosition {
    pub x: f64,
    pub y: f64,
    pub scale: Option<f64>,
}

/// 一条笔记的完整视图模型（与前端 Note 接口字段对齐）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub html_content: String,
    pub tags: Vec<String>,
    pub is_pinned: bool,
    pub pinned_window_config: Option<PinnedWindowConfig>,
    pub canvas_position: Option<CanvasPosition>,
    /// RFC3339 字符串。chrono::DateTime<Utc>.to_rfc3339()。
    pub created_at: String,
    pub updated_at: String,
    pub word_count: i64,
}

/// save_note 命令的请求 DTO。
/// - id = None：新建笔记，由 db 层生成 UUID v4。
/// - id = Some(s)：更新（包括草稿单条记录 id="quicknote-draft"）。
/// - 空 title + 空 content + 空 tags：db 层返回 Ok(None)，不写库。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteRequest {
    pub id: Option<String>,
    pub title: Option<String>,
    pub content: String,
    pub tags: Vec<String>,
    pub is_pinned: Option<bool>,
    pub pinned_window_config: Option<PinnedWindowConfig>,
    pub canvas_position: Option<CanvasPosition>,
}

/// search_notes 命令的请求 DTO。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchNotesRequest {
    pub query: String,
    pub tags: Vec<String>,
    pub pinned_only: bool,
    pub limit: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTextEntryRequest {
    pub id: Option<String>,
    pub title: Option<String>,
    pub content: String,
    pub tags: Vec<String>,
    pub group_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertTextToDocumentRequest {
    pub id: String,
    pub workspace_id: String,
    pub folder_entry_id: Option<String>,
}
