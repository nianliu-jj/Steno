# Clipboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Steno 内置粘贴板：监听复制内容、自动分类展示、默认用 `Ctrl+Shift+V` 唤出，并支持修改快捷键。

**Architecture:** 后端新增 `clipboard` 模块，负责剪贴板条目 DTO、分类、预览、去重、系统剪贴板读写和后台监听；现有 `Db` 负责持久化，现有 `shortcut` 和 `window_manager` 负责快捷键唤出主窗口并导航到粘贴板页。前端新增 `clipboard` Pinia store 和 `ClipboardView`，通过 `useDb` IPC 封装调用后端命令，并监听后端事件保持列表实时刷新。

**Tech Stack:** Tauri 2、Rust 2024、rusqlite、arboard、image、base64、Vue 3、Pinia、Naive UI、Vitest。

---

## File Structure

- Create `src-tauri/src/clipboard.rs`
  - `ClipboardEntry` / `NewClipboardEntry` DTO。
  - 纯函数：文本分类、预览、hash、图片 data URL 转换、事件名常量。
  - 系统剪贴板读写函数。
  - 后台轮询监听入口 `start_monitor(app, db)`。
- Modify `src-tauri/Cargo.toml`
  - 添加 `arboard`、`base64`、`image`。
- Modify `src-tauri/src/db.rs`
  - 迁移到 schema v3，新增 `clipboard_history` 表。
  - 添加剪贴板 CRUD / 去重 upsert 方法。
  - 默认设置新增 `clipboardShortcut`。
- Modify `src-tauri/src/commands.rs`
  - 暴露 `list_clipboard_entries`、`delete_clipboard_entry`、`clear_clipboard_entries`、`copy_clipboard_entry`。
- Modify `src-tauri/src/lib.rs`
  - 注册 `clipboard` 模块、IPC 命令、启动后台监听。
- Modify `src-tauri/src/window_manager.rs`
  - 添加 `open_clipboard`，复用主窗口导航。
- Modify `src-tauri/src/shortcut.rs`
  - 新增 `Action::OpenClipboard` 和默认 `Ctrl+Shift+V`。
- Modify `src/types/steno.ts`
  - 添加 `ClipboardContentType`、`ClipboardEntry`。
- Modify `src/composables/useDb.ts`
  - 添加剪贴板 IPC 封装。
- Create `src/stores/clipboard.ts`
  - 管理历史列表、搜索、类型筛选、事件同步和操作。
- Create `src/stores/clipboard.test.ts`
  - 覆盖加载、筛选、事件插入、删除、清空。
- Create `src/views/ClipboardView.vue`
  - 粘贴板页面 UI。
- Create `src/views/ClipboardView.test.ts`
  - 覆盖空状态、列表、筛选和复制按钮。
- Modify `src/App.vue` / `src/App.test.ts`
  - `clipboard` mode 渲染 `ClipboardView`。
- Modify `src/stores/settings.ts` / `src/stores/settings.test.ts`
  - 添加 `clipboardShortcut` 设置。
- Modify `src/views/SettingsView.vue` / `src/views/SettingsView.test.ts`
  - 快捷键页新增“粘贴板”输入项，保存后 reload。

---

### Task 1: Rust Clipboard Domain Utilities

**Files:**
- Create: `src-tauri/src/clipboard.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Write the failing tests**

Add `mod clipboard;` near the other module declarations in `src-tauri/src/lib.rs` so Rust can compile the new module.

Create `src-tauri/src/clipboard.rs` with these failing tests first:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_url_text() {
        let entry = classify_text(" https://example.com/a?q=1 ").expect("entry");
        assert_eq!(entry.content_type, "url");
        assert_eq!(entry.content, "https://example.com/a?q=1");
        assert_eq!(entry.preview, "https://example.com/a?q=1");
        assert!(entry.content_hash.starts_with("url:"));
    }

    #[test]
    fn classify_code_text() {
        let entry = classify_text("const value = 1;\nfunction run() { return value; }").expect("entry");
        assert_eq!(entry.content_type, "code");
        assert!(entry.preview.contains("const value"));
    }

    #[test]
    fn classify_existing_windows_path_as_file() {
        let current = std::env::current_dir().unwrap();
        let entry = classify_text(&current.to_string_lossy()).expect("entry");
        assert_eq!(entry.content_type, "file");
    }

    #[test]
    fn ignores_empty_text() {
        assert!(classify_text("  \n\t  ").is_none());
    }

    #[test]
    fn truncates_long_preview_on_char_boundary() {
        let content = "字".repeat(240);
        let preview = build_preview("text", &content, None);
        assert_eq!(preview.chars().count(), 160);
    }

    #[test]
    fn image_entry_uses_data_url_hash() {
        let entry = image_entry_from_data_url("data:image/png;base64,AAAA".to_string()).expect("entry");
        assert_eq!(entry.content_type, "image");
        assert_eq!(entry.preview, "图片内容");
        assert!(entry.content_hash.starts_with("image:"));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
cd src-tauri
cargo test clipboard::tests --lib
```

Expected: FAIL with unresolved names such as `classify_text`, `build_preview`, and `image_entry_from_data_url`.

- [ ] **Step 3: Add dependencies**

In `src-tauri/Cargo.toml`, add these dependencies under `[dependencies]`:

```toml
arboard = "3.6"
base64 = "0.22"
image = { version = "0.25", default-features = false, features = ["png"] }
```

- [ ] **Step 4: Implement the minimal clipboard domain code**

Replace `src-tauri/src/clipboard.rs` with this code plus the tests from Step 1 at the bottom:

