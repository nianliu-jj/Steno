//! SQLite 数据访问层。
//!
//! ## 设计
//! `Db` 由 `Arc<Mutex<Connection>>` 包裹，实现 `Clone` + `'static`，
//! 可安全地在 [`tauri::async_runtime::spawn_blocking`] 中使用。
//!
//! ## 功能
//! - 数据库初始化与路径管理（`~/.steno/data.db`）
//! - Schema 迁移（v1 → v2：添加 `is_draft` 列）
//! - 笔记 CRUD（save / get / list / search / delete / pin / draft promote）
//! - 设置 key-value 存取
//! - 内容派生（`derive_title` / `extract_tags` / `word_count` / `render_markdown`）
//!
//! ## 备份与同步
//! 预留独立模块 [`backup`] / [`sync`]。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use rusqlite::{Connection, OptionalExtension};

use crate::clipboard::{ClipboardEntry, NewClipboardEntry};
use crate::models::{
    ConvertTextToDocumentRequest, EditorEntry, EntryKind, LibraryEntry, MainListContext, Note,
    SaveDocumentEntryRequest, SaveNoteRequest, SaveTextEntryRequest, SearchNotesRequest, Workspace,
};
use crate::todo::{CreateTodoRequest, Todo, TodoStatus, UpdateTodoRequest};
use crate::workspace_fs::{self, WorkspaceFsEntryKind};

const INBOX_GROUP_ID: &str = "group-inbox";

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("home directory could not be resolved (dirs::home_dir() returned None)")]
    NoHomeDir,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("database mutex poisoned")]
    Poisoned,
    #[error("serde_json error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("note not found: {0}")]
    NotFound(String),
    #[error("{0}")]
    Validation(String),
}

pub struct Db {
    conn: Arc<Mutex<Connection>>,
    db_path: PathBuf,
}

impl Clone for Db {
    fn clone(&self) -> Self {
        Self {
            conn: Arc::clone(&self.conn),
            db_path: self.db_path.clone(),
        }
    }
}

