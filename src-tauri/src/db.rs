// SQLite 数据访问层。Plan Task 2 Step 2–6 + Task 3 接入（Arc<Mutex> 改造）。
//
// Commit A 落了基础设施（连接 / 路径 / v1 迁移）。
// Commit B 在此追加：notes/settings CRUD + 内容派生 + 默认设置初始化。
// 备份与同步预留在独立模块（backup.rs / sync.rs）。
//
// 为了让 commands.rs 在 `tauri::async_runtime::spawn_blocking` 里使用，
// Db 必须实现 Clone 且 'static — Connection 被 Arc<Mutex> 包裹，
// 整个 Db 是廉价克隆的句柄（Arc 引用计数）。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use rusqlite::{Connection, OptionalExtension};

use crate::models::{
    ConvertTextToDocumentRequest, EditorEntry, EntryKind, LibraryEntry, MainListContext, Note,
    SaveDocumentEntryRequest, SaveNoteRequest, SaveTextEntryRequest, SearchNotesRequest, Workspace,
};
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
            tx.pragma_update(None, "user_version", 2_i64)?;
            tx.commit()?;
        }
        Ok(())
    }

    /// 首次启动写入默认 settings。已存在的 key 不覆盖（INSERT OR IGNORE）。
    /// 命名与本仓库决策对齐：
    /// - mainWindowShortcut → 切换主窗口（PR1，默认 Ctrl+Shift+N）
    /// - quicknoteShortcut  → 切换浮窗（PR2，默认 Ctrl+Shift+M）
    /// - searchShortcut     → 全局搜索（plan Task 8，默认 Ctrl+Shift+F）
    fn ensure_default_settings(conn: &Connection) -> Result<(), DbError> {
        let defaults: &[(&str, &str)] = &[
            ("mainWindowShortcut", "Ctrl+Shift+N"),
            ("quicknoteShortcut", "Ctrl+Shift+M"),
            ("searchShortcut", "Ctrl+Shift+F"),
            ("floatingWidth", "400"),
            ("floatingHeight", "300"),
            ("blurCloseDelayMs", "800"),
            ("themeMode", "system"),
            ("editorMode", "split"),
            ("backupEveryChanges", "10"),
            ("noteEditorOutlineWidth", "280"),
            ("noteEditorOutlineOpen", "false"),
            ("zenOutlineWidth", "300"),
            ("zenOutlineOpen", "true"),
            ("mainListTypeFilters", "folder,group,document,text"),
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
        let is_pinned_int = i64::from(input.is_pinned.unwrap_or(false));
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
             (id, title, content, html_content, tags, is_pinned, pinned_window_config, canvas_position, created_at, updated_at, word_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
                wc
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
                    pinned_window_config, canvas_position, created_at, updated_at, word_count
             FROM notes
             ORDER BY updated_at DESC
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
                    pinned_window_config, canvas_position, created_at, updated_at, word_count
             FROM notes
             WHERE (title LIKE ?1 OR content LIKE ?1) {pinned_clause}
             ORDER BY updated_at DESC
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
                    pinned_window_config, canvas_position, created_at, updated_at, word_count
             FROM notes
             WHERE is_pinned = 1
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
            let (kind, preview, tags_json, word_count, byte_size) = match entry.kind {
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
                    word_count,
                    byte_size,
                ],
            )?;
        }

        Ok(())
    }

    pub fn save_text_entry(&self, input: SaveTextEntryRequest) -> Result<LibraryEntry, DbError> {
        let byte_size = ensure_text_size_limit(&input.content)?;
        let requested_title = input
            .title
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);
        let tags = extract_tags(&input.content, &input.tags);
        let tags_json = serde_json::to_string(&tags)?;
        let preview_text = preview_text(&input.content);
        let id = input
            .id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let now = chrono::Utc::now().to_rfc3339();
        let group_id = input
            .group_id
            .clone()
            .unwrap_or_else(|| INBOX_GROUP_ID.to_string());
        let word_count = word_count(&input.content);

        let conn = self.lock()?;
        let existing_row: Option<(String, String)> = conn
            .query_row(
                "SELECT created_at, title FROM library_entries WHERE id = ?1",
                rusqlite::params![&id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        let created_at = existing_row
            .as_ref()
            .map(|(c, _)| c.clone())
            .unwrap_or_else(|| now.clone());

        let title = if let Some(value) = requested_title {
            value
        } else if let Some((_, existing_title)) = existing_row.as_ref() {
            if existing_title.trim().is_empty() {
                derive_unique_text_title(&conn, &group_id, &id)?
            } else {
                existing_title.clone()
            }
        } else {
            derive_unique_text_title(&conn, &group_id, &id)?
        };

        conn.execute(
            "INSERT OR REPLACE INTO library_entries
             (id, kind, title, preview_text, body_markdown, tags, workspace_id, parent_id, group_id, file_path, created_at, updated_at, word_count, byte_size)
             VALUES (?1, 'text', ?2, ?3, ?4, ?5, NULL, NULL, ?6, NULL, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                &id,
                &title,
                &preview_text,
                &input.content,
                &tags_json,
                &group_id,
                &created_at,
                &now,
                word_count,
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
        let preview_text = preview_text(&input.content);
        let byte_size = markdown_byte_size(&input.content);
        let word_count = word_count(&input.content);
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
                &preview_text,
                &tags_json,
                &workspace.id,
                input.folder_entry_id.as_deref(),
                &path_str,
                &created_at,
                &now,
                word_count,
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
                        pinned_window_config, canvas_position, created_at, updated_at, word_count
                 FROM notes WHERE id = ?1",
                rusqlite::params![id],
                row_to_note,
            )
            .optional()?;
        note.ok_or_else(|| DbError::NotFound(id.to_string()))
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
}

fn row_to_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<Note> {
    let tags_json: String = row.get(4)?;
    let pinned_cfg_json: Option<String> = row.get(6)?;
    let canvas_pos_json: Option<String> = row.get(7)?;
    let is_pinned_int: i64 = row.get(5)?;
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
    })
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

/// 浮窗速记默认标题：同一 group 内若已存在"未命名"，则递增为"未命名1"、"未命名2"…
pub fn derive_unique_text_title(
    conn: &Connection,
    group_id: &str,
    exclude_id: &str,
) -> Result<String, DbError> {
    const BASE: &str = "未命名";
    let mut existing: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut stmt = conn.prepare(
        "SELECT title FROM library_entries WHERE kind = 'text' AND group_id = ?1 AND id <> ?2",
    )?;
    let rows = stmt.query_map(rusqlite::params![group_id, exclude_id], |row| {
        row.get::<_, String>(0)
    })?;
    for row in rows {
        existing.insert(row?);
    }
    if !existing.contains(BASE) {
        return Ok(BASE.to_string());
    }
    let mut n: u32 = 1;
    loop {
        let candidate = format!("{BASE}{n}");
        if !existing.contains(&candidate) {
            return Ok(candidate);
        }
        n += 1;
    }
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
    fn migrate_is_idempotent() {
        let mut conn = Connection::open_in_memory().unwrap();
        Db::migrate(&mut conn).unwrap();
        Db::migrate(&mut conn).unwrap();
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 2);
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
            })
            .unwrap()
            .unwrap();
        assert_eq!(again.created_at, saved.created_at);
        assert_ne!(again.updated_at, saved.updated_at);
    }

    // --- settings 默认值 ---

    #[test]
    fn default_settings_seed_includes_quicknote_shortcut() {
        let db = fresh_db();
        let v = db.get_setting("quicknoteShortcut").unwrap();
        assert_eq!(v.as_deref(), Some("Ctrl+Shift+M"));
        let v2 = db.get_setting("mainWindowShortcut").unwrap();
        assert_eq!(v2.as_deref(), Some("Ctrl+Shift+N"));
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
}