```rust
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::io::Cursor;
use std::path::Path;

use arboard::{Clipboard, ImageData};
use base64::Engine;
use serde::{Deserialize, Serialize};

pub const CLIPBOARD_UPDATED_EVENT: &str = "steno:clipboard-updated";
pub const CLIPBOARD_REMOVED_EVENT: &str = "steno:clipboard-removed";
pub const CLIPBOARD_CLEARED_EVENT: &str = "steno:clipboard-cleared";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardEntry {
    pub id: String,
    pub content_type: String,
    pub content: String,
    #[serde(default)]
    pub html_content: Option<String>,
    pub preview: String,
    pub created_at: String,
    pub updated_at: String,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewClipboardEntry {
    pub content_type: String,
    pub content: String,
    pub html_content: Option<String>,
    pub preview: String,
    pub content_hash: String,
    pub size_bytes: i64,
}

pub fn classify_text(raw: &str) -> Option<NewClipboardEntry> {
    let content = normalize_text(raw);
    if content.trim().is_empty() {
        return None;
    }

    let content_type = detect_text_type(&content);
    let preview = build_preview(&content_type, &content, None);
    let content_hash = build_content_hash(&content_type, &content, None);
    let size_bytes = content.as_bytes().len() as i64;

    Some(NewClipboardEntry {
        content_type,
        content,
        html_content: None,
        preview,
        content_hash,
        size_bytes,
    })
}

pub fn image_entry_from_data_url(data_url: String) -> Option<NewClipboardEntry> {
    if !data_url.starts_with("data:image/") {
        return None;
    }
    let content_hash = build_content_hash("image", &data_url, None);
    Some(NewClipboardEntry {
        content_type: "image".to_string(),
        content: data_url.clone(),
        html_content: None,
        preview: "图片内容".to_string(),
        content_hash,
        size_bytes: data_url.as_bytes().len() as i64,
    })
}

pub fn build_preview(content_type: &str, content: &str, html_content: Option<&str>) -> String {
    let source = match content_type {
        "image" => "图片内容".to_string(),
        "rich_text" => html_content
            .map(strip_html_tags)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| content.to_string()),
        "file" => content.lines().next().unwrap_or(content).to_string(),
        _ => content.to_string(),
    };

    truncate_chars(&collapse_preview_whitespace(&source), 160)
}

pub fn build_content_hash(content_type: &str, content: &str, html_content: Option<&str>) -> String {
    let mut hasher = DefaultHasher::new();
    content_type.hash(&mut hasher);
    content.hash(&mut hasher);
    html_content.unwrap_or("").hash(&mut hasher);
    format!("{content_type}:{:016x}", hasher.finish())
}

pub fn entry_from_system_clipboard() -> Option<NewClipboardEntry> {
    let mut clipboard = Clipboard::new().ok()?;
    if let Ok(text) = clipboard.get_text() {
        if let Some(entry) = classify_text(&text) {
            return Some(entry);
        }
    }
    if let Ok(image) = clipboard.get_image() {
        if let Some(data_url) = image_data_url(image) {
            return image_entry_from_data_url(data_url);
        }
    }
    None
}

pub fn write_entry_to_system_clipboard(entry: &ClipboardEntry) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    if entry.content_type == "image" && entry.content.starts_with("data:image/") {
        let image = image_data_url_to_arboard(&entry.content)?;
        clipboard.set_image(image).map_err(|e| e.to_string())?;
        return Ok(());
    }
    clipboard
        .set_text(entry.content.clone())
        .map_err(|e| e.to_string())
}

fn normalize_text(raw: &str) -> String {
    raw.replace("\r\n", "\n").replace('\r', "\n").trim().to_string()
}

fn detect_text_type(content: &str) -> String {
    if is_existing_path_list(content) {
        return "file".to_string();
    }
    if is_url(content) {
        return "url".to_string();
    }
    if looks_like_code(content) {
        return "code".to_string();
    }
    "text".to_string()
}

fn is_url(content: &str) -> bool {
    let value = content.trim();
    if value.contains(char::is_whitespace) {
        return false;
    }
    let lower = value.to_ascii_lowercase();
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("ftp://")
        || lower.starts_with("file://")
        || lower.starts_with("www.")
}

fn looks_like_code(content: &str) -> bool {
    let lower = content.to_ascii_lowercase();
    let code_signals = [
        "function ",
        "const ",
        "let ",
        "var ",
        "class ",
        "import ",
        "export ",
        "=>",
        "fn ",
        "pub ",
        "#include",
        "SELECT ",
        "select ",
    ];
    content.lines().count() >= 2 && code_signals.iter().any(|signal| lower.contains(signal))
}

fn is_existing_path_list(content: &str) -> bool {
    let paths: Vec<&str> = content.lines().map(str::trim).filter(|line| !line.is_empty()).collect();
    !paths.is_empty() && paths.iter().all(|path| Path::new(path).exists())
}

fn collapse_preview_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

fn strip_html_tags(html: &str) -> String {
    let mut output = String::with_capacity(html.len());
    let mut inside_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => output.push(ch),
            _ => {}
        }
    }
    output
}

fn image_data_url(image: ImageData<'_>) -> Option<String> {
    let width = image.width as u32;
    let height = image.height as u32;
    let bytes = image.bytes.into_owned();
    let rgba = image::RgbaImage::from_raw(width, height, bytes)?;
    let mut png_bytes = Vec::new();
    image::DynamicImage::ImageRgba8(rgba)
        .write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png)
        .ok()?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(png_bytes);
    Some(format!("data:image/png;base64,{encoded}"))
}

fn image_data_url_to_arboard(data_url: &str) -> Result<ImageData<'static>, String> {
    let (_, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| "图片 data URL 格式无效".to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| e.to_string())?;
    let dynamic = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let rgba = dynamic.to_rgba8();
    let width = rgba.width() as usize;
    let height = rgba.height() as usize;
    Ok(ImageData {
        width,
        height,
        bytes: std::borrow::Cow::Owned(rgba.into_raw()),
    })
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```powershell
cd src-tauri
cargo test clipboard::tests --lib
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri\Cargo.toml src-tauri\Cargo.lock src-tauri\src\lib.rs src-tauri\src\clipboard.rs
git commit -m "feat: add clipboard classification utilities"
```

---

### Task 2: Clipboard Persistence In SQLite

**Files:**
- Modify: `src-tauri/src/db.rs`
- Modify: `src-tauri/src/clipboard.rs`

- [ ] **Step 1: Write the failing database tests**

In `src-tauri/src/db.rs`, add `use crate::clipboard::NewClipboardEntry;` near the existing model imports.

Append these tests inside the existing `#[cfg(test)] mod tests`:

```rust
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
fn default_settings_seed_includes_clipboard_shortcut() {
    let db = fresh_db();
    let v = db.get_setting("clipboardShortcut").unwrap();
    assert_eq!(v.as_deref(), Some("Ctrl+Shift+V"));
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
cd src-tauri
cargo test db::tests --lib
```

Expected: FAIL because `clipboard_history` and `Db::upsert_clipboard_entry` do not exist.

- [ ] **Step 3: Implement migration and row mapping**

In `src-tauri/src/db.rs`, update the imports:

```rust
use crate::clipboard::{ClipboardEntry, NewClipboardEntry};
use crate::models::{Note, SaveNoteRequest, SearchNotesRequest};
```

In `Db::migrate`, after the v2 migration block and before `Self::ensure_is_draft_column(conn)?;`, add:

```rust
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
```

In `ensure_default_settings`, add this default:

```rust
            ("clipboardShortcut", "Ctrl+Shift+V"),
```

- [ ] **Step 4: Implement persistence methods**

Inside `impl Db`, after `latest_draft`, add:

```rust
    pub fn upsert_clipboard_entry(
        &self,
        input: NewClipboardEntry,
    ) -> Result<ClipboardEntry, DbError> {
        let conn = self.lock()?;
        let now = chrono::Utc::now().to_rfc3339();
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM clipboard_history WHERE content_type = ?1 AND content_hash = ?2",
                rusqlite::params![&input.content_type, &input.content_hash],
                |row| row.get(0),
            )
            .optional()?;

        let id = existing.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let created_at = conn
            .query_row(
                "SELECT created_at FROM clipboard_history WHERE id = ?1",
                rusqlite::params![&id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .unwrap_or_else(|| now.clone());

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
        let safe_limit = limit.clamp(1, 500);
        let type_filter = content_type.unwrap_or_default();
        let query_filter = query.unwrap_or_default();
        let like = format!("%{}%", query_filter.trim());

        let mut stmt = conn.prepare(
            "SELECT id, content_type, content, html_content, preview, created_at, updated_at, size_bytes
             FROM clipboard_history
             WHERE (?1 = '' OR content_type = ?1)
               AND (?2 = '%%' OR content LIKE ?2 OR preview LIKE ?2)
             ORDER BY updated_at DESC
             LIMIT ?3",
        )?;
        let rows = stmt.query_map(
            rusqlite::params![type_filter, like, safe_limit],
            row_to_clipboard_entry,
        )?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn get_clipboard_entry(&self, id: &str) -> Result<Option<ClipboardEntry>, DbError> {
        let conn = self.lock()?;
        match Self::find_clipboard_entry(&conn, id) {
            Ok(entry) => Ok(Some(entry)),
            Err(DbError::NotFound(_)) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn delete_clipboard_entry(&self, id: &str) -> Result<(), DbError> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM clipboard_history WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }

    pub fn clear_clipboard_entries(&self) -> Result<(), DbError> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM clipboard_history", [])?;
        Ok(())
    }

    fn find_clipboard_entry(
        conn: &Connection,
        id: &str,
    ) -> Result<ClipboardEntry, DbError> {
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
```

After `row_to_note`, add:

```rust
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```powershell
cd src-tauri
cargo test db::tests --lib
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri\src\db.rs
git commit -m "feat: persist clipboard history"
```

---

### Task 3: Clipboard IPC Commands And Backend Wiring

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/clipboard.rs`

- [ ] **Step 1: Write the failing command-support tests**

Add these tests to `src-tauri/src/clipboard.rs` inside the existing test module:

```rust
#[test]
fn should_process_hash_skips_unchanged_clipboard_content() {
    assert!(!should_process_hash(Some("text:abc"), "text:abc"));
}

#[test]
fn should_process_hash_accepts_first_or_changed_clipboard_content() {
    assert!(should_process_hash(None, "text:abc"));
    assert!(should_process_hash(Some("text:abc"), "text:def"));
}
```

- [ ] **Step 2: Run tests to verify baseline**

Run:

```powershell
cd src-tauri
cargo test clipboard::tests --lib
```

Expected: FAIL because `should_process_hash` is missing.

- [ ] **Step 3: Add IPC commands**

In `src-tauri/src/commands.rs`, update imports:

```rust
use tauri::{AppHandle, Emitter, State};

use crate::clipboard::{self, ClipboardEntry};
use crate::db::Db;
use crate::export;
```

Add these commands after the settings commands:

```rust
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
pub async fn copy_clipboard_entry(db: State<'_, Db>, id: String) -> Result<(), String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let entry = db
            .get_clipboard_entry(&id)
            .map_err(to_msg)?
            .ok_or_else(|| format!("剪贴板条目不存在：{id}"))?;
        clipboard::write_entry_to_system_clipboard(&entry)
    })
    .await
    .map_err(to_msg)?
}
```

- [ ] **Step 4: Register backend module, commands, and monitor**

In `src-tauri/src/clipboard.rs`, add the monitor imports:

```rust
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::db::Db;
```

Add this function after `write_entry_to_system_clipboard`:

```rust
pub fn should_process_hash(last_hash: Option<&str>, next_hash: &str) -> bool {
    last_hash != Some(next_hash)
}

pub fn start_monitor(app: AppHandle, db: Db) {
    thread::spawn(move || {
        let mut last_hash = entry_from_system_clipboard().map(|entry| entry.content_hash);
        loop {
            thread::sleep(Duration::from_millis(600));
            let Some(entry) = entry_from_system_clipboard() else {
                continue;
            };
            if !should_process_hash(last_hash.as_deref(), &entry.content_hash) {
                continue;
            }
            last_hash = Some(entry.content_hash.clone());
            match db.upsert_clipboard_entry(entry) {
                Ok(saved) => {
                    let _ = app.emit(CLIPBOARD_UPDATED_EVENT, saved);
                }
                Err(error) => {
                    eprintln!("[clipboard] failed to save clipboard entry: {error}");
                }
            }
        }
    });
}
```

In `src-tauri/src/lib.rs`, ensure `mod clipboard;` is present.