impl Db {
    /// 内存数据库 + 完整迁移的测试 helper，供跨模块单测用（如 reminder_scheduler）。
    /// 不走 ensure_default_settings / ensure_default_group，调用方按需触发。
    #[cfg(test)]
    pub fn open_in_memory_for_tests() -> Self {
        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        Self::migrate(&mut conn).expect("migrate");
        Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path: PathBuf::from(":memory:"),
        }
    }

    pub fn data_dir() -> Result<PathBuf, DbError> {
        let home = dirs::home_dir().ok_or(DbError::NoHomeDir)?;
        let dir = home.join(".steno");
        std::fs::create_dir_all(&dir)?;
        Ok(dir)
    }

    pub fn db_path_for(dir: &Path) -> PathBuf {
        dir.join("data.db")
    }

    pub fn init() -> Result<Self, DbError> {
        let dir = Self::data_dir()?;
        let db_path = Self::db_path_for(&dir);
        let mut conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Self::migrate(&mut conn)?;
        Self::ensure_default_settings(&conn)?;
        Self::ensure_default_group(&conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path,
        })
    }

    /// 备份/调试用：返回当前数据库文件路径。Commit 1 还没有调用方，
    /// 但 plan 9 验收阶段集成 BackupService 时会用到。
    #[allow(dead_code)]
    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    /// 备份目录：`<data_dir>/backup`。SettingsView 展示给用户用。
    pub fn backup_dir(&self) -> PathBuf {
        self.db_path
            .parent()
            .map(|p| p.join("backup"))
            .unwrap_or_else(|| PathBuf::from("backup"))
    }

    /// SettingsView "存储区域" 用：把数据目录、db 路径、备份目录一次性返回。
    pub fn paths(&self) -> (PathBuf, PathBuf, PathBuf) {
        let data_dir = self
            .db_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));
        (data_dir, self.db_path.clone(), self.backup_dir())
    }

    pub fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, DbError> {
        self.conn.lock().map_err(|_| DbError::Poisoned)
    }

    fn migrate(conn: &mut Connection) -> Result<(), DbError> {
        let version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version < 1 {
            let tx = conn.transaction()?;
            tx.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS notes (
                  id TEXT PRIMARY KEY,
                  title TEXT NOT NULL,
                  content TEXT NOT NULL,
                  html_content TEXT NOT NULL,
                  tags TEXT NOT NULL DEFAULT '[]',
                  is_pinned INTEGER NOT NULL DEFAULT 0,
                  pinned_window_config TEXT,
                  canvas_position TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  word_count INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS settings (
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
                CREATE INDEX IF NOT EXISTS idx_notes_is_pinned ON notes(is_pinned);
                ",
            )?;
            tx.pragma_update(None, "user_version", 1_i64)?;
            tx.commit()?;
        }
        if version < 2 {
            // v2：为"未保存草稿"语义引入 is_draft 列。
            // 速记浮窗未点保存就关闭时，内容仍持久化为 is_draft=1 的笔记，
            // 笔记列表会把它排在最前面并附"未保存"灰标签。
            let tx = conn.transaction()?;
            let already_has_column = Self::notes_has_is_draft_column(&tx)?;
            if !already_has_column {
                tx.execute(
                    "ALTER TABLE notes ADD COLUMN is_draft INTEGER NOT NULL DEFAULT 0",
                    [],
                )?;
            }
            tx.execute(
                "CREATE INDEX IF NOT EXISTS idx_notes_is_draft ON notes(is_draft)",
                [],
            )?;
            tx.pragma_update(None, "user_version", 2_i64)?;
            tx.commit()?;
        }
        if version < 3 {
            let tx = conn.transaction()?;
            tx.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS clipboard_history (
                  id TEXT PRIMARY KEY,
                  content_type TEXT NOT NULL,
                  content TEXT NOT NULL,
                  html_content TEXT,
                  preview TEXT NOT NULL,
                  content_hash TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  size_bytes INTEGER NOT NULL DEFAULT 0
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_clipboard_history_hash
                  ON clipboard_history(content_type, content_hash);
                CREATE INDEX IF NOT EXISTS idx_clipboard_history_updated_at
                  ON clipboard_history(updated_at);
                CREATE INDEX IF NOT EXISTS idx_clipboard_history_type
                  ON clipboard_history(content_type);
                ",
            )?;
            tx.pragma_update(None, "user_version", 3_i64)?;
            tx.commit()?;
        }
        if version < 4 {
            // v4：工作区 + 统一文本/文档条目表。
            // workspaces 存用户登记的"根目录"；library_entries 把文件夹、分组、
            // 文本草稿、Markdown 文档统一放在一张表里，靠 kind 列区分。
            let tx = conn.transaction()?;
            tx.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS workspaces (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  root_path TEXT NOT NULL UNIQUE,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS library_entries (
                  id TEXT PRIMARY KEY,
                  kind TEXT NOT NULL,
                  title TEXT NOT NULL,
                  preview_text TEXT NOT NULL DEFAULT '',
                  body_markdown TEXT,
                  tags TEXT NOT NULL DEFAULT '[]',
                  workspace_id TEXT,
                  parent_id TEXT,
                  group_id TEXT,
                  file_path TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  word_count INTEGER NOT NULL DEFAULT 0,
                  byte_size INTEGER NOT NULL DEFAULT 0
                );

                CREATE INDEX IF NOT EXISTS idx_library_entries_kind ON library_entries(kind);
                CREATE INDEX IF NOT EXISTS idx_library_entries_workspace_parent
                  ON library_entries(workspace_id, parent_id);
                CREATE INDEX IF NOT EXISTS idx_library_entries_group_parent
                  ON library_entries(group_id, parent_id);
                ",
            )?;
            tx.pragma_update(None, "user_version", 4_i64)?;
            tx.commit()?;
        }
        if version < 5 {
            // v5：待办事项 todos 表，与 ZhiDo 字段对齐。
            // id 用 TEXT/UUID（与既有 notes、clipboard_history 一致）；status 限定为
            // `todo` / `doing` / `paused` / `done` 四态；is_deleted 逻辑删除保留撤销空间。
            let tx = conn.transaction()?;
            tx.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS todos (
                  id             TEXT PRIMARY KEY,
                  content        TEXT NOT NULL,
                  status         TEXT NOT NULL DEFAULT 'todo',
                  created_at     TEXT NOT NULL,
                  updated_at     TEXT NOT NULL,
                  completed_at   TEXT,
                  due_date       TEXT,
                  reminder_time  TEXT,
                  reminder_fired INTEGER NOT NULL DEFAULT 0,
                  started_at     TEXT,
                  list_id        TEXT NOT NULL DEFAULT 'default',
                  is_deleted     INTEGER NOT NULL DEFAULT 0
                );

                CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
                CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
                CREATE INDEX IF NOT EXISTS idx_todos_is_deleted ON todos(is_deleted);
                ",
            )?;
            tx.pragma_update(None, "user_version", 5_i64)?;
            tx.commit()?;
        }
        if version < 6 {
            // v6：todos 表新增 reminder_fired / started_at 两列（提醒触发标记与首次进入 doing 时间戳），
            // 并补 reminder_time / completed_at 两个统计/调度用索引。已升过 v5 的旧库通过 ALTER 补齐。
            let tx = conn.transaction()?;
            if !Self::todos_has_column(&tx, "reminder_fired")? {
                tx.execute(
                    "ALTER TABLE todos ADD COLUMN reminder_fired INTEGER NOT NULL DEFAULT 0",
                    [],
                )?;
            }
            if !Self::todos_has_column(&tx, "started_at")? {
                tx.execute("ALTER TABLE todos ADD COLUMN started_at TEXT", [])?;
            }
            tx.execute_batch(
                "
                CREATE INDEX IF NOT EXISTS idx_todos_reminder_time ON todos(reminder_time);
                CREATE INDEX IF NOT EXISTS idx_todos_completed_at  ON todos(completed_at);
                ",
            )?;
            tx.pragma_update(None, "user_version", 6_i64)?;
            tx.commit()?;
        }
        // 幂等自检：dev 库偶尔会出现 user_version 已升到 2 但实际 ALTER 没成功
        // 的不一致状态（多进程访问、上次 migration 异常等），每次启动再确认一次。
        Self::ensure_is_draft_column(conn)?;
        Ok(())
    }

    fn notes_has_is_draft_column(conn: &Connection) -> Result<bool, DbError> {
        let mut stmt = conn.prepare("PRAGMA table_info(notes)")?;
        let exists = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(Result::ok)
            .any(|name| name == "is_draft");
        Ok(exists)
    }

    /// 检查 `todos` 表是否已存在指定列。v6 ALTER 之前用于幂等保护。
    fn todos_has_column(conn: &Connection, column: &str) -> Result<bool, DbError> {
        let mut stmt = conn.prepare("PRAGMA table_info(todos)")?;
        let exists = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(Result::ok)
            .any(|name| name == column);
        Ok(exists)
    }

    fn ensure_is_draft_column(conn: &Connection) -> Result<(), DbError> {
        if Self::notes_has_is_draft_column(conn)? {
            return Ok(());
        }
        conn.execute(
            "ALTER TABLE notes ADD COLUMN is_draft INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_notes_is_draft ON notes(is_draft)",
            [],
        )?;
        Ok(())
    }

    /// 首次启动写入默认 settings。已存在的 key 不覆盖（INSERT OR IGNORE）。
    /// 命名与本仓库决策对齐：
    /// - mainWindowShortcut → 切换主窗口（PR1，默认 Ctrl+Shift+N）
    /// - quicknoteShortcut  → 切换浮窗（PR2，默认 Ctrl+Shift+M）
    /// - searchShortcut     → 全局搜索（plan Task 8，默认 Ctrl+Shift+F）
    /// - todoQuickPanelShortcut / Enabled / Position → 待办浮窗（add-todo-quick-panel）
    fn ensure_default_settings(conn: &Connection) -> Result<(), DbError> {
        let defaults: &[(&str, &str)] = &[
            ("mainWindowShortcut", "Ctrl+Shift+N"),
            ("quicknoteShortcut", "Ctrl+Shift+M"),
            ("clipboardShortcut", "Ctrl+Shift+V"),
            ("searchShortcut", "Ctrl+Shift+F"),
            ("floatingWidth", "400"),
            ("floatingHeight", "300"),
            ("blurCloseDelayMs", "800"),
            ("themeMode", "system"),
            ("editorMode", "split"),
            ("backupEveryChanges", "10"),
            ("mainSidebarWidth", "220"),
            ("mainSidebarCollapsed", "false"),
            ("noteEditorOutlineWidth", "280"),
            ("noteEditorOutlineOpen", "false"),
            ("zenOutlineWidth", "300"),
            ("zenOutlineOpen", "true"),
            ("todoQuickPanelEnabled", "true"),
            ("todoQuickPanelShortcut", "Ctrl+Shift+T"),
            ("todoQuickPanelPosition", "bottom-right"),
        ];
        let now = chrono::Utc::now().to_rfc3339();
        for (k, v) in defaults {
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
                rusqlite::params![k, v, &now],
            )?;
        }
        Ok(())
    }

    fn ensure_default_group(conn: &Connection) -> Result<(), DbError> {
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR IGNORE INTO library_entries
             (id, kind, title, preview_text, body_markdown, tags, workspace_id, parent_id, group_id, file_path, created_at, updated_at, word_count, byte_size)
             VALUES (?1, 'group', '收件箱', '', NULL, '[]', NULL, NULL, NULL, NULL, ?2, ?2, 0, 0)",
            rusqlite::params![INBOX_GROUP_ID, &now],
        )?;
        Ok(())
    }

    // ----- 笔记 CRUD ---------------------------------------------------

    pub fn save_note(&self, input: SaveNoteRequest) -> Result<Option<Note>, DbError> {
        let trimmed_title = input.title.as_deref().unwrap_or("").trim().to_string();
        let trimmed_content = input.content.trim();
        let all_tags_empty = input.tags.iter().all(|t| t.trim().is_empty());
        if trimmed_title.is_empty() && trimmed_content.is_empty() && all_tags_empty {
            return Ok(None);
        }

        let now = chrono::Utc::now().to_rfc3339();
        let id = input
            .id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let title = if trimmed_title.is_empty() {
            derive_title(&input.content)
        } else {
            trimmed_title
        };
        let html_content = render_markdown(&input.content);
        let tags = extract_tags(&input.content, &input.tags);
        let tags_json = serde_json::to_string(&tags)?;
        let is_pinned = input.is_pinned.unwrap_or(false);
        let is_pinned_int = i64::from(is_pinned);
        // 置顶笔记不允许同时是未保存草稿——pin = 用户已经表达"留下来"的意图。
        let is_draft_int = if is_pinned {
            0
        } else {
            i64::from(input.is_draft.unwrap_or(false))
        };
        let pinned_cfg_json = match &input.pinned_window_config {
            Some(c) => Some(serde_json::to_string(c)?),
            None => None,
        };
        let canvas_pos_json = match &input.canvas_position {
            Some(p) => Some(serde_json::to_string(p)?),
            None => None,
        };
        let wc = word_count(&input.content);

        let conn = self.lock()?;
        let existing_created_at: Option<String> = conn
            .query_row(
                "SELECT created_at FROM notes WHERE id = ?1",
                rusqlite::params![&id],
                |row| row.get(0),
            )
            .optional()?;
        let created_at = existing_created_at.unwrap_or_else(|| now.clone());

        conn.execute(
            "INSERT OR REPLACE INTO notes
             (id, title, content, html_content, tags, is_pinned, pinned_window_config, canvas_position, created_at, updated_at, word_count, is_draft)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                &id,
                &title,
                &input.content,
                &html_content,
                &tags_json,
                is_pinned_int,
                &pinned_cfg_json,
                &canvas_pos_json,
                &created_at,
                &now,
                wc,
                is_draft_int
            ],
        )?;

        Self::find_note(&conn, &id).map(Some)
    }

    pub fn get_note(&self, id: &str) -> Result<Option<Note>, DbError> {
        let conn = self.lock()?;
        match Self::find_note(&conn, id) {
            Ok(note) => Ok(Some(note)),
            Err(DbError::NotFound(_)) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn list_notes(&self, limit: i64) -> Result<Vec<Note>, DbError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, title, content, html_content, tags, is_pinned,
                    pinned_window_config, canvas_position, created_at, updated_at, word_count, is_draft
             FROM notes
             ORDER BY is_draft DESC, updated_at DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(rusqlite::params![limit], row_to_note)?;
        let notes: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(notes?)
    }

    pub fn search_notes(&self, input: SearchNotesRequest) -> Result<Vec<Note>, DbError> {
        let conn = self.lock()?;
        let like = format!("%{}%", input.query.trim());
        let pinned_clause = if input.pinned_only {
            "AND is_pinned = 1"
        } else {
            ""
        };
        let sql = format!(
            "SELECT id, title, content, html_content, tags, is_pinned,
                    pinned_window_config, canvas_position, created_at, updated_at, word_count, is_draft
             FROM notes
             WHERE (title LIKE ?1 OR content LIKE ?1) {pinned_clause}
             ORDER BY is_draft DESC, updated_at DESC
             LIMIT ?2"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params![&like, input.limit], row_to_note)?;
        let mut notes: Vec<Note> = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        if !input.tags.is_empty() {
            notes.retain(|n| input.tags.iter().all(|t| n.tags.contains(t)));
        }
        Ok(notes)
    }

    pub fn delete_note(&self, id: &str) -> Result<(), DbError> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM notes WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }

    pub fn set_pinned(&self, id: &str, is_pinned: bool) -> Result<Note, DbError> {
        let conn = self.lock()?;
        let now = chrono::Utc::now().to_rfc3339();
        let updated = conn.execute(
            "UPDATE notes SET is_pinned = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![i64::from(is_pinned), &now, id],
        )?;
        if updated == 0 {
            return Err(DbError::NotFound(id.to_string()));
        }
        Self::find_note(&conn, id)
    }

    /// 仅更新 pinned_window_config 一列（StickyNote 调整透明度/颜色/字号/尺寸时
    /// 频繁调用），不动 content / html_content / tags / word_count，避免在
    /// 拖滑块的高频路径上做整行 INSERT OR REPLACE。
    pub fn update_pinned_window_config(
        &self,
        id: &str,
        config: &crate::models::PinnedWindowConfig,
    ) -> Result<Note, DbError> {
        let json = serde_json::to_string(config)?;
        let conn = self.lock()?;
        let now = chrono::Utc::now().to_rfc3339();
        let updated = conn.execute(
            "UPDATE notes SET pinned_window_config = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![&json, &now, id],
        )?;
        if updated == 0 {
            return Err(DbError::NotFound(id.to_string()));
        }
        Self::find_note(&conn, id)
    }

    /// 仅更新 canvas_position 一列。Canvas 拖动释放后调用，避免整行 REPLACE
    /// 把 word_count 等派生列重算一遍。
    pub fn update_canvas_position(
        &self,
        id: &str,
        position: &crate::models::CanvasPosition,
    ) -> Result<Note, DbError> {
        let json = serde_json::to_string(position)?;
        let conn = self.lock()?;
        let now = chrono::Utc::now().to_rfc3339();
        let updated = conn.execute(
            "UPDATE notes SET canvas_position = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![&json, &now, id],
        )?;
        if updated == 0 {
            return Err(DbError::NotFound(id.to_string()));
        }
        Self::find_note(&conn, id)
    }

    pub fn list_pinned(&self) -> Result<Vec<Note>, DbError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, title, content, html_content, tags, is_pinned,
                    pinned_window_config, canvas_position, created_at, updated_at, word_count, is_draft
             FROM notes
             WHERE is_pinned = 1 AND is_draft = 0
             ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], row_to_note)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    // ----- workspaces / library entries ---------------------------------

    pub fn create_workspace(&self, name: &str, root_path: PathBuf) -> Result<Workspace, DbError> {
        std::fs::create_dir_all(&root_path)?;
        let normalized_root = normalize_workspace_root(&root_path)?;
        let root_path_str = normalized_root.to_string_lossy().into_owned();

        let existing = {
            let conn = self.lock()?;
            conn.query_row(
                "SELECT id, name, root_path, created_at, updated_at FROM workspaces WHERE root_path = ?1",
                rusqlite::params![&root_path_str],
                row_to_workspace,
            )
            .optional()?
        };

        if let Some(workspace) = existing {
            return Ok(workspace);
        }

        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO workspaces (id, name, root_path, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)",
            rusqlite::params![&id, name, &root_path_str, &now],
        )?;

        Ok(Workspace {
            id,
            name: name.to_string(),
            root_path: root_path_str,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn list_workspaces(&self) -> Result<Vec<Workspace>, DbError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, root_path, created_at, updated_at
             FROM workspaces
             ORDER BY updated_at DESC, created_at DESC",
        )?;
        let rows = stmt.query_map([], row_to_workspace)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn list_library_entries(
        &self,
        context: MainListContext,
    ) -> Result<Vec<LibraryEntry>, DbError> {
        if let Some(workspace_id) = context.workspace_id.as_deref() {
            self.sync_workspace_entries(workspace_id)?;
        }

        let conn = self.lock()?;
        let mut items = Vec::new();

        if let Some(workspace_id) = context.workspace_id.as_deref() {
            let mut stmt = conn.prepare(
                "SELECT id, kind, title, preview_text, tags, workspace_id, parent_id, group_id, file_path, created_at, updated_at, word_count, byte_size
                 FROM library_entries
                 WHERE workspace_id = ?1
                   AND kind = 'document'
                 ORDER BY updated_at DESC, title COLLATE NOCASE ASC",
            )?;
            let rows = stmt.query_map(rusqlite::params![workspace_id], row_to_library_entry)?;
            items.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        }

        let mut group_stmt = conn.prepare(
            "SELECT id, kind, title, preview_text, tags, workspace_id, parent_id, group_id, file_path, created_at, updated_at, word_count, byte_size
             FROM library_entries
             WHERE kind = 'group'
               AND ((?1 IS NULL AND parent_id IS NULL) OR parent_id = ?1)
             ORDER BY updated_at DESC, title COLLATE NOCASE ASC",
        )?;
        let group_rows = group_stmt.query_map(
            rusqlite::params![context.group_entry_id.as_deref()],
            row_to_library_entry,
        )?;
        items.extend(group_rows.collect::<rusqlite::Result<Vec<_>>>()?);

        let mut text_stmt = if context.group_entry_id.is_some() {
            conn.prepare(
                "SELECT id, kind, title, preview_text, tags, workspace_id, parent_id, group_id, file_path, created_at, updated_at, word_count, byte_size
                 FROM library_entries
                 WHERE kind = 'text' AND group_id = ?1
                 ORDER BY updated_at DESC, created_at DESC",
            )?
        } else {
            conn.prepare(
                "SELECT id, kind, title, preview_text, tags, workspace_id, parent_id, group_id, file_path, created_at, updated_at, word_count, byte_size
                 FROM library_entries
                 WHERE kind = 'text'
                 ORDER BY updated_at DESC, created_at DESC",
            )?
        };

        if let Some(group_id) = context.group_entry_id.as_deref() {
            let rows = text_stmt.query_map(rusqlite::params![group_id], row_to_library_entry)?;
            items.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        } else {
            let rows = text_stmt.query_map([], row_to_library_entry)?;
            items.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        }

        Ok(items)
    }

    pub fn list_workspace_tree(&self, workspace_id: &str) -> Result<Vec<LibraryEntry>, DbError> {
        self.sync_workspace_entries(workspace_id)?;

        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, kind, title, preview_text, tags, workspace_id, parent_id, group_id, file_path, created_at, updated_at, word_count, byte_size
             FROM library_entries
             WHERE workspace_id = ?1
               AND kind IN ('folder', 'document')
             ORDER BY COALESCE(parent_id, ''), CASE kind WHEN 'folder' THEN 0 ELSE 1 END, title COLLATE NOCASE ASC",
        )?;
        let rows = stmt.query_map(rusqlite::params![workspace_id], row_to_library_entry)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    fn sync_workspace_entries(&self, workspace_id: &str) -> Result<(), DbError> {
        let workspace = {
            let conn = self.lock()?;
            Self::find_workspace(&conn, workspace_id)?
        };
        let root = normalize_workspace_root(Path::new(&workspace.root_path))?;
        let fs_entries = workspace_fs::scan_workspace(&root)?;
        if fs_entries.is_empty() {
            return Ok(());
        }

        let now = chrono::Utc::now().to_rfc3339();
        let mut path_to_existing = {
            let conn = self.lock()?;
            workspace_entries_by_path(&conn, workspace_id)?
        };
        let mut path_to_id = HashMap::new();

        for entry in &fs_entries {
            let path_key = path_key(&entry.path);
            let id = path_to_existing
                .get(&path_key)
                .map(|existing| existing.id.clone())
                .unwrap_or_else(|| stable_workspace_entry_id(workspace_id, &entry.path));
            path_to_id.insert(path_key, id);
        }

        let conn = self.lock()?;
        for entry in fs_entries {
            let entry_path_key = path_key(&entry.path);
            let id = path_to_id
                .get(&entry_path_key)
                .cloned()
                .unwrap_or_else(|| stable_workspace_entry_id(workspace_id, &entry.path));
            let existing = path_to_existing.remove(&entry_path_key);
            let updated_at = fs_modified_or_now(entry.modified_at, &now);
            let created_at = existing
                .as_ref()
                .map(|entry| entry.created_at.clone())
                .unwrap_or_else(|| updated_at.clone());
            let parent_id = entry
                .parent_path
                .as_ref()
                .and_then(|parent| path_to_id.get(&path_key(parent)).cloned());
            let (kind, preview, tags_json, word_count_value, byte_size) = match entry.kind {
                WorkspaceFsEntryKind::Folder => ("folder", String::new(), "[]".to_string(), 0, 0),
                WorkspaceFsEntryKind::Document => (
                    "document",
                    preview_text(&entry.content),
                    serde_json::to_string(&extract_tags(&entry.content, &[]))?,
                    word_count(&entry.content),
                    entry.byte_size,
                ),
            };

            conn.execute(
                "INSERT INTO library_entries
                 (id, kind, title, preview_text, body_markdown, tags, workspace_id, parent_id, group_id, file_path, created_at, updated_at, word_count, byte_size)
                 VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, NULL, ?8, ?9, ?10, ?11, ?12)
                 ON CONFLICT(id) DO UPDATE SET
                   kind = excluded.kind,
                   title = excluded.title,
                   preview_text = excluded.preview_text,
                   tags = excluded.tags,
                   workspace_id = excluded.workspace_id,
                   parent_id = excluded.parent_id,
                   group_id = NULL,
                   file_path = excluded.file_path,
                   updated_at = excluded.updated_at,
                   word_count = excluded.word_count,
                   byte_size = excluded.byte_size",
                rusqlite::params![
                    &id,
                    kind,
                    &entry.title,
                    &preview,
                    &tags_json,
                    workspace_id,
                    parent_id.as_deref(),
                    &entry_path_key,
                    &created_at,
                    &updated_at,
                    word_count_value,
                    byte_size,
                ],
            )?;
        }

        Ok(())
    }

    pub fn save_text_entry(&self, input: SaveTextEntryRequest) -> Result<LibraryEntry, DbError> {
        let byte_size = ensure_text_size_limit(&input.content)?;
        let title = input
            .title
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| derive_title(&input.content));
        let tags = extract_tags(&input.content, &input.tags);
        let tags_json = serde_json::to_string(&tags)?;
        let preview = preview_text(&input.content);
        let id = input
            .id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let now = chrono::Utc::now().to_rfc3339();
        let group_id = input
            .group_id
            .clone()
            .unwrap_or_else(|| INBOX_GROUP_ID.to_string());
        let word_count_value = word_count(&input.content);

        let conn = self.lock()?;
        let existing_created_at: Option<String> = conn
            .query_row(
                "SELECT created_at FROM library_entries WHERE id = ?1",
                rusqlite::params![&id],
                |row| row.get(0),
            )
            .optional()?;
        let created_at = existing_created_at.unwrap_or_else(|| now.clone());

        conn.execute(
            "INSERT OR REPLACE INTO library_entries
             (id, kind, title, preview_text, body_markdown, tags, workspace_id, parent_id, group_id, file_path, created_at, updated_at, word_count, byte_size)
             VALUES (?1, 'text', ?2, ?3, ?4, ?5, NULL, NULL, ?6, NULL, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                &id,
                &title,
                &preview,
                &input.content,
                &tags_json,
                &group_id,
                &created_at,
                &now,
                word_count_value,
                byte_size,
            ],
        )?;

        Self::find_library_entry(&conn, &id)
    }

    pub fn save_document_entry(
        &self,
        input: SaveDocumentEntryRequest,
    ) -> Result<LibraryEntry, DbError> {
        let title = input
            .title
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| derive_title(&input.content));
        let tags = extract_tags(&input.content, &input.tags);
        let tags_json = serde_json::to_string(&tags)?;
        let preview = preview_text(&input.content);
        let byte_size = markdown_byte_size(&input.content);
        let word_count_value = word_count(&input.content);
        let id = input
            .id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let now = chrono::Utc::now().to_rfc3339();

        let conn = self.lock()?;
        let workspace = Self::find_workspace(&conn, &input.workspace_id)?;
        let existing = conn
            .query_row(
                "SELECT id, kind, title, preview_text, tags, workspace_id, parent_id, group_id, file_path, created_at, updated_at, word_count, byte_size
                 FROM library_entries WHERE id = ?1",
                rusqlite::params![&id],
                row_to_library_entry,
            )
            .optional()?;
        let created_at = existing
            .as_ref()
            .map(|entry| entry.created_at.clone())
            .unwrap_or_else(|| now.clone());

        let base_dir = if let Some(folder_id) = &input.folder_entry_id {
            let folder = Self::find_library_entry(&conn, folder_id)?;
            folder
                .file_path
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from(&workspace.root_path))
        } else {
            PathBuf::from(&workspace.root_path)
        };

        let target_path = existing
            .as_ref()
            .and_then(|entry| entry.file_path.clone())
            .map(PathBuf::from)
            .unwrap_or_else(|| workspace_fs::build_document_path(&base_dir, &title));
        workspace_fs::write_markdown_file(&target_path, &input.content)?;
        let path_str = target_path.to_string_lossy().into_owned();

        conn.execute(
            "INSERT OR REPLACE INTO library_entries
             (id, kind, title, preview_text, body_markdown, tags, workspace_id, parent_id, group_id, file_path, created_at, updated_at, word_count, byte_size)
             VALUES (?1, 'document', ?2, ?3, NULL, ?4, ?5, ?6, NULL, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                &id,
                &title,
                &preview,
                &tags_json,
                &workspace.id,
                input.folder_entry_id.as_deref(),
                &path_str,
                &created_at,
                &now,
                word_count_value,
                byte_size,
            ],
        )?;

        Self::find_library_entry(&conn, &id)
    }

    pub fn get_editor_entry(&self, id: &str) -> Result<Option<EditorEntry>, DbError> {
        let conn = self.lock()?;
        let entry = conn
            .query_row(
                "SELECT id, kind, title, body_markdown, tags, workspace_id, parent_id, group_id, file_path
                 FROM library_entries
                 WHERE id = ?1 AND kind IN ('text', 'document')",
                rusqlite::params![id],
                |row| {
                    let kind = entry_kind_from_db(&row.get::<_, String>(1)?);
                    let tags_json: String = row.get(4)?;
                    let file_path: Option<String> = row.get(8)?;
                    let content = match kind {
                        EntryKind::Document => {
                            if let Some(path) = file_path.as_deref() {
                                std::fs::read_to_string(path).unwrap_or_default()
                            } else {
                                String::new()
                            }
                        }
                        _ => row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    };

                    Ok(EditorEntry {
                        id: row.get(0)?,
                        kind,
                        title: row.get(2)?,
                        content,
                        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                        workspace_id: row.get(5)?,
                        parent_id: row.get(6)?,
                        group_id: row.get(7)?,
                        file_path,
                    })
                },
            )
            .optional()?;
        Ok(entry)
    }

    pub fn convert_text_to_document(
        &self,
        input: ConvertTextToDocumentRequest,
    ) -> Result<LibraryEntry, DbError> {
        let conn = self.lock()?;
        let existing = Self::find_library_entry(&conn, &input.id)?;
        if existing.kind != EntryKind::Text {
            return Err(DbError::Validation("只有文本笔记可以转为文档".into()));
        }

        let workspace = Self::find_workspace(&conn, &input.workspace_id)?;
        let base_dir = if let Some(folder_id) = &input.folder_entry_id {
            let folder = Self::find_library_entry(&conn, folder_id)?;
            folder
                .file_path
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from(&workspace.root_path))
        } else {
            PathBuf::from(&workspace.root_path)
        };

        let markdown = conn
            .query_row(
                "SELECT body_markdown FROM library_entries WHERE id = ?1",
                rusqlite::params![&input.id],
                |row| row.get::<_, Option<String>>(0),
            )?
            .unwrap_or_default();

        let path = workspace_fs::build_document_path(&base_dir, &existing.title);
        workspace_fs::write_markdown_file(&path, &markdown)?;
        let path_str = path.to_string_lossy().into_owned();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE library_entries
             SET kind = 'document',
                 workspace_id = ?1,
                 parent_id = ?2,
                 group_id = NULL,
                 file_path = ?3,
                 updated_at = ?4
             WHERE id = ?5",
            rusqlite::params![
                &workspace.id,
                input.folder_entry_id.as_deref(),
                &path_str,
                &now,
                &input.id,
            ],
        )?;

        Self::find_library_entry(&conn, &input.id)
    }

    /// 把指定 draft 行（is_draft=1）提升为正式笔记：分配新 UUID、清掉
    /// is_draft 标记、删掉原 draft 行。若 id 不存在或不是草稿则返回
    /// Ok(None)，由调用方决定是否报错。
    pub fn promote_draft(&self, draft_id: &str) -> Result<Option<Note>, DbError> {
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        let draft: Option<Note> = tx
            .query_row(
                "SELECT id, title, content, html_content, tags, is_pinned,
                        pinned_window_config, canvas_position, created_at, updated_at, word_count, is_draft
                 FROM notes WHERE id = ?1 AND is_draft = 1",
                rusqlite::params![draft_id],
                row_to_note,
            )
            .optional()?;
        let Some(draft) = draft else {
            return Ok(None);
        };
        let new_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let tags_json = serde_json::to_string(&draft.tags)?;
        let pinned_cfg_json = match &draft.pinned_window_config {
            Some(c) => Some(serde_json::to_string(c)?),
            None => None,
        };
        let canvas_pos_json = match &draft.canvas_position {
            Some(p) => Some(serde_json::to_string(p)?),
            None => None,
        };
        tx.execute(
            "INSERT INTO notes
             (id, title, content, html_content, tags, is_pinned, pinned_window_config, canvas_position, created_at, updated_at, word_count, is_draft)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0)",
            rusqlite::params![
                &new_id,
                &draft.title,
                &draft.content,
                &draft.html_content,
                &tags_json,
                i64::from(draft.is_pinned),
                &pinned_cfg_json,
                &canvas_pos_json,
                &draft.created_at,
                &now,
                draft.word_count,
            ],
        )?;
        tx.execute(
            "DELETE FROM notes WHERE id = ?1",
            rusqlite::params![draft_id],
        )?;
        let promoted = Self::find_note(&tx, &new_id)?;
        tx.commit()?;
        Ok(Some(promoted))
    }

    /// 返回最近一份未保存草稿（按 updated_at 降序），无则 Ok(None)。
    /// 全局快捷键打开速记浮窗时调用：用户期望续写"上一份"草稿。
    pub fn latest_draft(&self) -> Result<Option<Note>, DbError> {
        let conn = self.lock()?;
        let note = conn
            .query_row(
                "SELECT id, title, content, html_content, tags, is_pinned,
                        pinned_window_config, canvas_position, created_at, updated_at, word_count, is_draft
                 FROM notes
                 WHERE is_draft = 1
                 ORDER BY updated_at DESC
                 LIMIT 1",
                [],
                row_to_note,
            )
            .optional()?;
        Ok(note)
    }

    // ----- 剪贴板历史 --------------------------------------------------

    pub fn upsert_clipboard_entry(
        &self,
        input: NewClipboardEntry,
    ) -> Result<ClipboardEntry, DbError> {
        let conn = self.lock()?;
        let now = chrono::Utc::now().to_rfc3339();
        let existing: Option<(String, String)> = conn
            .query_row(
                "SELECT id, created_at FROM clipboard_history
                 WHERE content_type = ?1 AND content_hash = ?2",
                rusqlite::params![&input.content_type, &input.content_hash],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        let (id, created_at) = existing.unwrap_or_else(|| {
            let id = uuid::Uuid::new_v4().to_string();
            (id, now.clone())
        });

        conn.execute(
            "INSERT INTO clipboard_history
             (id, content_type, content, html_content, preview, content_hash, created_at, updated_at, size_bytes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(content_type, content_hash) DO UPDATE SET
               content = excluded.content,
               html_content = excluded.html_content,
               preview = excluded.preview,
               updated_at = excluded.updated_at,
               size_bytes = excluded.size_bytes",
            rusqlite::params![
                &id,
                &input.content_type,
                &input.content,
                &input.html_content,
                &input.preview,
                &input.content_hash,
                &created_at,
                &now,
                input.size_bytes,
            ],
        )?;

        Self::find_clipboard_entry(&conn, &id)
    }

    pub fn list_clipboard_entries(
        &self,
        limit: i64,
        content_type: Option<String>,
        query: Option<String>,
    ) -> Result<Vec<ClipboardEntry>, DbError> {
        let conn = self.lock()?;
        let mut sql = String::from(
            "SELECT id, content_type, content, html_content, preview, created_at, updated_at, size_bytes
             FROM clipboard_history
             WHERE 1 = 1",
        );
        let mut values: Vec<String> = Vec::new();

        if let Some(content_type) = content_type.map(|value| value.trim().to_string()) {
            if !content_type.is_empty() {
                sql.push_str(" AND content_type = ?");
                values.push(content_type);
            }
        }

        if let Some(query) = query.map(|value| value.trim().to_string()) {
            if !query.is_empty() {
                sql.push_str(" AND (content LIKE ? OR preview LIKE ?)");
                let like = format!("%{query}%");
                values.push(like.clone());
                values.push(like);
            }
        }

        sql.push_str(" ORDER BY updated_at DESC LIMIT ?");
        values.push(limit.max(1).to_string());

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(
            rusqlite::params_from_iter(values.iter()),
            row_to_clipboard_entry,
        )?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn get_clipboard_entry(&self, id: &str) -> Result<Option<ClipboardEntry>, DbError> {
        let conn = self.lock()?;
        match Self::find_clipboard_entry(&conn, id) {
            Ok(entry) => Ok(Some(entry)),
            Err(DbError::NotFound(_)) => Ok(None),
            Err(error) => Err(error),
        }
    }

    pub fn delete_clipboard_entry(&self, id: &str) -> Result<(), DbError> {
        let conn = self.lock()?;
        conn.execute(
            "DELETE FROM clipboard_history WHERE id = ?1",
            rusqlite::params![id],
        )?;
        Ok(())
    }

    pub fn clear_clipboard_entries(&self) -> Result<(), DbError> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM clipboard_history", [])?;
        Ok(())
    }

    // ----- 设置 key-value -----------------------------------------------

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, DbError> {
        let conn = self.lock()?;
        let v: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                rusqlite::params![key],
                |row| row.get(0),
            )
            .optional()?;
        Ok(v)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), DbError> {
        let conn = self.lock()?;
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            rusqlite::params![key, value, &now],
        )?;
        Ok(())
    }

    // ----- helpers ------------------------------------------------------

    fn find_note(conn: &Connection, id: &str) -> Result<Note, DbError> {
        let note = conn
            .query_row(
                "SELECT id, title, content, html_content, tags, is_pinned,
                        pinned_window_config, canvas_position, created_at, updated_at, word_count, is_draft
                 FROM notes WHERE id = ?1",
                rusqlite::params![id],
                row_to_note,
            )
            .optional()?;
        note.ok_or_else(|| DbError::NotFound(id.to_string()))
    }

    fn find_clipboard_entry(conn: &Connection, id: &str) -> Result<ClipboardEntry, DbError> {
        let entry = conn
            .query_row(
                "SELECT id, content_type, content, html_content, preview, created_at, updated_at, size_bytes
                 FROM clipboard_history WHERE id = ?1",
                rusqlite::params![id],
                row_to_clipboard_entry,
            )
            .optional()?;
        entry.ok_or_else(|| DbError::NotFound(id.to_string()))
    }

    fn find_library_entry(conn: &Connection, id: &str) -> Result<LibraryEntry, DbError> {
        let entry = conn
            .query_row(
                "SELECT id, kind, title, preview_text, tags, workspace_id, parent_id, group_id, file_path, created_at, updated_at, word_count, byte_size
                 FROM library_entries WHERE id = ?1",
                rusqlite::params![id],
                row_to_library_entry,
            )
            .optional()?;
        entry.ok_or_else(|| DbError::NotFound(id.to_string()))
    }

    fn find_workspace(conn: &Connection, id: &str) -> Result<Workspace, DbError> {
        let workspace = conn
            .query_row(
                "SELECT id, name, root_path, created_at, updated_at FROM workspaces WHERE id = ?1",
                rusqlite::params![id],
                row_to_workspace,
            )
            .optional()?;
        workspace.ok_or_else(|| DbError::NotFound(id.to_string()))
    }

    // ---------- Todos ----------
    //
    // 写操作均返回最新 Todo 快照，commands 层据此 emit 跨窗口事件。
    // content 校验：trim 后长度 1..=500；空串与超长一律 Validation。

    pub fn create_todo(&self, input: CreateTodoRequest) -> Result<Todo, DbError> {
        let content = Self::validate_todo_content(&input.content)?;
        let conn = self.lock()?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let list_id = input
            .list_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("default")
            .to_string();

        conn.execute(
            "INSERT INTO todos
             (id, content, status, created_at, updated_at, completed_at, due_date, reminder_time, list_id, is_deleted)
             VALUES (?1, ?2, 'todo', ?3, ?3, NULL, ?4, ?5, ?6, 0)",
            rusqlite::params![
                &id,
                &content,
                &now,
                input.due_date.as_deref(),
                input.reminder_time.as_deref(),
                &list_id,
            ],
        )?;

        Self::find_todo(&conn, &id)
    }

    pub fn update_todo(&self, input: UpdateTodoRequest) -> Result<Todo, DbError> {
        let conn = self.lock()?;
        let existing = Self::find_todo(&conn, &input.id)?;
        let now = chrono::Utc::now().to_rfc3339();

        let new_content = match &input.content {
            Some(content) => Self::validate_todo_content(content)?,
            None => existing.content.clone(),
        };

        let new_status = input.status.unwrap_or(existing.status);
        // 状态从非 done 切到 done 时 stamp completed_at；从 done 切回非 done 时清零。
        let new_completed_at = match (existing.status, new_status) {
            (TodoStatus::Done, TodoStatus::Done) => existing.completed_at.clone(),
            (_, TodoStatus::Done) => Some(now.clone()),
            (TodoStatus::Done, _) => None,
            _ => existing.completed_at.clone(),
        };

        // started_at：首次进入 Doing 时填充；后续状态切换不再覆盖。
        // 这让"开始"折线统计反映用户首次启动任务的时间，符合用户认知。
        let new_started_at = match (existing.started_at.as_ref(), new_status) {
            (None, TodoStatus::Doing) => Some(now.clone()),
            _ => existing.started_at.clone(),
        };

        // `Option<Option<String>>`：外层 None = 不变；外层 Some(None) = 清空。
        let reminder_explicitly_set = input.reminder_time.is_some();
        let new_reminder_time = match input.reminder_time {
            Some(value) => value,
            None => existing.reminder_time.clone(),
        };
        // 用户显式修改提醒时间（含清空）时，重置 reminder_fired，让调度器在新时间到达时再次触发。
        let new_reminder_fired = if reminder_explicitly_set {
            false
        } else {
            existing.reminder_fired
        };

        let new_due_date = match input.due_date {
            Some(value) => value,
            None => existing.due_date.clone(),
        };
        let new_list_id = input
            .list_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(existing.list_id.as_str())
            .to_string();

        conn.execute(
            "UPDATE todos
                SET content = ?1,
                    status = ?2,
                    updated_at = ?3,
                    completed_at = ?4,
                    due_date = ?5,
                    reminder_time = ?6,
                    reminder_fired = ?7,
                    started_at = ?8,
                    list_id = ?9
              WHERE id = ?10",
            rusqlite::params![
                &new_content,
                new_status.as_str(),
                &now,
                new_completed_at.as_deref(),
                new_due_date.as_deref(),
                new_reminder_time.as_deref(),
                new_reminder_fired as i64,
                new_started_at.as_deref(),
                &new_list_id,
                &input.id,
            ],
        )?;

        Self::find_todo(&conn, &input.id)
    }

    pub fn complete_todo(&self, id: &str) -> Result<Todo, DbError> {
        let conn = self.lock()?;
        let _ = Self::find_todo(&conn, id)?;
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE todos
                SET status = 'done',
                    updated_at = ?1,
                    completed_at = ?1
              WHERE id = ?2",
            rusqlite::params![&now, id],
        )?;
        Self::find_todo(&conn, id)
    }

    pub fn delete_todo(&self, id: &str) -> Result<(), DbError> {
        let conn = self.lock()?;
        let _ = Self::find_todo(&conn, id)?;
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE todos
                SET is_deleted = 1,
                    updated_at = ?1
              WHERE id = ?2",
            rusqlite::params![&now, id],
        )?;
        Ok(())
    }

    pub fn list_todos(&self) -> Result<Vec<Todo>, DbError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, content, status, created_at, updated_at, completed_at,
                    due_date, reminder_time, reminder_fired, started_at, list_id
               FROM todos
              WHERE is_deleted = 0
              ORDER BY
                CASE status WHEN 'done' THEN 1 ELSE 0 END,
                COALESCE(due_date, created_at) ASC,
                created_at ASC",
        )?;
        let rows = stmt.query_map([], row_to_todo)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// 今日列表：
    /// - 包含 `due_date` 落在今天的；
    /// - 或 `due_date IS NULL` 且 `created_at` 是今天本地日的（"今天创建即今天"）；
    /// - 默认排除已完成；`include_completed=true` 时一并返回。
    pub fn list_today_todos(&self, include_completed: bool) -> Result<Vec<Todo>, DbError> {
        let conn = self.lock()?;
        let mut sql = String::from(
            "SELECT id, content, status, created_at, updated_at, completed_at,
                    due_date, reminder_time, reminder_fired, started_at, list_id
               FROM todos
              WHERE is_deleted = 0
                AND (
                  (due_date IS NOT NULL AND DATE(due_date, 'localtime') = DATE('now', 'localtime'))
                  OR (due_date IS NULL AND DATE(created_at, 'localtime') = DATE('now', 'localtime'))
                )",
        );
        if !include_completed {
            sql.push_str(" AND status != 'done'");
        }
        sql.push_str(" ORDER BY status = 'done' ASC, COALESCE(due_date, created_at) ASC");
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], row_to_todo)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    fn find_todo(conn: &Connection, id: &str) -> Result<Todo, DbError> {
        let todo = conn
            .query_row(
                "SELECT id, content, status, created_at, updated_at, completed_at,
                        due_date, reminder_time, reminder_fired, started_at, list_id
                   FROM todos
                  WHERE id = ?1 AND is_deleted = 0",
                rusqlite::params![id],
                row_to_todo,
            )
            .optional()?;
        todo.ok_or_else(|| DbError::NotFound(id.to_string()))
    }

    /// 调度器扫描：列出到期、未触发、未删除、未完成的待办。
    ///
    /// - `now_rfc3339`：调用方传入的"当前时刻"RFC3339 字符串（便于测试 mock）
    /// - `limit`：单次最多返回多少条，防止系统长时间休眠醒来后通知淹没用户
    ///
    /// 返回时按 `reminder_time` 升序，确保最早到期的先触发。
    pub fn list_due_reminders(
        &self,
        now_rfc3339: &str,
        limit: usize,
    ) -> Result<Vec<Todo>, DbError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, content, status, created_at, updated_at, completed_at,
                    due_date, reminder_time, reminder_fired, started_at, list_id
               FROM todos
              WHERE reminder_time IS NOT NULL
                AND reminder_time <= ?1
                AND reminder_fired = 0
                AND is_deleted = 0
                AND status != 'done'
              ORDER BY reminder_time ASC
              LIMIT ?2",
        )?;
        let rows = stmt.query_map(rusqlite::params![now_rfc3339, limit as i64], row_to_todo)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// CAS 标记 fired：仅当 `reminder_time` 仍是触发时观察到的值才置位。
    /// 防止用户在调度器读取与标记之间修改了提醒时间，导致新时间被吞掉。
    ///
    /// 返回是否成功标记（true = 已置位；false = reminder_time 已变）。
    pub fn mark_reminder_fired(
        &self,
        id: &str,
        reminder_time: &str,
    ) -> Result<bool, DbError> {
        let conn = self.lock()?;
        let affected = conn.execute(
            "UPDATE todos
                SET reminder_fired = 1
              WHERE id = ?1 AND reminder_time = ?2 AND reminder_fired = 0",
            rusqlite::params![id, reminder_time],
        )?;
        Ok(affected > 0)
    }

    /// 是否存在至少一条已设置提醒时间的待办（用于"首次启动时按需请求通知权限"）。
    pub fn has_any_reminder(&self) -> Result<bool, DbError> {
        let conn = self.lock()?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM todos WHERE reminder_time IS NOT NULL AND is_deleted = 0",
            [],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    fn validate_todo_content(raw: &str) -> Result<String, DbError> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Err(DbError::Validation(
                "待办内容不能为空".to_string(),
            ));
        }
        // 以字符数（非字节）为准，与前端 length 一致。
        let char_count = trimmed.chars().count();
        if char_count > 500 {
            return Err(DbError::Validation(format!(
                "待办内容长度超过 500（当前 {char_count}）"
            )));
        }
        Ok(trimmed.to_string())
    }
}

