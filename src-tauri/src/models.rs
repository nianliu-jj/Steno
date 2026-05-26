//! 共享数据模型（DTO）— Rust 与前端 IPC 的序列化边界。
//!
//! 所有结构体使用 `#[serde(rename_all = "camelCase")]` 与前端 TypeScript
//! 对齐（`src/types/steno.ts`）。Rust 是单一真实来源；修改字段时先改这里
//! 再同步前端类型。
//!
//! `Note` 的字段对应 SQLite `notes` 表的列。草稿记录也走同一套模型，
//! 通过 `is_draft` 字段区分。
//!
//! 模块级 `#![allow(dead_code)]` 是因为部分字段仅通过 serde 反序列化被
//! "使用"，编译器无法追踪到。

#![allow(dead_code)]

use serde::{Deserialize, Serialize};

/// 主列表条目的种类标签。
///
/// 工作区视图、文件夹、分组、纯文本草稿、Markdown 文档共用一张
/// `library_entries` 表，靠 `kind` 区分；前端按 camelCase 序列化。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EntryKind {
    Workspace,
    Folder,
    Group,
    Text,
    Document,
}

/// 主列表条目（卡片视图）的 DTO。
///
/// 对应 SQLite `library_entries` 表，由 `kind` 决定字段语义：
/// - `Workspace` / `Folder` / `Group` 是容器；`Text` / `Document` 是内容条目
/// - `file_path` 仅 `Document` 有，指向工作区磁盘上的真实 .md 文件
/// - `word_count` / `byte_size` 仅内容条目有意义
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

/// 工作区元数据 — 一条 `library_entries` 中 `kind = workspace` 的行。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 主列表筛选上下文 — 前端通过它指定"看哪个工作区/分组/文件夹"。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MainListContext {
    pub workspace_id: Option<String>,
    pub folder_entry_id: Option<String>,
    pub group_entry_id: Option<String>,
    pub selected_entry_id: Option<String>,
}

/// 创建工作区的请求体。`name` 为空时从 `root_path` 末段派生。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceRequest {
    pub name: Option<String>,
    pub root_path: String,
}

/// 编辑器视图加载条目时使用的 DTO（携带正文 + 关键标记）。
///
/// 与 `LibraryEntry` 的差别：`EditorEntry` 含 `content`，用于真实编辑场景。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorEntry {
    pub id: String,
    pub kind: EntryKind,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub workspace_id: Option<String>,
    pub parent_id: Option<String>,
    pub group_id: Option<String>,
    pub file_path: Option<String>,
}

/// 置顶便签窗口配置（位置、尺寸、外观）。
///
/// 存 SQLite 时序列化为 JSON 写入 `notes.pinned_window_config` 列。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PinnedWindowConfig {
    /// 窗口左上角 X 坐标（逻辑像素）。`None` 表示由 OS 决定。
    pub x: Option<f64>,
    /// 窗口左上角 Y 坐标（逻辑像素）。
    pub y: Option<f64>,
    /// 窗口宽度（逻辑像素）。
    pub width: f64,
    /// 窗口高度（逻辑像素）。
    pub height: f64,
    /// 窗口不透明度 [0.0, 1.0]。
    pub opacity: f64,
    /// 窗口背景色（CSS 颜色字符串）。
    pub color: String,
    /// 编辑器字号（px）。
    pub font_size: u16,
}

/// 无限画布上卡片的世界坐标位置。
///
/// 存 SQLite 时序列化为 JSON 写入 `notes.canvas_position` 列。
/// 坐标转换公式：`screen = world * zoom + pan`。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CanvasPosition {
    /// 世界坐标 X。
    pub x: f64,
    /// 世界坐标 Y。
    pub y: f64,
    /// 上次保存时的缩放比例（仅用于恢复视口参考）。
    pub scale: Option<f64>,
}

/// 一条笔记的完整视图模型 — 与前端 [`Note`](types/steno.ts) 接口字段对齐。
///
/// 对应 SQLite `notes` 表中的一行。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    /// UUID v4 字符串。
    pub id: String,
    /// 标题；保存时为空则从内容首行派生。
    pub title: String,
    /// Markdown 原文。
    pub content: String,
    /// 后端渲染的 HTML（`pulldown-cmark`）。
    pub html_content: String,
    /// 标签列表（不含 `#` 前缀）。
    pub tags: Vec<String>,
    /// 是否置顶（拥有独立 sticky 窗口）。
    pub is_pinned: bool,
    /// 置顶窗口配置；仅 `is_pinned` 为 true 时有效。
    pub pinned_window_config: Option<PinnedWindowConfig>,
    /// 画布卡片位置。
    pub canvas_position: Option<CanvasPosition>,
    /// 创建时间，RFC3339 字符串（`chrono::DateTime<Utc>.to_rfc3339()`）。
    pub created_at: String,
    /// 最后更新时间，RFC3339 字符串。
    pub updated_at: String,
    /// 字数（`word_count` 计算，空白分割计数）。
    pub word_count: i64,
    /// 未保存草稿标记。
    ///
    /// 速记浮窗未点保存就关闭时持久化为 `true`；
    /// 列表查询把 `is_draft=true` 的笔记排在最前 + "未保存"标签；
    /// 置顶笔记此字段强制清零。
    #[serde(default)]
    pub is_draft: bool,
}

/// `save_note` 命令的请求体。
///
/// - `id = None`：新建笔记，由 `db` 层生成 UUID v4
/// - `id = Some(s)`：更新已有笔记
/// - 空 title + 空 content + 空 tags → `db` 层返回 `Ok(None)`，不写库
/// - `is_draft = Some(true)` 且 `is_pinned = true` → 后端强制清零 `is_draft`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteRequest {
    /// 笔记 UUID。新建时省略。
    pub id: Option<String>,
    /// 标题。空时后端从内容首行派生。
    pub title: Option<String>,
    /// Markdown 原文（必填）。
    pub content: String,
    /// 用户显式指定的标签（不含 `#` 前缀）。
    pub tags: Vec<String>,
    /// 是否置顶。
    pub is_pinned: Option<bool>,
    /// 置顶窗口配置。
    pub pinned_window_config: Option<PinnedWindowConfig>,
    /// 画布位置。
    pub canvas_position: Option<CanvasPosition>,
    /// 仅速记浮窗写入草稿时传 `true`。
    #[serde(default)]
    pub is_draft: Option<bool>,
}

/// `search_notes` 命令的请求体。
///
/// 搜索逻辑：`title LIKE %query% OR content LIKE %query%`，
/// 再在 Rust 侧按 `tags` 做内存过滤（交集语义）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchNotesRequest {
    /// 搜索关键词（匹配标题和内容）。
    pub query: String,
    /// 必须全部包含的标签（交集语义）。
    pub tags: Vec<String>,
    /// `true` 时仅搜索置顶笔记。
    pub pinned_only: bool,
    /// 返回结果数量上限。
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
pub struct SaveDocumentEntryRequest {
    pub id: Option<String>,
    pub title: Option<String>,
    pub content: String,
    pub tags: Vec<String>,
    pub workspace_id: String,
    pub folder_entry_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertTextToDocumentRequest {
    pub id: String,
    pub workspace_id: String,
    pub folder_entry_id: Option<String>,
}