Add these command names to `tauri::generate_handler![...]` after `commands::set_setting`:

```rust
            commands::list_clipboard_entries,
            commands::delete_clipboard_entry,
            commands::clear_clipboard_entries,
            commands::copy_clipboard_entry,
```

In `.setup`, after `shortcut::register_from_settings(app.handle(), &database)?;`, start the monitor:

```rust
            clipboard::start_monitor(app.handle().clone(), database.clone());
```

- [ ] **Step 5: Run Rust checks**

Run:

```powershell
cd src-tauri
cargo test --lib
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri\src\commands.rs src-tauri\src\lib.rs src-tauri\src\clipboard.rs
git commit -m "feat: expose clipboard history commands"
```

---

### Task 4: Clipboard Shortcut And Navigation

**Files:**
- Modify: `src-tauri/src/shortcut.rs`
- Modify: `src-tauri/src/window_manager.rs`

- [ ] **Step 1: Write the failing shortcut tests**

In `src-tauri/src/shortcut.rs`, add these tests to the existing test module:

```rust
#[test]
fn parse_ctrl_shift_v_for_clipboard() {
    let sc = parse_shortcut("Ctrl+Shift+V").expect("parse");
    assert_eq!(sc, clipboard_shortcut());
}

#[test]
fn clipboard_shortcut_default_uses_ctrl_shift_v() {
    assert_eq!(
        clipboard_shortcut(),
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyV),
    );
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
cd src-tauri
cargo test shortcut::tests --lib
```

Expected: FAIL because `clipboard_shortcut` is missing.

- [ ] **Step 3: Implement shortcut action**

In `src-tauri/src/shortcut.rs`, add this default function after `quicknote_shortcut`:

```rust
pub fn clipboard_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyV)
}
```

Change the `Action` enum:

```rust
enum Action {
    ToggleMain,
    ToggleQuicknote,
    OpenClipboard,
}
```

In the plugin handler match, add:

```rust
                Some(Action::OpenClipboard) => {
                    let _ = window_manager::open_clipboard(app);
                }
```

In `register_from_settings`, read and register `clipboardShortcut`:

```rust
    let clipboard_str = db
        .get_setting("clipboardShortcut")?
        .unwrap_or_else(|| "Ctrl+Shift+V".to_string());

    let clipboard_sc = parse_shortcut(&clipboard_str).unwrap_or_else(clipboard_shortcut);
```

Replace `set_registry(vec![...])` with:

```rust
    set_registry(vec![
        (main_sc, Action::ToggleMain),
        (quicknote_sc, Action::ToggleQuicknote),
        (clipboard_sc, Action::OpenClipboard),
    ])?;
```

Add registration:

```rust
    app.global_shortcut().register(clipboard_sc)?;
```

- [ ] **Step 4: Implement window navigation helper**

In `src-tauri/src/window_manager.rs`, add:

```rust
pub fn open_clipboard(app: &AppHandle) -> tauri::Result<()> {
    navigate_main(app, "clipboard", None)
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
cd src-tauri
cargo test shortcut::tests window_manager::tests --lib
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri\src\shortcut.rs src-tauri\src\window_manager.rs
git commit -m "feat: add clipboard global shortcut"
```

---

### Task 5: Frontend Types, IPC Wrappers, And Settings Store

**Files:**
- Modify: `src/types/steno.ts`
- Modify: `src/composables/useDb.ts`
- Modify: `src/stores/settings.ts`
- Modify: `src/stores/settings.test.ts`

- [ ] **Step 1: Write the failing settings store test**

Add this test to `src/stores/settings.test.ts`:

```ts
it('loads and persists the clipboard shortcut setting', async () => {
  dbGetSettingMock.mockImplementation(async (key: string) => {
    const map: Record<string, string | null> = {
      clipboardShortcut: 'Alt+C',
    };
    return map[key] ?? null;
  });

  const store = useSettingsStore();
  await store.load();

  expect(store.state.clipboardShortcut).toBe('Alt+C');

  await store.update('clipboardShortcut', 'Ctrl+Shift+V');
  expect(dbSetSettingMock).toHaveBeenCalledWith('clipboardShortcut', 'Ctrl+Shift+V');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm exec vitest run src/stores/settings.test.ts
```

Expected: FAIL because `clipboardShortcut` is not part of `StenoSettings`.

- [ ] **Step 3: Add frontend clipboard types**

Append to `src/types/steno.ts` before the `WindowMode` section:

```ts
export type ClipboardContentType = 'text' | 'url' | 'code' | 'image' | 'file' | 'rich_text';

export interface ClipboardEntry {
  id: string;
  contentType: ClipboardContentType;
  content: string;
  htmlContent?: string | null;
  preview: string;
  createdAt: string;
  updatedAt: string;
  sizeBytes: number;
}
```

- [ ] **Step 4: Add IPC wrappers**

In `src/composables/useDb.ts`, import `ClipboardEntry`:

```ts
  ClipboardEntry,
```

Add these functions before the settings section:

```ts
  function listClipboardEntries(args?: {
    limit?: number;
    contentType?: string | null;
    query?: string | null;
  }) {
    return invoke<ClipboardEntry[]>('list_clipboard_entries', {
      limit: args?.limit ?? 200,
      contentType: args?.contentType ?? null,
      query: args?.query ?? null,
    });
  }

  function deleteClipboardEntry(id: string) {
    return invoke<void>('delete_clipboard_entry', { id });
  }

  function clearClipboardEntries() {
    return invoke<void>('clear_clipboard_entries');
  }

  function copyClipboardEntry(id: string) {
    return invoke<void>('copy_clipboard_entry', { id });
  }
```

Add them to the returned object:

```ts
    listClipboardEntries,
    deleteClipboardEntry,
    clearClipboardEntries,
    copyClipboardEntry,
```

- [ ] **Step 5: Add settings field**

In `src/stores/settings.ts`, add to `StenoSettings`:

```ts
  /** 粘贴板浮窗 / 页面入口的全局快捷键。 */
  clipboardShortcut: string;
```

Add to `DEFAULTS`:

```ts
  clipboardShortcut: 'Ctrl+Shift+V',
```

