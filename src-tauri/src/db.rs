// SQLite 数据访问层。Plan Task 2 Step 2/3。
//
// 这是 Commit A 的范围：仅基础设施 —— 连接 / 路径 / 迁移。
// notes/settings 的 CRUD、内容派生、备份在后续 commit。

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::Connection;

/// 数据库错误统一类型。setup() 期望返回 Box<dyn Error + Send + Sync>，
/// thiserror 自动为我们派生 std::error::Error + Send + Sync。
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
}

/// 进程内单例数据库句柄。Tauri builder.setup 里 app.manage(Db) 注入。
/// commands.rs 通过 `tauri::State<'_, Db>` 取用。
///
/// 同步 Mutex 包裹 rusqlite::Connection：rusqlite 本身是 Sync 但不 Send/Sync
/// 同时具备的方式取决于使用模式；用 Mutex<Connection> 是 plan/官方推荐做法。
/// 业务方法用 `tauri::async_runtime::spawn_blocking` 包，避免阻塞 tokio runtime。
pub struct Db {
    conn: Mutex<Connection>,
    /// 备份/调试用。当前迁移逻辑不直接读这个字段。
    #[allow(dead_code)]
    db_path: PathBuf,
}

impl Db {
    /// 解析 `~/.steno`，创建（含父目录）后返回。
    /// 默认路径来自 OpenSpec local-data spec：`~/.steno/data.db`。
    pub fn data_dir() -> Result<PathBuf, DbError> {
        let home = dirs::home_dir().ok_or(DbError::NoHomeDir)?;
        let dir = home.join(".steno");
        std::fs::create_dir_all(&dir)?;
        Ok(dir)
    }

    pub fn db_path_for(dir: &Path) -> PathBuf {
        dir.join("data.db")
    }

    /// 在 setup 里调用：解析路径 → 打开/创建数据库 → 跑迁移 → 返回句柄。
    pub fn init() -> Result<Self, DbError> {
        let dir = Self::data_dir()?;
        let db_path = Self::db_path_for(&dir);
        let mut conn = Connection::open(&db_path)?;
        // 启用外键约束（SQLite 默认关闭）。未来 notes ↔ tags 关联表会用到。
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Self::migrate(&mut conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            db_path,
        })
    }

    /// 业务方法（CRUD/搜索/设置）通过此方法获取连接锁。
    #[allow(dead_code)]
    pub fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, DbError> {
        self.conn.lock().map_err(|_| DbError::Poisoned)
    }

    /// 按 PRAGMA user_version 顺序跑迁移。
    /// v0 → v1：建 notes / settings 表 + 索引。
    /// 后续要加表/列时在此追加 `if version < 2 { ... v2 ... }` 分支。
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
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 用 in-memory SQLite + 直接调用 migrate 验证 schema 落地。
    /// 避免依赖 ~/.steno 真实文件系统。
    fn fresh_in_memory() -> Connection {
        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        Db::migrate(&mut conn).expect("migrate v0->v1");
        conn
    }

    #[test]
    fn migrate_creates_notes_and_settings_tables() {
        let conn = fresh_in_memory();
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap();
        let tables: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert!(tables.contains(&"notes".to_string()), "notes table missing");
        assert!(
            tables.contains(&"settings".to_string()),
            "settings table missing"
        );
    }

    #[test]
    fn migrate_creates_expected_indexes() {
        let conn = fresh_in_memory();
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
        Db::migrate(&mut conn).expect("first migrate");
        // 第二次调用应直接跳过（user_version 已是 1）。
        Db::migrate(&mut conn).expect("second migrate is a no-op");
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 1);
    }
}