fn row_to_library_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryEntry> {
    let tags_json: String = row.get(4)?;
    Ok(LibraryEntry {
        id: row.get(0)?,
        kind: entry_kind_from_db(&row.get::<_, String>(1)?),
        title: row.get(2)?,
        preview_text: row.get(3)?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        workspace_id: row.get(5)?,
        parent_id: row.get(6)?,
        group_id: row.get(7)?,
        file_path: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        word_count: row.get(11)?,
        byte_size: row.get(12)?,
    })
}

fn row_to_workspace(row: &rusqlite::Row<'_>) -> rusqlite::Result<Workspace> {
    Ok(Workspace {
        id: row.get(0)?,
        name: row.get(1)?,
        root_path: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn row_to_todo(row: &rusqlite::Row<'_>) -> rusqlite::Result<Todo> {
    let status_raw: String = row.get(2)?;
    let status = TodoStatus::parse(&status_raw).unwrap_or(TodoStatus::Todo);
    let reminder_fired: i64 = row.get(8)?;
    Ok(Todo {
        id: row.get(0)?,
        content: row.get(1)?,
        status,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        completed_at: row.get(5)?,
        due_date: row.get(6)?,
        reminder_time: row.get(7)?,
        reminder_fired: reminder_fired != 0,
        started_at: row.get(9)?,
        list_id: row.get(10)?,
    })
}

fn row_to_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<Note> {
    let tags_json: String = row.get(4)?;
    let pinned_cfg_json: Option<String> = row.get(6)?;
    let canvas_pos_json: Option<String> = row.get(7)?;
    let is_pinned_int: i64 = row.get(5)?;
    let is_draft_int: i64 = row.get(11)?;
    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        html_content: row.get(3)?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        is_pinned: is_pinned_int != 0,
        pinned_window_config: pinned_cfg_json
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok()),
        canvas_position: canvas_pos_json
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok()),
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        word_count: row.get(10)?,
        is_draft: is_draft_int != 0,
    })
}