No custom decode branch is needed because shortcut values are strings and the default branch returns `raw`.

- [ ] **Step 6: Run test**

Run:

```powershell
pnpm exec vitest run src/stores/settings.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src\types\steno.ts src\composables\useDb.ts src\stores\settings.ts src\stores\settings.test.ts
git commit -m "feat: add clipboard frontend contracts"
```

---

### Task 6: Clipboard Pinia Store

**Files:**
- Create: `src/stores/clipboard.ts`
- Create: `src/stores/clipboard.test.ts`

- [ ] **Step 1: Write the failing store tests**

Create `src/stores/clipboard.test.ts`:

```ts
// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClipboardEntry } from '@/types/steno';
import { useClipboardStore } from './clipboard';

const listeners = new Map<string, (event: { payload: unknown }) => void>();
const listClipboardEntries = vi.fn<() => Promise<ClipboardEntry[]>>();
const deleteClipboardEntry = vi.fn<(id: string) => Promise<void>>();
const clearClipboardEntries = vi.fn<() => Promise<void>>();
const copyClipboardEntry = vi.fn<(id: string) => Promise<void>>();

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    listeners.set(event, handler);
    return () => listeners.delete(event);
  }),
}));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    listClipboardEntries,
    deleteClipboardEntry,
    clearClipboardEntries,
    copyClipboardEntry,
  }),
}));

const textEntry: ClipboardEntry = {
  id: '1',
  contentType: 'text',
  content: 'hello',
  htmlContent: null,
  preview: 'hello',
  createdAt: '2026-05-25T00:00:00Z',
  updatedAt: '2026-05-25T00:00:00Z',
  sizeBytes: 5,
};

const urlEntry: ClipboardEntry = {
  id: '2',
  contentType: 'url',
  content: 'https://example.com',
  htmlContent: null,
  preview: 'https://example.com',
  createdAt: '2026-05-25T00:00:01Z',
  updatedAt: '2026-05-25T00:00:01Z',
  sizeBytes: 19,
};

describe('clipboard store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listeners.clear();
    listClipboardEntries.mockReset();
    deleteClipboardEntry.mockReset();
    clearClipboardEntries.mockReset();
    copyClipboardEntry.mockReset();
    listClipboardEntries.mockResolvedValue([textEntry, urlEntry]);
    deleteClipboardEntry.mockResolvedValue();
    clearClipboardEntries.mockResolvedValue();
    copyClipboardEntry.mockResolvedValue();
  });

  it('loads clipboard entries from the db adapter', async () => {
    const store = useClipboardStore();
    await store.load();

    expect(listClipboardEntries).toHaveBeenCalledWith({
      limit: 200,
      contentType: null,
      query: '',
    });
    expect(store.entries).toEqual([textEntry, urlEntry]);
  });

  it('filters entries by type and query locally', async () => {
    const store = useClipboardStore();
    await store.load();

    store.typeFilter = 'url';
    expect(store.filteredEntries).toEqual([urlEntry]);

    store.typeFilter = null;
    store.query = 'hello';
    expect(store.filteredEntries).toEqual([textEntry]);
  });

  it('syncs entries from backend events', async () => {
    const store = useClipboardStore();
    await store.startEventListeners();

    listeners.get('steno:clipboard-updated')?.({ payload: urlEntry });
    expect(store.entries[0]).toEqual(urlEntry);

    listeners.get('steno:clipboard-removed')?.({ payload: '2' });
    expect(store.entries.some(entry => entry.id === '2')).toBe(false);

    listeners.get('steno:clipboard-cleared')?.({ payload: null });
    expect(store.entries).toEqual([]);
  });

  it('delegates copy delete and clear operations', async () => {
    const store = useClipboardStore();
    await store.load();

    await store.copyEntry('1');
    await store.deleteEntry('1');
    await store.clearEntries();

    expect(copyClipboardEntry).toHaveBeenCalledWith('1');
    expect(deleteClipboardEntry).toHaveBeenCalledWith('1');
    expect(clearClipboardEntries).toHaveBeenCalledOnce();
    expect(store.entries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
pnpm exec vitest run src/stores/clipboard.test.ts
```

Expected: FAIL because `src/stores/clipboard.ts` does not exist.

- [ ] **Step 3: Implement the store**

Create `src/stores/clipboard.ts`:

```ts
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { listen } from '@tauri-apps/api/event';

import { useDb } from '@/composables/useDb';
import type { ClipboardContentType, ClipboardEntry } from '@/types/steno';

const UPDATED_EVENT = 'steno:clipboard-updated';
const REMOVED_EVENT = 'steno:clipboard-removed';
const CLEARED_EVENT = 'steno:clipboard-cleared';

export const useClipboardStore = defineStore('clipboard', () => {
  const db = useDb();
  const entries = ref<ClipboardEntry[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const query = ref('');
  const typeFilter = ref<ClipboardContentType | null>(null);
  const listenersStarted = ref(false);
  const unlisteners: Array<() => void> = [];

  const filteredEntries = computed(() => {
    const term = query.value.trim().toLowerCase();
    return entries.value.filter(entry => {
      if (typeFilter.value && entry.contentType !== typeFilter.value) return false;
      if (!term) return true;
      return `${entry.preview} ${entry.content}`.toLowerCase().includes(term);
    });
  });

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      entries.value = await db.listClipboardEntries({
        limit: 200,
        contentType: typeFilter.value,
        query: query.value,
      });
    } catch (e) {
      error.value = String(e);
      entries.value = [];
    } finally {
      loading.value = false;
    }
  }

  function upsertLocal(entry: ClipboardEntry) {
    entries.value = [entry, ...entries.value.filter(item => item.id !== entry.id)].slice(0, 200);
  }

  async function startEventListeners() {
    if (listenersStarted.value) return;
    listenersStarted.value = true;
    try {
      unlisteners.push(
        await listen<ClipboardEntry>(UPDATED_EVENT, event => {
          upsertLocal(event.payload);
        }),
      );
      unlisteners.push(
        await listen<string>(REMOVED_EVENT, event => {
          entries.value = entries.value.filter(entry => entry.id !== event.payload);
        }),
      );
      unlisteners.push(
        await listen(CLEARED_EVENT, () => {
          entries.value = [];
        }),
      );
    } catch (e) {
      listenersStarted.value = false;
      error.value = String(e);
    }
  }

  function stopEventListeners() {
    while (unlisteners.length) {
      unlisteners.pop()?.();
    }
    listenersStarted.value = false;
  }

  async function copyEntry(id: string) {
    await db.copyClipboardEntry(id);
  }

  async function deleteEntry(id: string) {
    await db.deleteClipboardEntry(id);
    entries.value = entries.value.filter(entry => entry.id !== id);
  }

  async function clearEntries() {
    await db.clearClipboardEntries();
    entries.value = [];
  }

  return {
    entries,
    loading,
    error,
    query,
    typeFilter,
    filteredEntries,
    load,
    startEventListeners,
    stopEventListeners,
    copyEntry,
    deleteEntry,
    clearEntries,
  };
});
```

