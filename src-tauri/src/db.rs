// SQLite 数据访问层。Plan Task 2 Step 2–6。
//
// Commit A 落了基础设施（连接 / 路径 / v1 迁移）。
// Commit B 在此追加：notes/settings CRUD + 内容派生 + 默认设置初始化。
// 备份与同步预留在独立模块（backup.rs / sync.rs）。
//
// 业务方法仍是同步签名 + 内部 Mutex 锁；调用方（commands.rs，Task 3 实现）
// 用 `tauri::async_runtime::spawn_blocking` 包，避免阻塞 tokio runtime。
//
// 模块 dead_code allow 是过渡状态：这里所有 pub API 都是给 Task 3 的
// commands.rs 用的，目前只在 cfg(test) 里被引用，cargo check 看不到。
// 下一个 commit (plan Task 3) 落地 commands 后移除此 allow。

#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension};

use crate::models::{Note, SaveNoteRequest, SearchNotesRequest};

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
}

pub struct Db {
    conn: Mutex<Connection>,
    #[allow(dead_code)]
    db_path: PathBuf,
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
        Ok(Self {
            conn: Mutex::new(conn),
            db_path,
        })
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

// ----- 内容派生 ---------------------------------------------------------

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

/// 把 Markdown 渲染成 HTML，存到 notes.html_content 列。
/// pulldown-cmark 默认开启所有标准语法。
pub fn render_markdown(content: &str) -> String {
    use pulldown_cmark::{Parser, html};
    let parser = Parser::new(content);
    let mut output = String::new();
    html::push_html(&mut output, parser);
    output
}

// ----- tests ------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SaveNoteRequest;

    fn fresh_db() -> Db {
        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        Db::migrate(&mut conn).expect("migrate");
        Db::ensure_default_settings(&conn).expect("ensure defaults");
        Db {
            conn: Mutex::new(conn),
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
        assert_eq!(version, 1);
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
        let tags = extract_tags("see #rust and #rust again, plus 中文 #笔记", &["extra".into()]);
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
        assert_eq!(db.get_setting("themeMode").unwrap().as_deref(), Some("dark"));
        // 其它默认值未受影响
        assert_eq!(
            db.get_setting("blurCloseDelayMs").unwrap().as_deref(),
            Some("800")
        );
    }
}