fn row_to_clipboard_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<ClipboardEntry> {
    Ok(ClipboardEntry {
        id: row.get(0)?,
        content_type: row.get(1)?,
        content: row.get(2)?,
        html_content: row.get(3)?,
        preview: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        size_bytes: row.get(7)?,
    })
}

// ----- 内容派生 ---------------------------------------------------------

fn entry_kind_from_db(value: &str) -> EntryKind {
    match value {
        "workspace" => EntryKind::Workspace,
        "folder" => EntryKind::Folder,
        "group" => EntryKind::Group,
        "document" => EntryKind::Document,
        _ => EntryKind::Text,
    }
}

fn preview_text(content: &str) -> String {
    content
        .trim()
        .replace('\n', " ")
        .chars()
        .take(120)
        .collect()
}

fn markdown_byte_size(content: &str) -> i64 {
    content.as_bytes().len() as i64
}

fn ensure_text_size_limit(content: &str) -> Result<i64, DbError> {
    let size = markdown_byte_size(content);
    if size > 10 * 1024 {
        let kb = (size as f64 / 1024.0).ceil() as i64;
        return Err(DbError::Validation(format!(
            "当前文件大小 {}KB，文本文件最大不能超过 10KB",
            kb
        )));
    }
    Ok(size)
}

/// 第一行非空内容作为标题，最多 48 个字符。去掉开头的 Markdown `#` 标记。
pub fn derive_title(content: &str) -> String {
    let first = content
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("")
        .trim();
    let stripped = first.trim_start_matches('#').trim();
    let source = if stripped.is_empty() { first } else { stripped };
    source.chars().take(48).collect()
}