- [ ] **Step 4: Run tests**

Run:

```powershell
pnpm exec vitest run src/stores/clipboard.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src\stores\clipboard.ts src\stores\clipboard.test.ts
git commit -m "feat: add clipboard store"
```

---

### Task 7: Clipboard View UI

**Files:**
- Create: `src/views/ClipboardView.vue`
- Create: `src/views/ClipboardView.test.ts`

- [ ] **Step 1: Write the failing view tests**

Create `src/views/ClipboardView.test.ts`:

```ts
// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ClipboardView from './ClipboardView.vue';
import { useClipboardStore } from '@/stores/clipboard';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
}));

const listClipboardEntries = vi.fn(async () => []);
const deleteClipboardEntry = vi.fn(async () => {});
const clearClipboardEntries = vi.fn(async () => {});
const copyClipboardEntry = vi.fn(async () => {});

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    listClipboardEntries,
    deleteClipboardEntry,
    clearClipboardEntries,
    copyClipboardEntry,
  }),
}));

describe('ClipboardView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listClipboardEntries.mockResolvedValue([]);
    copyClipboardEntry.mockClear();
  });

  it('renders an empty state when there is no clipboard history', async () => {
    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    expect(wrapper.text()).toContain('暂无剪贴板记录');
    expect(wrapper.get('[data-testid="clipboard-search"]').exists()).toBe(true);
  });

  it('renders entries and delegates copy action', async () => {
    listClipboardEntries.mockResolvedValueOnce([
      {
        id: '1',
        contentType: 'url',
        content: 'https://example.com',
        htmlContent: null,
        preview: 'https://example.com',
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        sizeBytes: 19,
      },
    ]);

    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    expect(wrapper.text()).toContain('链接');
    expect(wrapper.text()).toContain('https://example.com');
    await wrapper.get('[data-testid="clipboard-copy-1"]').trigger('click');
    expect(copyClipboardEntry).toHaveBeenCalledWith('1');
  });

  it('filters visible entries by type button', async () => {
    listClipboardEntries.mockResolvedValueOnce([
      {
        id: '1',
        contentType: 'text',
        content: 'hello',
        htmlContent: null,
        preview: 'hello',
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        sizeBytes: 5,
      },
      {
        id: '2',
        contentType: 'code',
        content: 'const a = 1;',
        htmlContent: null,
        preview: 'const a = 1;',
        createdAt: '2026-05-25T00:00:01Z',
        updatedAt: '2026-05-25T00:00:01Z',
        sizeBytes: 12,
      },
    ]);

    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="clipboard-filter-code"]').trigger('click');
    const store = useClipboardStore();
    expect(store.typeFilter).toBe('code');
    expect(wrapper.text()).toContain('const a = 1;');
    expect(wrapper.text()).not.toContain('hello');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
pnpm exec vitest run src/views/ClipboardView.test.ts
```

Expected: FAIL because `ClipboardView.vue` does not exist.

- [ ] **Step 3: Implement ClipboardView**

Create `src/views/ClipboardView.vue`:

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';

import { useClipboardStore } from '@/stores/clipboard';
import type { ClipboardContentType, ClipboardEntry } from '@/types/steno';

const store = useClipboardStore();

const filters: Array<{ label: string; value: ClipboardContentType | null; testid: string }> = [
  { label: '全部', value: null, testid: 'all' },
  { label: '文本', value: 'text', testid: 'text' },
  { label: '链接', value: 'url', testid: 'url' },
  { label: '代码', value: 'code', testid: 'code' },
  { label: '图片', value: 'image', testid: 'image' },
  { label: '文件', value: 'file', testid: 'file' },
  { label: '富文本', value: 'rich_text', testid: 'rich_text' },
];

const countLabel = computed(() => `${store.filteredEntries.length} 条`);

onMounted(() => {
  void store.startEventListeners();
  void store.load();
});

onBeforeUnmount(() => {
  store.stopEventListeners();
});