/// 解析 `#tag` 形式的标签（字母 / 数字 / 下划线 / 连字符，含中文），与 extra_tags
/// 合并后去重。空白 tag 跳过。
pub fn extract_tags(content: &str, extra_tags: &[String]) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    let mut chars = content.char_indices().peekable();
    while let Some(&(i, c)) = chars.peek() {
        if c == '#' {
            chars.next();
            let start = i + 1;
            let mut end = start;
            while let Some(&(j, ch)) = chars.peek() {
                if ch.is_alphanumeric() || ch == '_' || ch == '-' {
                    end = j + ch.len_utf8();
                    chars.next();
                } else {
                    break;
                }
            }
            if end > start {
                let tag = &content[start..end];
                if !tags.iter().any(|t| t == tag) {
                    tags.push(tag.to_string());
                }
            }
        } else {
            chars.next();
        }
    }
    for t in extra_tags {
        let trimmed = t.trim();
        if !trimmed.is_empty() && !tags.iter().any(|x| x == trimmed) {
            tags.push(trimmed.to_string());
        }
    }
    tags
}

/// 粗略的词数：空白分割。对纯中文不精确（连续中文算 1 词），未来可换
/// unicode-segmentation 做 grapheme cluster 计数。
pub fn word_count(content: &str) -> i64 {
    content.split_whitespace().count() as i64
}

fn normalize_workspace_root(path: &Path) -> Result<PathBuf, DbError> {
    match path.canonicalize() {
        Ok(canonical) => Ok(canonical),
        Err(_) => Ok(path.to_path_buf()),
    }
}