function typeLabel(type: ClipboardContentType) {
  switch (type) {
    case 'url':
      return '链接';
    case 'code':
      return '代码';
    case 'image':
      return '图片';
    case 'file':
      return '文件';
    case 'rich_text':
      return '富文本';
    case 'text':
      return '文本';
  }
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function previewLines(entry: ClipboardEntry) {
  return entry.preview || entry.content;
}

function setFilter(value: ClipboardContentType | null) {
  store.typeFilter = value;
}
</script>

<template>
  <section class="clipboard-view">
    <header class="clipboard-toolbar">
      <div class="clipboard-title">
        <h1>粘贴板</h1>
        <p>{{ countLabel }}</p>
      </div>
      <label class="clipboard-search">
        <span>搜索</span>
        <input
          v-model="store.query"
          data-testid="clipboard-search"
          type="search"
          placeholder="搜索剪贴板内容"
        >
      </label>
    </header>

    <nav class="clipboard-filters" aria-label="剪贴板类型筛选">
      <button
        v-for="filter in filters"
        :key="filter.testid"
        class="clipboard-filter"
        :class="{ 'clipboard-filter--active': store.typeFilter === filter.value }"
        type="button"
        :data-testid="`clipboard-filter-${filter.testid}`"
        @click="setFilter(filter.value)"
      >
        {{ filter.label }}
      </button>
    </nav>

    <div v-if="store.error" class="clipboard-error" role="alert">
      {{ store.error }}
    </div>

    <div v-if="!store.loading && store.filteredEntries.length === 0" class="clipboard-empty">
      <strong>暂无剪贴板记录</strong>
      <span>复制文本、链接、代码、图片或文件路径后会显示在这里。</span>
    </div>

    <div v-else class="clipboard-list">
      <article
        v-for="entry in store.filteredEntries"
        :key="entry.id"
        class="clipboard-item"
        :data-type="entry.contentType"
      >
        <div class="clipboard-item__main">
          <div class="clipboard-item__meta">
            <span class="clipboard-type">{{ typeLabel(entry.contentType) }}</span>
            <time>{{ formatTime(entry.updatedAt) }}</time>
          </div>
          <img
            v-if="entry.contentType === 'image'"
            class="clipboard-image"
            :src="entry.content"
            alt="剪贴板图片预览"
          >
          <pre v-else class="clipboard-preview">{{ previewLines(entry) }}</pre>
        </div>
        <div class="clipboard-actions">
          <button
            type="button"
            :data-testid="`clipboard-copy-${entry.id}`"
            title="复制"
            @click="store.copyEntry(entry.id)"
          >
            复制
          </button>
          <button type="button" title="删除" @click="store.deleteEntry(entry.id)">
            删除
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.clipboard-view {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  color: var(--app-fg);
}

.clipboard-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.clipboard-title h1,
.clipboard-title p {
  margin: 0;
}

.clipboard-title h1 {
  font-size: 18px;
  font-weight: 650;
}

.clipboard-title p {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 12px;
}

.clipboard-search {
  width: min(360px, 48vw);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
}

.clipboard-search span {
  color: var(--app-muted);
  font-size: 12px;
}

.clipboard-search input {
  flex: 1;
  min-width: 0;
  height: 32px;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
}

.clipboard-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.clipboard-filter {
  min-height: 30px;
  padding: 0 11px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-surface);
  color: var(--app-muted);
  cursor: pointer;
}

.clipboard-filter--active {
  border-color: var(--app-accent);
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.clipboard-empty,
.clipboard-error {
  margin: auto;
  display: grid;
  gap: 6px;
  text-align: center;
  color: var(--app-muted);
}

.clipboard-empty strong {
  color: var(--app-fg);
  font-size: 16px;
}

.clipboard-list {
  min-height: 0;
  display: grid;
  gap: 8px;
  overflow: auto;
}

.clipboard-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
}

.clipboard-item__main {
  min-width: 0;
  display: grid;
  gap: 8px;
}

.clipboard-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-muted);
  font-size: 12px;
}

.clipboard-type {
  color: var(--app-accent);
  font-weight: 650;
}

.clipboard-preview {
  max-height: 88px;
  margin: 0;
  overflow: hidden;
  color: var(--app-fg);
  font: 13px/1.5 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.clipboard-image {
  width: min(220px, 100%);
  max-height: 140px;
  object-fit: contain;
  border-radius: 6px;
  background: var(--app-bg);
}

.clipboard-actions {
  display: flex;
  align-items: start;
  gap: 6px;
}

.clipboard-actions button {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg);
  color: var(--app-fg);
  cursor: pointer;
}

@media (max-width: 720px) {
  .clipboard-toolbar,
  .clipboard-item {
    grid-template-columns: 1fr;
    display: grid;
  }

  .clipboard-search {
    width: 100%;
  }
}
</style>
```

- [ ] **Step 4: Run tests**

Run:

```powershell
pnpm exec vitest run src/views/ClipboardView.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src\views\ClipboardView.vue src\views\ClipboardView.test.ts
git commit -m "feat: add clipboard view"
```

---

### Task 8: App Route Integration

**Files:**
- Modify: `src/App.vue`
- Modify: `src/App.test.ts`

- [ ] **Step 1: Write the failing App test**

In `src/App.test.ts`, add a mock for `ClipboardView.vue` near the other view mocks:

```ts
vi.mock('@/views/ClipboardView.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'clipboard-view' }, 'clipboard-view'),
    }),
  };
});
```

Add this test:

```ts
it('renders the clipboard view for clipboard mode instead of the placeholder', () => {
  uiState.mode = 'clipboard';

  const wrapper = mount(App);

  expect(wrapper.find('[data-testid="shell"]').exists()).toBe(true);
  expect(wrapper.find('[data-testid="clipboard-view"]').exists()).toBe(true);
  expect(wrapper.find('[data-testid="placeholder-view"]').exists()).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm exec vitest run src/App.test.ts
```

Expected: FAIL because `App.vue` still renders `PlaceholderView` for clipboard mode.

- [ ] **Step 3: Render ClipboardView**

In `src/App.vue`, import the new view:

```ts
import ClipboardView from '@/views/ClipboardView.vue';
```

Remove the `case 'clipboard'` branch from `placeholderMeta`.

In the shell template, add `ClipboardView` before `PlaceholderView`:

```vue
            <CanvasView v-else-if="ui.mode === 'canvas'" />
            <ClipboardView v-else-if="ui.mode === 'clipboard'" />
            <PlaceholderView
              v-else-if="placeholderMeta"
              :title="placeholderMeta.title"
              :description="placeholderMeta.description"
            />
```

- [ ] **Step 4: Run test**

Run:

```powershell
pnpm exec vitest run src/App.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src\App.vue src\App.test.ts
git commit -m "feat: route clipboard page"
```

---

### Task 9: Settings UI For Clipboard Shortcut

**Files:**
- Modify: `src/views/SettingsView.vue`
- Modify: `src/views/SettingsView.test.ts`

- [ ] **Step 1: Write failing SettingsView tests**

In `src/views/SettingsView.test.ts`, update the mocked settings state to include:

```ts
      clipboardShortcut: 'Ctrl+Shift+V',
```

In the section switching test, after checking “搜索”, add:

```ts
    expect(wrapper.text()).toContain('粘贴板');
```

Add this test:

```ts
it('saves the clipboard shortcut and reloads global shortcuts', async () => {
  const wrapper = mountSettingsView();
  await flushPromises();

  await wrapper.get('[data-testid="settings-tab-shortcuts"]').trigger('click');
  const input = wrapper.get('[data-testid="clipboard-shortcut-input"] input');
  await input.setValue('Alt+C');
  await input.trigger('keydown.enter');
  await flushPromises();

  expect(updateSetting).toHaveBeenCalledWith('clipboardShortcut', 'Alt+C');
  expect(reloadShortcuts).toHaveBeenCalledOnce();
  expect(messageSuccess).toHaveBeenCalledWith('已更新「粘贴板快捷键」');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm exec vitest run src/views/SettingsView.test.ts
```

Expected: FAIL because the clipboard shortcut input is missing.

- [ ] **Step 3: Update SettingsView script**

In `src/views/SettingsView.vue`, add local state:

```ts
const clipboardShortcut = ref('');
```

Update `syncShortcutLocals`:

```ts
function syncShortcutLocals() {
  mainShortcut.value = settings.state.mainWindowShortcut;
  quicknoteShortcut.value = settings.state.quicknoteShortcut;
  clipboardShortcut.value = settings.state.clipboardShortcut;
  searchShortcut.value = settings.state.searchShortcut;
}
```

Update `commitShortcut` key type:

```ts
async function commitShortcut(
  key: 'mainWindowShortcut' | 'quicknoteShortcut' | 'clipboardShortcut' | 'searchShortcut',
  value: string,
) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === settings.state[key]) return;
  const previous = settings.state[key];
  try {
    await settings.update(key, trimmed);
    if (key !== 'searchShortcut') {
      await db.reloadShortcuts();
    }
    message.success(`已更新「${labelOf(key)}」`);
  } catch (e) {
    try {
      await settings.update(key, previous);
      if (key !== 'searchShortcut') {
        await db.reloadShortcuts();
      }
    } catch {
      // 回滚失败时让用户看到原始保存错误。
    }
    message.error(`快捷键保存失败：${String(e)}`);
    syncShortcutLocals();
  }
}
```

Update `labelOf`:

```ts
function labelOf(
  key: 'mainWindowShortcut' | 'quicknoteShortcut' | 'clipboardShortcut' | 'searchShortcut',
) {
  switch (key) {
    case 'mainWindowShortcut':
      return '主窗口快捷键';
    case 'quicknoteShortcut':
      return '速记浮窗快捷键';
    case 'clipboardShortcut':
      return '粘贴板快捷键';
    case 'searchShortcut':
      return '搜索快捷键';
  }
}
```

- [ ] **Step 4: Add SettingsView template row**

In the shortcuts section, between “速记浮窗” and “搜索”, add:

```vue
          <div class="settings-row">
            <div class="settings-row__meta">
              <strong>粘贴板</strong>
              <p>呼出 Steno 主窗口并打开粘贴板历史。</p>
            </div>
            <NInput
              v-model:value="clipboardShortcut"
              class="settings-control"
              data-testid="clipboard-shortcut-input"
              placeholder="Ctrl+Shift+V"
              size="small"
              @blur="commitShortcut('clipboardShortcut', clipboardShortcut)"
              @keydown.enter="commitShortcut('clipboardShortcut', clipboardShortcut)"
            />
          </div>
```

- [ ] **Step 5: Run SettingsView tests**

Run:

```powershell
pnpm exec vitest run src/views/SettingsView.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src\views\SettingsView.vue src\views\SettingsView.test.ts
git commit -m "feat: configure clipboard shortcut"
```

---

### Task 10: Verification And Integration Cleanup

**Files:**
- Review all changed files.

- [ ] **Step 1: Run focused frontend tests**

Run:

```powershell
pnpm exec vitest run src/stores/settings.test.ts src/stores/clipboard.test.ts src/views/ClipboardView.test.ts src/views/SettingsView.test.ts src/App.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run Rust tests**

Run:

```powershell
cd src-tauri
cargo test --lib
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run frontend build**

Run:

```powershell
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Run full git diff review**

Run:

```powershell
git diff --stat HEAD~10..HEAD
git status --short
```

Expected: changed files match this plan, and `git status --short` is clean.

- [ ] **Step 6: Manual smoke test**

Run the app:

```powershell
pnpm tauri:dev
```

Expected behavior:

- Copy `hello clipboard` in another app.
- Press `Ctrl+Shift+V`.
- Steno main window appears on the “粘贴板” page.
- A “文本” entry with preview `hello clipboard` appears.
- Copy `https://example.com`; a “链接” entry appears.
- Change “粘贴板” shortcut in Settings → 快捷键 to `Alt+C`.
- Press `Alt+C`; Steno opens the粘贴板 page.
- Press old `Ctrl+Shift+V`; it no longer opens the粘贴板 page if the new shortcut registered successfully.

- [ ] **Step 7: Commit final verification note if any cleanup changed files**

If Step 1-6 caused no file changes, do not create an empty commit. If cleanup edits were needed, commit them:

```powershell
git add .
git commit -m "chore: verify clipboard feature"
```

---

## Self-Review

Spec coverage:

- 复制监听：Task 1 and Task 3 implement `start_monitor`.
- 分类：Task 1 implements text, url, code, image, file classification.
- 历史展示：Task 6 and Task 7 implement store and view.
- `Ctrl+Shift+V` 唤出：Task 4 implements shortcut and navigation.
- 快捷键可配置：Task 5 and Task 9 implement settings state and UI.
- 基础复制/删除/清空：Task 3, Task 6, and Task 7 implement commands, store actions, and buttons.

Placeholder scan:

- No placeholder markers or undefined implementation steps remain.
- Each code-changing step includes the concrete code to add or replace.

Type consistency:

- Rust uses `content_type` internally and serializes to `contentType` through `serde(rename_all = "camelCase")`.
- Frontend uses `ClipboardEntry.contentType`, matching Tauri serialization.
- Events use `steno:clipboard-updated`, `steno:clipboard-removed`, and `steno:clipboard-cleared` consistently across Rust and TypeScript.