/// 把 Markdown 渲染成 HTML，存到 notes.html_content 列。
/// pulldown-cmark 默认开启所有标准语法。
pub fn render_markdown(content: &str) -> String {
    use pulldown_cmark::{html, Parser};
    let parser = Parser::new(content);
    let mut output = String::new();
    html::push_html(&mut output, parser);
    output
}

struct ExistingWorkspaceEntry {
    id: String,
    created_at: String,
}

fn workspace_entries_by_path(
    conn: &Connection,
    workspace_id: &str,
) -> Result<HashMap<String, ExistingWorkspaceEntry>, DbError> {
    let mut stmt = conn.prepare(
        "SELECT id, file_path, created_at
         FROM library_entries
         WHERE workspace_id = ?1
           AND kind IN ('folder', 'document')
           AND file_path IS NOT NULL",
    )?;
    let rows = stmt.query_map(rusqlite::params![workspace_id], |row| {
        let file_path: String = row.get(1)?;
        let normalized_path = PathBuf::from(&file_path)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(&file_path));
        Ok((
            path_key(&normalized_path),
            ExistingWorkspaceEntry {
                id: row.get(0)?,
                created_at: row.get(2)?,
            },
        ))
    })?;
    let pairs = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(pairs.into_iter().collect())
}

fn path_key(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn stable_workspace_entry_id(workspace_id: &str, path: &Path) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    let key = path_key(path);
    for byte in workspace_id.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash ^= u64::from(b':');
    hash = hash.wrapping_mul(0x100000001b3);
    for byte in key.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("fs-{hash:016x}")
}

fn fs_modified_or_now(modified_at: Option<std::time::SystemTime>, fallback: &str) -> String {
    modified_at
        .map(|time| DateTime::<Utc>::from(time).to_rfc3339())
        .unwrap_or_else(|| fallback.to_string())
}

// ----- tests ------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        ConvertTextToDocumentRequest, EntryKind, MainListContext, SaveNoteRequest,
        SaveTextEntryRequest,
    };
    use crate::todo::{CreateTodoRequest, TodoStatus, UpdateTodoRequest};

    fn fresh_db() -> Db {
        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        Db::migrate(&mut conn).expect("migrate");
        Db::ensure_default_settings(&conn).expect("ensure defaults");
        Db {
            conn: Arc::new(Mutex::new(conn)),
            db_path: PathBuf::from(":memory:"),
        }
    }

    // --- 迁移与 schema （Commit A 用例保留并扩展） ---

    #[test]
    fn migrate_creates_notes_and_settings_tables() {
        let mut conn = Connection::open_in_memory().unwrap();
        Db::migrate(&mut conn).unwrap();
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap();
        let tables: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert!(tables.contains(&"notes".to_string()));
        assert!(tables.contains(&"settings".to_string()));
    }

    #[test]
    fn migrate_creates_expected_indexes() {
        let mut conn = Connection::open_in_memory().unwrap();
        Db::migrate(&mut conn).unwrap();
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
            .unwrap();
        let indexes: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert!(indexes.iter().any(|s| s == "idx_notes_updated_at"));
        assert!(indexes.iter().any(|s| s == "idx_notes_is_pinned"));
    }

    #[test]
    fn migrate_creates_clipboard_history_table() {
        let mut conn = Connection::open_in_memory().unwrap();
        Db::migrate(&mut conn).unwrap();
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='clipboard_history'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(exists, 1);
    }

    #[test]
    fn migrate_is_idempotent() {
        let mut conn = Connection::open_in_memory().unwrap();
        Db::migrate(&mut conn).unwrap();
        Db::migrate(&mut conn).unwrap();
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 6);
    }

    #[test]
    fn migrate_self_heals_when_user_version_lies_about_is_draft() {
        // 不一致状态：user_version 标记成 v2，但 notes 表里其实没有 is_draft 列。
        // dev 环境多进程访问或上一次 migration 异常时偶有出现。
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE notes (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              content TEXT NOT NULL,
              html_content TEXT NOT NULL,
              tags TEXT NOT NULL DEFAULT '[]',
              is_pinned INTEGER NOT NULL DEFAULT 0,
              pinned_window_config TEXT,
              canvas_position TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              word_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            ",
        )
        .unwrap();
        conn.pragma_update(None, "user_version", 2_i64).unwrap();

        Db::migrate(&mut conn).unwrap();

        let cols: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(notes)").unwrap();
            stmt.query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .map(Result::unwrap)
                .collect()
        };
        assert!(cols.iter().any(|c| c == "is_draft"));
    }

    #[test]
    fn migrate_adds_is_draft_column_for_legacy_databases() {
        // 模拟 v1 schema（无 is_draft 列），然后跑 migrate 走 v2 升级路径。
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE notes (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              content TEXT NOT NULL,
              html_content TEXT NOT NULL,
              tags TEXT NOT NULL DEFAULT '[]',
              is_pinned INTEGER NOT NULL DEFAULT 0,
              pinned_window_config TEXT,
              canvas_position TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              word_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            ",
        )
        .unwrap();
        conn.pragma_update(None, "user_version", 1_i64).unwrap();

        Db::migrate(&mut conn).unwrap();

        let cols: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(notes)").unwrap();
            stmt.query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .map(Result::unwrap)
                .collect()
        };
        assert!(cols.iter().any(|c| c == "is_draft"));
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 6);
    }

    // --- derive_title ---

    #[test]
    fn derive_title_first_non_empty_line() {
        assert_eq!(derive_title("hello\nworld"), "hello");
        assert_eq!(derive_title("\n\n  hello \nworld"), "hello");
    }

    #[test]
    fn derive_title_strips_markdown_hash() {
        assert_eq!(derive_title("# 项目笔记\n正文"), "项目笔记");
        assert_eq!(derive_title("### deep heading"), "deep heading");
    }

    #[test]
    fn derive_title_truncates_to_48_chars() {
        let long = "a".repeat(200);
        let title = derive_title(&long);
        assert_eq!(title.chars().count(), 48);
    }

    // --- extract_tags ---

    #[test]
    fn extract_tags_basic_dedup_and_extra_merge() {
        let tags = extract_tags(
            "see #rust and #rust again, plus 中文 #笔记",
            &["extra".into()],
        );
        assert_eq!(tags, vec!["rust", "笔记", "extra"]);
    }

    #[test]
    fn extract_tags_ignores_bare_hash() {
        let tags = extract_tags("# heading not a tag", &[]);
        assert!(tags.is_empty(), "got {tags:?}");
    }

    // --- word_count ---

    #[test]
    fn word_count_whitespace_split() {
        assert_eq!(word_count(""), 0);
        assert_eq!(word_count("hello world"), 2);
        assert_eq!(word_count("  one\ttwo\nthree "), 3);
    }

    // --- save_note / get_note 闭环 ---

    #[test]
    fn save_note_skips_empty_input() {
        let db = fresh_db();
        let result = db
            .save_note(SaveNoteRequest {
                id: None,
                title: Some("   ".into()),
                content: "   ".into(),
                tags: vec!["  ".into()],
                is_pinned: None,
                pinned_window_config: None,
                canvas_position: None,
                is_draft: None,
            })
            .unwrap();
        assert!(result.is_none(), "empty input should not write a row");
    }

    #[test]
    fn save_note_and_get_note_roundtrip() {
        let db = fresh_db();
        let saved = db
            .save_note(SaveNoteRequest {
                id: Some("quicknote-draft".into()),
                title: None,
                content: "# 测试标题\n正文 #demo".into(),
                tags: vec![],
                is_pinned: None,
                pinned_window_config: None,
                canvas_position: None,
                is_draft: None,
            })
            .unwrap()
            .expect("non-empty input should save");
        assert_eq!(saved.id, "quicknote-draft");
        assert_eq!(saved.title, "测试标题");
        assert_eq!(saved.tags, vec!["demo"]);
        assert!(saved.html_content.contains("<h1>"));

        let fetched = db.get_note("quicknote-draft").unwrap().unwrap();
        assert_eq!(fetched.content, "# 测试标题\n正文 #demo");

        // 二次保存（同 id）应保留 created_at，仅更新 updated_at。
        let again = db
            .save_note(SaveNoteRequest {
                id: Some("quicknote-draft".into()),
                title: None,
                content: "edited".into(),
                tags: vec![],
                is_pinned: None,
                pinned_window_config: None,
                canvas_position: None,
                is_draft: None,
            })
            .unwrap()
            .unwrap();
        assert_eq!(again.created_at, saved.created_at);
        assert_ne!(again.updated_at, saved.updated_at);
    }

    #[test]
    fn save_note_persists_is_draft_flag() {
        let db = fresh_db();
        let saved = db
            .save_note(SaveNoteRequest {
                id: Some("quicknote-draft".into()),
                title: None,
                content: "draft body".into(),
                tags: vec![],
                is_pinned: None,
                pinned_window_config: None,
                canvas_position: None,
                is_draft: Some(true),
            })
            .unwrap()
            .unwrap();
        assert!(saved.is_draft);
        let fetched = db.get_note("quicknote-draft").unwrap().unwrap();
        assert!(fetched.is_draft);
    }

    #[test]
    fn list_notes_orders_drafts_first() {
        let db = fresh_db();
        let saved_first = db
            .save_note(SaveNoteRequest {
                id: None,
                title: Some("normal".into()),
                content: "body".into(),
                tags: vec![],
                is_pinned: None,
                pinned_window_config: None,
                canvas_position: None,
                is_draft: None,
            })
            .unwrap()
            .unwrap();
        let _draft = db
            .save_note(SaveNoteRequest {
                id: Some("quicknote-draft".into()),
                title: None,
                content: "drafty".into(),
                tags: vec![],
                is_pinned: None,
                pinned_window_config: None,
                canvas_position: None,
                is_draft: Some(true),
            })
            .unwrap()
            .unwrap();
        let listed = db.list_notes(10).unwrap();
        assert_eq!(listed[0].id, "quicknote-draft");
        assert!(listed[0].is_draft);
        assert_eq!(listed[1].id, saved_first.id);
        assert!(!listed[1].is_draft);
    }

    #[test]
    fn promote_draft_converts_draft_to_a_new_note() {
        let db = fresh_db();
        db.save_note(SaveNoteRequest {
            id: Some("quicknote-draft".into()),
            title: None,
            content: "未保存的草稿正文".into(),
            tags: vec!["pending".into()],
            is_pinned: None,
            pinned_window_config: None,
            canvas_position: None,
            is_draft: Some(true),
        })
        .unwrap()
        .unwrap();

        let promoted = db.promote_draft("quicknote-draft").unwrap().unwrap();
        assert_ne!(promoted.id, "quicknote-draft");
        assert!(!promoted.is_draft);
        assert_eq!(promoted.content, "未保存的草稿正文");
        assert!(promoted.tags.contains(&"pending".into()));

        assert!(db.get_note("quicknote-draft").unwrap().is_none());
        assert!(db.get_note(&promoted.id).unwrap().is_some());

        // 没有草稿时应返回 Ok(None)。
        let no_draft = db.promote_draft("quicknote-draft").unwrap();
        assert!(no_draft.is_none());
    }

    #[test]
    fn list_pinned_excludes_drafts() {
        let db = fresh_db();
        // 草稿即使 is_pinned=true 也应排除（save_note 内部已强制 is_draft=0，
        // 这里直接绕过保存层模拟极端态）。
        db.save_note(SaveNoteRequest {
            id: Some("quicknote-draft".into()),
            title: None,
            content: "drafty".into(),
            tags: vec![],
            is_pinned: None,
            pinned_window_config: None,
            canvas_position: None,
            is_draft: Some(true),
        })
        .unwrap()
        .unwrap();
        let pinned_note = db
            .save_note(SaveNoteRequest {
                id: None,
                title: Some("kept".into()),
                content: "body".into(),
                tags: vec![],
                is_pinned: Some(true),
                pinned_window_config: None,
                canvas_position: None,
                is_draft: None,
            })
            .unwrap()
            .unwrap();
        let pinned = db.list_pinned().unwrap();
        assert_eq!(pinned.len(), 1);
        assert_eq!(pinned[0].id, pinned_note.id);
    }

    // --- settings 默认值 ---

    #[test]
    fn latest_draft_returns_most_recent_draft_only() {
        let db = fresh_db();
        // 普通正式笔记不应出现在 latest_draft 结果里。
        db.save_note(SaveNoteRequest {
            id: None,
            title: Some("normal".into()),
            content: "body".into(),
            tags: vec![],
            is_pinned: None,
            pinned_window_config: None,
            canvas_position: None,
            is_draft: None,
        })
        .unwrap()
        .unwrap();
        // 第一份草稿（较旧）。
        db.save_note(SaveNoteRequest {
            id: Some("draft-older".into()),
            title: None,
            content: "older".into(),
            tags: vec![],
            is_pinned: None,
            pinned_window_config: None,
            canvas_position: None,
            is_draft: Some(true),
        })
        .unwrap()
        .unwrap();
        // 第二份草稿（较新）。
        std::thread::sleep(std::time::Duration::from_millis(5));
        db.save_note(SaveNoteRequest {
            id: Some("draft-newer".into()),
            title: None,
            content: "newer".into(),
            tags: vec![],
            is_pinned: None,
            pinned_window_config: None,
            canvas_position: None,
            is_draft: Some(true),
        })
        .unwrap()
        .unwrap();

        let latest = db.latest_draft().unwrap().expect("should have draft");
        assert_eq!(latest.id, "draft-newer");
        assert!(latest.is_draft);

        // 清空两份草稿后 latest_draft 应为 None。
        db.delete_note("draft-older").unwrap();
        db.delete_note("draft-newer").unwrap();
        assert!(db.latest_draft().unwrap().is_none());
    }

    #[test]
    fn default_settings_seed_includes_quicknote_shortcut() {
        let db = fresh_db();
        let v = db.get_setting("quicknoteShortcut").unwrap();
        assert_eq!(v.as_deref(), Some("Ctrl+Shift+M"));
        let v2 = db.get_setting("mainWindowShortcut").unwrap();
        assert_eq!(v2.as_deref(), Some("Ctrl+Shift+N"));
    }

    #[test]
    fn default_settings_seed_includes_clipboard_shortcut() {
        let db = fresh_db();
        let v = db.get_setting("clipboardShortcut").unwrap();
        assert_eq!(v.as_deref(), Some("Ctrl+Shift+V"));
    }

    #[test]
    fn default_settings_seed_includes_todo_quick_panel_keys() {
        let db = fresh_db();
        assert_eq!(
            db.get_setting("todoQuickPanelEnabled").unwrap().as_deref(),
            Some("true")
        );
        assert_eq!(
            db.get_setting("todoQuickPanelShortcut").unwrap().as_deref(),
            Some("Ctrl+Shift+T")
        );
        assert_eq!(
            db.get_setting("todoQuickPanelPosition").unwrap().as_deref(),
            Some("bottom-right")
        );
    }

    #[test]
    fn upsert_clipboard_entry_inserts_and_deduplicates_by_hash() {
        let db = fresh_db();
        let input = NewClipboardEntry {
            content_type: "text".into(),
            content: "hello".into(),
            html_content: None,
            preview: "hello".into(),
            content_hash: "text:abc".into(),
            size_bytes: 5,
        };

        let first = db.upsert_clipboard_entry(input.clone()).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        let second = db.upsert_clipboard_entry(input).unwrap();

        assert_eq!(first.id, second.id);
        assert_ne!(first.updated_at, second.updated_at);

        let listed = db.list_clipboard_entries(20, None, None).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].content, "hello");
    }

    #[test]
    fn list_clipboard_entries_filters_by_type_and_query() {
        let db = fresh_db();
        db.upsert_clipboard_entry(NewClipboardEntry {
            content_type: "url".into(),
            content: "https://example.com".into(),
            html_content: None,
            preview: "https://example.com".into(),
            content_hash: "url:a".into(),
            size_bytes: 19,
        })
        .unwrap();
        db.upsert_clipboard_entry(NewClipboardEntry {
            content_type: "text".into(),
            content: "meeting notes".into(),
            html_content: None,
            preview: "meeting notes".into(),
            content_hash: "text:b".into(),
            size_bytes: 13,
        })
        .unwrap();

        let urls = db
            .list_clipboard_entries(20, Some("url".to_string()), None)
            .unwrap();
        assert_eq!(urls.len(), 1);
        assert_eq!(urls[0].content_type, "url");

        let search = db
            .list_clipboard_entries(20, None, Some("meeting".to_string()))
            .unwrap();
        assert_eq!(search.len(), 1);
        assert_eq!(search[0].content, "meeting notes");
    }

    #[test]
    fn get_clipboard_entry_returns_saved_entry() {
        let db = fresh_db();
        let saved = db
            .upsert_clipboard_entry(NewClipboardEntry {
                content_type: "text".into(),
                content: "copy me".into(),
                html_content: None,
                preview: "copy me".into(),
                content_hash: "text:get".into(),
                size_bytes: 7,
            })
            .unwrap();

        let found = db.get_clipboard_entry(&saved.id).unwrap();

        assert_eq!(found.unwrap().content, "copy me");
        assert!(db.get_clipboard_entry("missing").unwrap().is_none());
    }

    #[test]
    fn delete_clipboard_entry_removes_one_entry() {
        let db = fresh_db();
        let saved = db
            .upsert_clipboard_entry(NewClipboardEntry {
                content_type: "text".into(),
                content: "delete me".into(),
                html_content: None,
                preview: "delete me".into(),
                content_hash: "text:delete".into(),
                size_bytes: 9,
            })
            .unwrap();

        db.delete_clipboard_entry(&saved.id).unwrap();

        assert!(db.get_clipboard_entry(&saved.id).unwrap().is_none());
    }

    #[test]
    fn clear_clipboard_entries_removes_all_entries() {
        let db = fresh_db();
        db.upsert_clipboard_entry(NewClipboardEntry {
            content_type: "text".into(),
            content: "first".into(),
            html_content: None,
            preview: "first".into(),
            content_hash: "text:first".into(),
            size_bytes: 5,
        })
        .unwrap();
        db.upsert_clipboard_entry(NewClipboardEntry {
            content_type: "url".into(),
            content: "https://example.com".into(),
            html_content: None,
            preview: "https://example.com".into(),
            content_hash: "url:first".into(),
            size_bytes: 19,
        })
        .unwrap();

        db.clear_clipboard_entries().unwrap();

        assert!(
            db.list_clipboard_entries(20, None, None)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn set_setting_upsert_does_not_change_unrelated_keys() {
        let db = fresh_db();
        db.set_setting("themeMode", "dark").unwrap();
        assert_eq!(
            db.get_setting("themeMode").unwrap().as_deref(),
            Some("dark")
        );
        // 其它默认值未受影响
        assert_eq!(
            db.get_setting("blurCloseDelayMs").unwrap().as_deref(),
            Some("800")
        );
    }

    #[test]
    fn default_settings_seed_includes_editor_outline_keys() {
        let db = fresh_db();
        assert_eq!(
            db.get_setting("noteEditorOutlineWidth").unwrap().as_deref(),
            Some("280")
        );
        assert_eq!(
            db.get_setting("noteEditorOutlineOpen").unwrap().as_deref(),
            Some("false")
        );
        assert_eq!(
            db.get_setting("zenOutlineWidth").unwrap().as_deref(),
            Some("300")
        );
        assert_eq!(
            db.get_setting("zenOutlineOpen").unwrap().as_deref(),
            Some("true")
        );
    }

    #[test]
    fn save_text_rejects_markdown_body_over_10kb() {
        let db = fresh_db();
        let content = "a".repeat(10 * 1024 + 1);

        let err = db
            .save_text_entry(SaveTextEntryRequest {
                id: None,
                title: Some("超限文本".into()),
                content,
                tags: vec![],
                group_id: None,
            })
            .unwrap_err()
            .to_string();

        assert!(err.contains("文本文件最大不能超过 10KB"), "{err}");
    }

    #[test]
    fn save_text_without_group_uses_system_inbox_group() {
        let db = fresh_db();
        let saved = db
            .save_text_entry(SaveTextEntryRequest {
                id: None,
                title: Some("默认分组文本".into()),
                content: "hello".into(),
                tags: vec![],
                group_id: None,
            })
            .unwrap();

        assert_eq!(saved.kind, EntryKind::Text);
        assert_eq!(saved.group_id.as_deref(), Some("group-inbox"));
    }

    #[test]
    fn create_workspace_reuses_existing_root_path() {
        let db = fresh_db();
        let root = std::env::temp_dir().join("steno-existing-workspace");

        let first = db.create_workspace("默认工作区", root.clone()).unwrap();
        let second = db.create_workspace("另一个名字", root).unwrap();

        assert_eq!(first.id, second.id);
        assert_eq!(first.root_path, second.root_path);
    }

    #[test]
    fn list_workspaces_returns_created_workspace() {
        let db = fresh_db();
        let root = std::env::temp_dir().join("steno-list-workspace");

        let created = db.create_workspace("默认工作区", root).unwrap();
        let workspaces = db.list_workspaces().unwrap();

        assert!(workspaces
            .iter()
            .any(|workspace| workspace.id == created.id));
    }

    #[test]
    fn listing_workspace_imports_existing_folders_and_markdown_files() {
        let db = fresh_db();
        let root =
            std::env::temp_dir().join(format!("steno-workspace-sync-{}", uuid::Uuid::new_v4()));
        let nested = root.join("research");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(root.join("overview.md"), "# Overview\nRoot document #plan").unwrap();
        std::fs::write(nested.join("deep-note.md"), "Nested document").unwrap();
        std::fs::write(root.join("asset.bin"), [0, 1, 2, 3]).unwrap();

        let workspace = db.create_workspace("导入测试", root.clone()).unwrap();
        let workspace_documents = db
            .list_library_entries(MainListContext {
                workspace_id: Some(workspace.id.clone()),
                folder_entry_id: None,
                group_entry_id: None,
                selected_entry_id: None,
            })
            .unwrap();

        assert!(!workspace_documents
            .iter()
            .any(|entry| entry.kind == EntryKind::Folder));
        assert!(workspace_documents
            .iter()
            .any(|entry| { entry.kind == EntryKind::Document && entry.title == "overview" }));
        assert!(workspace_documents
            .iter()
            .any(|entry| { entry.kind == EntryKind::Document && entry.title == "deep-note" }));
        assert!(!workspace_documents.iter().any(|entry| entry.title == "asset"));

        let tree = db.list_workspace_tree(&workspace.id).unwrap();
        assert!(tree.iter().any(|entry| entry.title == "research"));
        assert!(tree.iter().any(|entry| entry.title == "overview"));
        assert!(tree.iter().any(|entry| entry.title == "deep-note"));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn convert_text_to_document_writes_markdown_file_and_changes_kind() {
        let db = fresh_db();
        let workspace = db
            .create_workspace("默认工作区", std::env::temp_dir().join("steno-plan-test"))
            .unwrap();
        let text = db
            .save_text_entry(SaveTextEntryRequest {
                id: None,
                title: Some("待转换".into()),
                content: "# 标题\n正文".into(),
                tags: vec!["draft".into()],
                group_id: Some("group-inbox".into()),
            })
            .unwrap();

        let converted = db
            .convert_text_to_document(ConvertTextToDocumentRequest {
                id: text.id.clone(),
                workspace_id: workspace.id.clone(),
                folder_entry_id: None,
            })
            .unwrap();

        assert_eq!(converted.kind, EntryKind::Document);
        assert!(converted.file_path.as_ref().is_some());
        assert!(std::fs::exists(converted.file_path.as_ref().unwrap()).unwrap());
    }

    // --- todos ---

    #[test]
    fn migrate_creates_todos_table_and_indexes() {
        let mut conn = Connection::open_in_memory().unwrap();
        Db::migrate(&mut conn).unwrap();
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='todos'")
            .unwrap();
        let tables: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(tables, vec!["todos"]);

        let mut stmt = conn
            .prepare(
                "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='todos' ORDER BY name",
            )
            .unwrap();
        let indexes: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert!(indexes.contains(&"idx_todos_status".to_string()));
        assert!(indexes.contains(&"idx_todos_due_date".to_string()));
        assert!(indexes.contains(&"idx_todos_is_deleted".to_string()));
        assert!(indexes.contains(&"idx_todos_reminder_time".to_string()));
        assert!(indexes.contains(&"idx_todos_completed_at".to_string()));

        // 新装路径下 v6 列也应在 CREATE TABLE 中存在。
        let mut stmt = conn.prepare("PRAGMA table_info(todos)").unwrap();
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert!(columns.contains(&"reminder_fired".to_string()));
        assert!(columns.contains(&"started_at".to_string()));
    }

    #[test]
    fn migrate_v5_to_v6_adds_columns_and_indexes() {
        // 模拟"上一版本"留下的库：user_version=5、todos 表存在但缺少 v6 两列与索引。
        // notes 表也要预先建好，因为 migrate 末尾的 ensure_is_draft_column 自检会触达 notes。
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE notes (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              content TEXT NOT NULL,
              html_content TEXT NOT NULL,
              tags TEXT NOT NULL DEFAULT '[]',
              is_pinned INTEGER NOT NULL DEFAULT 0,
              pinned_window_config TEXT,
              canvas_position TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              word_count INTEGER NOT NULL DEFAULT 0,
              is_draft INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE todos (
              id            TEXT PRIMARY KEY,
              content       TEXT NOT NULL,
              status        TEXT NOT NULL DEFAULT 'todo',
              created_at    TEXT NOT NULL,
              updated_at    TEXT NOT NULL,
              completed_at  TEXT,
              due_date      TEXT,
              reminder_time TEXT,
              list_id       TEXT NOT NULL DEFAULT 'default',
              is_deleted    INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX idx_todos_status ON todos(status);
            CREATE INDEX idx_todos_due_date ON todos(due_date);
            CREATE INDEX idx_todos_is_deleted ON todos(is_deleted);
            ",
        )
        .unwrap();
        conn.pragma_update(None, "user_version", 5_i64).unwrap();
        // 插入一行旧数据，验证 ALTER 后保留。
        conn.execute(
            "INSERT INTO todos (id, content, status, created_at, updated_at)
             VALUES ('legacy-1', '旧任务', 'todo', '2026-05-25T10:00:00Z', '2026-05-25T10:00:00Z')",
            [],
        )
        .unwrap();

        Db::migrate(&mut conn).unwrap();

        // 新列已加。
        let mut stmt = conn.prepare("PRAGMA table_info(todos)").unwrap();
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert!(columns.contains(&"reminder_fired".to_string()));
        assert!(columns.contains(&"started_at".to_string()));

        // 新索引已建。
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='todos'")
            .unwrap();
        let indexes: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert!(indexes.contains(&"idx_todos_reminder_time".to_string()));
        assert!(indexes.contains(&"idx_todos_completed_at".to_string()));

        // 旧数据保留，新列填充默认值。
        let (rf, sa): (i64, Option<String>) = conn
            .query_row(
                "SELECT reminder_fired, started_at FROM todos WHERE id='legacy-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(rf, 0);
        assert_eq!(sa, None);

        // user_version 已升到 6。
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 6);
    }

    #[test]
    fn create_todo_persists_default_values() {
        let db = fresh_db();
        let todo = db
            .create_todo(CreateTodoRequest {
                content: "买牛奶".into(),
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap();
        assert_eq!(todo.content, "买牛奶");
        assert_eq!(todo.status, TodoStatus::Todo);
        assert_eq!(todo.list_id, "default");
        assert!(todo.completed_at.is_none());
        assert!(!todo.id.is_empty());
    }

    #[test]
    fn create_todo_trims_whitespace_in_content() {
        let db = fresh_db();
        let todo = db
            .create_todo(CreateTodoRequest {
                content: "   做晚饭   ".into(),
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap();
        assert_eq!(todo.content, "做晚饭");
    }

    #[test]
    fn create_todo_rejects_empty_content() {
        let db = fresh_db();
        let err = db
            .create_todo(CreateTodoRequest {
                content: "   ".into(),
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap_err();
        match err {
            DbError::Validation(_) => {}
            other => panic!("expect Validation, got {other:?}"),
        }
    }

    #[test]
    fn create_todo_rejects_overlong_content() {
        let db = fresh_db();
        let long = "a".repeat(501);
        let err = db
            .create_todo(CreateTodoRequest {
                content: long,
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap_err();
        assert!(matches!(err, DbError::Validation(_)));
    }

    #[test]
    fn update_todo_partial_fields_keeps_others_untouched() {
        let db = fresh_db();
        let created = db
            .create_todo(CreateTodoRequest {
                content: "原内容".into(),
                due_date: None,
                reminder_time: None,
                list_id: Some("inbox".into()),
            })
            .unwrap();

        let updated = db
            .update_todo(UpdateTodoRequest {
                id: created.id.clone(),
                content: Some("新内容".into()),
                status: None,
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap();
        assert_eq!(updated.content, "新内容");
        assert_eq!(updated.status, TodoStatus::Todo);
        assert_eq!(updated.list_id, "inbox");
    }

    #[test]
    fn complete_todo_sets_status_and_completed_at() {
        let db = fresh_db();
        let created = db
            .create_todo(CreateTodoRequest {
                content: "勾选项".into(),
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap();
        let completed = db.complete_todo(&created.id).unwrap();
        assert_eq!(completed.status, TodoStatus::Done);
        assert!(completed.completed_at.is_some());
    }

    #[test]
    fn update_todo_to_done_then_back_clears_completed_at() {
        let db = fresh_db();
        let created = db
            .create_todo(CreateTodoRequest {
                content: "反复任务".into(),
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap();
        let done = db
            .update_todo(UpdateTodoRequest {
                id: created.id.clone(),
                content: None,
                status: Some(TodoStatus::Done),
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap();
        assert!(done.completed_at.is_some());

        let reopened = db
            .update_todo(UpdateTodoRequest {
                id: created.id.clone(),
                content: None,
                status: Some(TodoStatus::Todo),
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap();
        assert_eq!(reopened.status, TodoStatus::Todo);
        assert!(reopened.completed_at.is_none());
    }

    #[test]
    fn delete_todo_hides_from_list() {
        let db = fresh_db();
        let created = db
            .create_todo(CreateTodoRequest {
                content: "要被删".into(),
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap();
        db.delete_todo(&created.id).unwrap();
        let all = db.list_todos().unwrap();
        assert!(all.iter().all(|t| t.id != created.id));
    }

    #[test]
    fn update_or_complete_missing_todo_returns_not_found() {
        let db = fresh_db();
        let err = db.complete_todo("non-existent-id").unwrap_err();
        assert!(matches!(err, DbError::NotFound(_)));
    }

    #[test]
    fn list_today_includes_due_date_today_and_creation_today_by_default() {
        let db = fresh_db();
        // 默认创建 → due_date=None，今日列表应命中
        let created_today = db
            .create_todo(CreateTodoRequest {
                content: "今日新建".into(),
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap();
        // 显式 due_date 设为今天本地日（用 sqlite DATE('now','localtime') 拿到一致字符串）
        let today_iso: String = {
            let conn = db.lock().unwrap();
            conn.query_row(
                "SELECT DATE('now','localtime') || 'T08:00:00+00:00'",
                [],
                |row| row.get(0),
            )
            .unwrap()
        };
        let due_today = db
            .create_todo(CreateTodoRequest {
                content: "今日截止".into(),
                due_date: Some(today_iso),
                reminder_time: None,
                list_id: None,
            })
            .unwrap();

        let today = db.list_today_todos(false).unwrap();
        let ids: Vec<&str> = today.iter().map(|t| t.id.as_str()).collect();
        assert!(ids.contains(&created_today.id.as_str()));
        assert!(ids.contains(&due_today.id.as_str()));
    }

    #[test]
    fn list_today_excludes_done_unless_include_completed() {
        let db = fresh_db();
        let created = db
            .create_todo(CreateTodoRequest {
                content: "今日已完".into(),
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap();
        db.complete_todo(&created.id).unwrap();

        let visible = db.list_today_todos(false).unwrap();
        assert!(visible.iter().all(|t| t.id != created.id));

        let with_done = db.list_today_todos(true).unwrap();
        assert!(with_done.iter().any(|t| t.id == created.id));
    }

    #[test]
    fn list_today_excludes_yesterday_created_when_no_due_date() {
        let db = fresh_db();
        // 直接插入一条 created_at 为"昨天 UTC"的记录（与 create_todo 一样写 UTC，
        // 否则 SQLite 在 list_today 查询时会对 localtime 字符串再做一次 localtime 转换，
        // 让昨晚 22:00 本地时间的记录在今晨被错认成今日，从而误命中）。
        let id = uuid::Uuid::new_v4().to_string();
        {
            let conn = db.lock().unwrap();
            conn.execute(
                "INSERT INTO todos (id, content, status, created_at, updated_at, completed_at,
                                    due_date, reminder_time, list_id, is_deleted)
                 VALUES (?1, '昨天遗留', 'todo',
                         DATETIME('now','-1 day'),
                         DATETIME('now','-1 day'),
                         NULL, NULL, NULL, 'default', 0)",
                rusqlite::params![&id],
            )
            .unwrap();
        }
        let today = db.list_today_todos(false).unwrap();
        assert!(today.iter().all(|t| t.id != id));
    }
}
