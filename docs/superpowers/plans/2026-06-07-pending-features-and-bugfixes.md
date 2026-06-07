# 待实现功能与缺陷修复 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地《待实现功能》清单：后端文件日志 + 草稿/粘贴板定时清理，编辑器标题即时渲染/快捷键/图片光标修复，编辑页布局与 Zen 回显修复，列表 Zen 入口与红色徽章。

**Architecture:** 后端新增 `logging.rs`（`log` facade + 自定义文件 Logger）与 `cleanup_scheduler.rs`（仿 `reminder_scheduler` 的周期任务），复用现有 `Db`/settings；前端改动集中在 ProseMirror 插件（input-rules/keymap/paste）与三个视图（NoteEditorView/ZenMode/MainView）及 settings store。纯增量，不改数据库 schema。

**Tech Stack:** Rust + Tauri 2 + rusqlite + chrono + log crate；Vue 3 + Pinia + Naive UI + ProseMirror + Vitest。

**测试基线（实现前先确认，勿追预存失败）：** 已知 `main` 上 `pnpm test` 有 3 个预存失败（App/TodoView 关于 stats 导航），10 个 lint 警告；`cargo test` 全绿。每阶段验证以"相对基线无新增失败"为准。

**通用命令：**
- 前端类型检查：`pnpm typecheck`
- 前端单测（全量）：`pnpm test`；单文件：`pnpm test <相对路径>`
- 后端测试：`cargo test --manifest-path src-tauri/Cargo.toml`
- 后端编译：`cargo build --manifest-path src-tauri/Cargo.toml`

---

## Task 1: 设置项 — 保留天数（前后端）

**Files:**
- Modify: `src-tauri/src/db.rs`（`ensure_default_settings`，约 528-560 行）
- Modify: `src/stores/settings.ts`（接口/DEFAULTS/decode）
- Modify: `src/stores/settings.test.ts`
- Modify: `src/views/SettingsView.vue`

- [ ] **Step 1: 写前端失败测试**

在 `src/stores/settings.test.ts` 增加：

```ts
it('decodes retention days with defaults and fallback', async () => {
  const store = useSettingsStore();
  // 默认值
  expect(store.state.unsavedNoteRetentionDays).toBe(30);
  expect(store.state.clipboardRetentionDays).toBe(7);
});

it('falls back to default on invalid retention day values', () => {
  // 通过 decode 的非正整数回退（借助 load 注入 mock，或直接断言默认）
  // 见下方实现：decode('clipboardRetentionDays','0') => 7
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/stores/settings.test.ts`
Expected: FAIL（`unsavedNoteRetentionDays` 不存在 / 类型报错）

- [ ] **Step 3: 前端实现 — settings.ts**

在 `StenoSettings` 接口末尾追加：

```ts
  /** 未保存笔记保留天数（超过则定时清理草稿）。 */
  unsavedNoteRetentionDays: number;
  /** 粘贴板条目保留天数（超过则定时清理）。 */
  clipboardRetentionDays: number;
```

在 `DEFAULTS` 追加：

```ts
  unsavedNoteRetentionDays: 30,
  clipboardRetentionDays: 7,
```

在 `decode` 的数字分支增加两键（正整数校验）：

```ts
    case 'unsavedNoteRetentionDays':
    case 'clipboardRetentionDays': {
      const n = Number.parseInt(raw, 10);
      return (Number.isFinite(n) && n > 0 ? n : defaultValue(key)) as StenoSettings[K];
    }
```

- [ ] **Step 4: 后端实现 — db.rs**

在 `ensure_default_settings` 的 `defaults` 数组追加：

```rust
            ("unsavedNoteRetentionDays", "30"),
            ("clipboardRetentionDays", "7"),
```

- [ ] **Step 5: SettingsView 增加控件**

在 `SettingsView.vue` 合适分组（如"存储"）增加两个 `NInputNumber`，`v-model:value` 绑定 `settings.state.unsavedNoteRetentionDays` / `clipboardRetentionDays`，`@update:value` 调 `settings.update(key, val)`，`:min="1"`。沿用该文件既有暗色 `:deep(.n-input-number)` 对比度规则。

- [ ] **Step 6: 运行验证**

Run: `pnpm test src/stores/settings.test.ts && pnpm typecheck`
Expected: PASS
Run: `cargo test --manifest-path src-tauri/Cargo.toml default_settings`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src-tauri/src/db.rs src/stores/settings.ts src/stores/settings.test.ts src/views/SettingsView.vue
git commit -m "feat(settings): 新增未保存笔记/粘贴板保留天数配置项"
```

---

## Task 2: 后端文件日志系统

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/logging.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 加依赖**

`src-tauri/Cargo.toml` 的 `[dependencies]` 追加：

```toml
log = "0.4"
```

- [ ] **Step 2: 写失败测试（先建模块骨架 + 测试）**

创建 `src-tauri/src/logging.rs`，先写测试驱动核心纯函数（路径与裁剪逻辑可测，文件写入用临时目录）：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn day_dir_uses_date_subdir() {
        let root = std::env::temp_dir().join(format!("steno-log-test-{}", uuid::Uuid::new_v4()));
        let dir = day_dir(&root, "2026-06-07");
        assert_eq!(dir, root.join("2026-06-07"));
    }

    #[test]
    fn prune_removes_dirs_older_than_retention() {
        let root = std::env::temp_dir().join(format!("steno-log-prune-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("2026-01-01")).unwrap();
        fs::create_dir_all(root.join("2026-06-07")).unwrap();
        // today=2026-06-07, retention=30 → 2026-01-01 应被删
        prune_old_dirs(&root, "2026-06-07", 30);
        assert!(!root.join("2026-01-01").exists());
        assert!(root.join("2026-06-07").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn next_file_index_rolls_when_over_limit() {
        // 给定目录已有 steno-1.log 且 >=10MB，应返回 2
        let root = std::env::temp_dir().join(format!("steno-log-roll-{}", uuid::Uuid::new_v4()));
        let day = root.join("2026-06-07");
        fs::create_dir_all(&day).unwrap();
        fs::write(day.join("steno-1.log"), vec![0u8; MAX_FILE_BYTES]).unwrap();
        assert_eq!(current_log_path(&day).file_name().unwrap().to_string_lossy(), "steno-2.log");
        let _ = fs::remove_dir_all(&root);
    }
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml logging`
Expected: FAIL（`day_dir`/`prune_old_dirs`/`current_log_path` 未定义）

- [ ] **Step 4: 实现 logging.rs**

```rust
//! 文件日志：按日期目录 + 10MB 切分 + 30 天保留，并 echo 到 stderr。
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use log::{Level, LevelFilter, Metadata, Record};

/// 单文件大小上限：10MB。
pub const MAX_FILE_BYTES: usize = 10 * 1024 * 1024;
/// 日志保留天数。
const RETENTION_DAYS: i64 = 30;

pub fn day_dir(root: &Path, date: &str) -> PathBuf {
    root.join(date)
}

/// 返回当天目录下应写入的日志文件路径：取最大序号文件；若其 ≥10MB 则用下一个序号。
pub fn current_log_path(day: &Path) -> PathBuf {
    let mut idx = 1u32;
    loop {
        let candidate = day.join(format!("steno-{idx}.log"));
        let size = fs::metadata(&candidate).map(|m| m.len() as usize).unwrap_or(0);
        let next = day.join(format!("steno-{}.log", idx + 1));
        if size == 0 {
            return candidate; // 不存在或空：用它
        }
        if size < MAX_FILE_BYTES {
            // 未满，但要确认没有更大的后继序号正在用
            if !next.exists() {
                return candidate;
            }
        }
        idx += 1;
        if idx > 100_000 {
            return day.join("steno-overflow.log");
        }
    }
}

/// 删除早于 today 指定保留天数的日期目录。
pub fn prune_old_dirs(root: &Path, today: &str, retention_days: i64) {
    let Ok(today_date) = chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d") else { return };
    let Ok(entries) = fs::read_dir(root) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if let Ok(d) = chrono::NaiveDate::parse_from_str(&name, "%Y-%m-%d") {
            if (today_date - d).num_days() > retention_days {
                if fs::remove_dir_all(entry.path()).is_ok() {
                    eprintln!("[logging] pruned old log dir: {name}");
                }
            }
        }
    }
}

struct FileLogger {
    root: PathBuf,
    state: Mutex<Option<(String, File)>>, // (当前日期, 句柄)
}

impl FileLogger {
    fn writer_for_today(&self) -> Option<std::sync::MutexGuard<'_, Option<(String, File)>>> {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let mut guard = self.state.lock().ok()?;
        let need_new = match &*guard {
            Some((date, _)) => date != &today,
            None => true,
        };
        if need_new {
            prune_old_dirs(&self.root, &today, RETENTION_DAYS);
            let day = day_dir(&self.root, &today);
            let _ = fs::create_dir_all(&day);
            let path = current_log_path(&day);
            if let Ok(file) = OpenOptions::new().create(true).append(true).open(&path) {
                *guard = Some((today, file));
            }
        }
        Some(guard)
    }
}

impl log::Log for FileLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= Level::Info
    }
    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let line = format!(
            "{} [{}] {}\n",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
            record.level(),
            record.args()
        );
        eprint!("{line}");
        if let Some(mut guard) = self.writer_for_today() {
            if let Some((_, file)) = guard.as_mut() {
                // 若当前文件已超限，重开到下一个序号
                let day = day_dir(&self.root, &chrono::Local::now().format("%Y-%m-%d").to_string());
                if file.metadata().map(|m| m.len() as usize).unwrap_or(0) >= MAX_FILE_BYTES {
                    let path = current_log_path(&day);
                    if let Ok(f) = OpenOptions::new().create(true).append(true).open(&path) {
                        *file = f;
                    }
                }
                let _ = file.write_all(line.as_bytes());
            }
        }
    }
    fn flush(&self) {
        if let Ok(mut guard) = self.state.lock() {
            if let Some((_, file)) = guard.as_mut() {
                let _ = file.flush();
            }
        }
    }
}

/// 初始化全局日志。`data_dir` 为 `~/.steno`，日志落在 `data_dir/data/logs`。
pub fn init(data_dir: &Path) {
    let root = data_dir.join("data").join("logs");
    let _ = fs::create_dir_all(&root);
    let logger = Box::new(FileLogger { root, state: Mutex::new(None) });
    if log::set_boxed_logger(logger).is_ok() {
        log::set_max_level(LevelFilter::Info);
        log::info!("[logging] initialized");
    }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml logging`
Expected: PASS

- [ ] **Step 6: 在 lib.rs 接线**

`lib.rs` 顶部模块声明加：`mod logging;`
在 `setup(|app| {` 内、`db::Db::init()?` 之前插入：

```rust
            // 初始化文件日志（~/.steno/data/logs），失败不致命。
            if let Ok(dir) = db::Db::data_dir() {
                logging::init(&dir);
            }
```

将 `lib.rs`、`reminder_scheduler.rs` 关键路径的 `eprintln!("[...] ...")` 改为 `log::info!/warn!/error!`（保留语义）。

- [ ] **Step 7: 编译 + 验证**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 成功
Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 相对基线无新增失败

- [ ] **Step 8: 提交**

```bash
git add src-tauri/Cargo.toml src-tauri/src/logging.rs src-tauri/src/lib.rs src-tauri/src/reminder_scheduler.rs
git commit -m "feat(logging): 新增按日期目录+10MB切分+30天保留的文件日志系统"
```

---

## Task 3: 后端定时清理调度器（草稿 + 粘贴板）

**Files:**
- Modify: `src-tauri/src/db.rs`（新增两清理方法 + 测试）
- Create: `src-tauri/src/cleanup_scheduler.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 写 db 清理方法的失败测试**

在 `db.rs` 的 `#[cfg(test)] mod tests` 内追加：

```rust
    #[test]
    fn cleanup_expired_drafts_removes_only_old_drafts() {
        let db = Db::open_in_memory_for_tests();
        // 旧草稿（updated_at 远早于 cutoff）
        db.lock().unwrap().execute(
            "INSERT INTO notes (id,title,content,html_content,tags,is_pinned,created_at,updated_at,word_count,is_draft)
             VALUES ('old','t','c','','[]',0,'2020-01-01T00:00:00Z','2020-01-01T00:00:00Z',0,1)", []).unwrap();
        // 新草稿
        let now = chrono::Utc::now().to_rfc3339();
        db.lock().unwrap().execute(
            "INSERT INTO notes (id,title,content,html_content,tags,is_pinned,created_at,updated_at,word_count,is_draft)
             VALUES ('new','t','c','','[]',0,?1,?1,0,1)", rusqlite::params![now]).unwrap();
        // 正式笔记（旧但 is_draft=0，不应删）
        db.lock().unwrap().execute(
            "INSERT INTO notes (id,title,content,html_content,tags,is_pinned,created_at,updated_at,word_count,is_draft)
             VALUES ('note','t','c','','[]',0,'2020-01-01T00:00:00Z','2020-01-01T00:00:00Z',0,0)", []).unwrap();
        let cutoff = (chrono::Utc::now() - chrono::Duration::days(30)).to_rfc3339();
        let removed = db.cleanup_expired_drafts(&cutoff).unwrap();
        assert_eq!(removed, 1);
        assert!(db.get_note("new").unwrap().is_some());
        assert!(db.get_note("note").unwrap().is_some());
        assert!(db.get_note("old").unwrap().is_none());
    }

    #[test]
    fn cleanup_expired_clipboard_respects_pin_and_age() {
        let db = Db::open_in_memory_for_tests();
        let old = "2020-01-01T00:00:00Z";
        // 旧未置顶 → 删
        db.lock().unwrap().execute(
            "INSERT INTO clipboard_history (id,content_type,content,preview,content_hash,created_at,updated_at,last_used_at,size_bytes)
             VALUES ('a','text','x','x','h1',?1,?1,?1,1)", rusqlite::params![old]).unwrap();
        // 旧但置顶 → 留
        db.lock().unwrap().execute(
            "INSERT INTO clipboard_history (id,content_type,content,preview,content_hash,created_at,updated_at,last_used_at,size_bytes,pinned_at)
             VALUES ('b','text','y','y','h2',?1,?1,?1,1,?1)", rusqlite::params![old]).unwrap();
        let cutoff = (chrono::Utc::now() - chrono::Duration::days(7)).to_rfc3339();
        let removed = db.cleanup_expired_clipboard(&cutoff).unwrap();
        assert_eq!(removed, 1);
        assert!(db.get_clipboard_entry("a").unwrap().is_none());
        assert!(db.get_clipboard_entry("b").unwrap().is_some());
    }
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cleanup_expired`
Expected: FAIL（方法未定义）

- [ ] **Step 3: 实现 db 清理方法**

在 `db.rs` 的 `impl Db`（粘贴板区域附近）添加：

```rust
    /// 删除最后修改时间早于 cutoff 的未保存草稿，返回删除条数。
    pub fn cleanup_expired_drafts(&self, cutoff_rfc3339: &str) -> Result<usize, DbError> {
        let conn = self.lock()?;
        let n = conn.execute(
            "DELETE FROM notes WHERE is_draft = 1 AND updated_at < ?1",
            rusqlite::params![cutoff_rfc3339],
        )?;
        Ok(n)
    }

    /// 删除早于 cutoff 且未置顶的粘贴板条目，返回删除条数。
    pub fn cleanup_expired_clipboard(&self, cutoff_rfc3339: &str) -> Result<usize, DbError> {
        let conn = self.lock()?;
        let n = conn.execute(
            "DELETE FROM clipboard_history
             WHERE pinned_at IS NULL AND COALESCE(last_used_at, updated_at) < ?1",
            rusqlite::params![cutoff_rfc3339],
        )?;
        Ok(n)
    }
```

- [ ] **Step 4: 运行确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cleanup_expired`
Expected: PASS

- [ ] **Step 5: 实现 cleanup_scheduler.rs**

```rust
//! 清理调度器 — 周期性清除过期未保存草稿与过期粘贴板条目，并写日志。
use std::time::Duration;

use tauri::AppHandle;

use crate::db::Db;

const STARTUP_DELAY: Duration = Duration::from_secs(5);
const TICK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60); // 6 小时

const DEFAULT_DRAFT_DAYS: i64 = 30;
const DEFAULT_CLIPBOARD_DAYS: i64 = 7;

pub fn start_scheduler(_app: AppHandle, db: Db) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(STARTUP_DELAY).await;
        loop {
            if let Err(e) = tick(&db).await {
                log::error!("[cleanup] tick error: {e}");
            }
            tokio::time::sleep(TICK_INTERVAL).await;
        }
    });
}

fn retention_days(db: &Db, key: &str, default: i64) -> i64 {
    db.get_setting(key)
        .ok()
        .flatten()
        .and_then(|v| v.parse::<i64>().ok())
        .filter(|n| *n > 0)
        .unwrap_or(default)
}

async fn tick(db: &Db) -> Result<(), String> {
    let db = db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let draft_days = retention_days(&db, "unsavedNoteRetentionDays", DEFAULT_DRAFT_DAYS);
        let clip_days = retention_days(&db, "clipboardRetentionDays", DEFAULT_CLIPBOARD_DAYS);
        let draft_cutoff = (chrono::Utc::now() - chrono::Duration::days(draft_days)).to_rfc3339();
        let clip_cutoff = (chrono::Utc::now() - chrono::Duration::days(clip_days)).to_rfc3339();

        match db.cleanup_expired_drafts(&draft_cutoff) {
            Ok(n) if n > 0 => log::info!("[cleanup] removed {n} expired draft(s) older than {draft_days}d"),
            Ok(_) => {}
            Err(e) => log::error!("[cleanup] draft cleanup failed: {e}"),
        }
        match db.cleanup_expired_clipboard(&clip_cutoff) {
            Ok(n) if n > 0 => log::info!("[cleanup] removed {n} expired clipboard entr(ies) older than {clip_days}d"),
            Ok(_) => {}
            Err(e) => log::error!("[cleanup] clipboard cleanup failed: {e}"),
        }
    })
    .await
    .map_err(|e| e.to_string())
}
```

- [ ] **Step 6: lib.rs 接线**

模块声明加 `mod cleanup_scheduler;`。在 `setup` 中（`reminder_scheduler::start_scheduler(...)` 之后），用启动前保留的 db 克隆：

```rust
            let db_for_cleanup = db_for_scheduler.clone();
            cleanup_scheduler::start_scheduler(app.handle().clone(), db_for_cleanup);
```

（注意：`db_for_scheduler` 在 `app.manage(database)` 之前已 clone；在其后再 clone 一份给 cleanup。确保 clone 发生在 manage 之前。）

- [ ] **Step 7: 编译 + 验证**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 相对基线无新增失败
Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 成功

- [ ] **Step 8: 提交**

```bash
git add src-tauri/src/db.rs src-tauri/src/cleanup_scheduler.rs src-tauri/src/lib.rs
git commit -m "feat(cleanup): 新增定时清理过期未保存草稿与粘贴板条目的调度器"
```

---

## Task 4: 编辑器 — 标题块级语法即时渲染

**Files:**
- Modify: `src/components/markdown-editor/prosemirror/plugins/input-rules.ts`
- Test: `src/components/markdown-editor/prosemirror/tests/parser.test.ts`（或新建 input-rules 测试）

- [ ] **Step 1: 写失败测试**

新建 `src/components/markdown-editor/prosemirror/tests/input-rules.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { stenoSchema } from '../schema';
import { createInputRulesPlugin } from '../plugins/input-rules';

function typeText(text: string) {
  const plugin = createInputRulesPlugin(stenoSchema);
  let state = EditorState.create({ schema: stenoSchema, plugins: [plugin] });
  // 模拟逐字符输入，触发 input rule 的 handleTextInput
  for (const ch of text) {
    const { from } = state.selection;
    const handled = plugin.props.handleTextInput?.(
      { state, dispatch: (tr) => { state = state.apply(tr); } } as any,
      from, from, ch,
    );
    if (!handled) state = state.apply(state.tr.insertText(ch));
  }
  return state;
}

describe('heading input rule', () => {
  it('converts "# " to an h1 heading', () => {
    const state = typeText('# ');
    const first = state.doc.firstChild!;
    expect(first.type.name).toBe('heading');
    expect(first.attrs.level).toBe(1);
  });

  it('converts "### " to an h3 heading', () => {
    const state = typeText('### ');
    expect(state.doc.firstChild!.attrs.level).toBe(3);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/components/markdown-editor/prosemirror/tests/input-rules.test.ts`
Expected: FAIL（段落仍是 paragraph，含字面 `# `）

- [ ] **Step 3: 实现 heading 规则**

在 `input-rules.ts` 增加（放在其它块级规则函数附近）：

```ts
/** 标题：行首 `#`~`######` + 空格 → 对应级别 heading */
function headingRule(nodeType: NodeType): InputRule {
  return new InputRule(/^(#{1,6})\s$/, (state, match, start, end) => {
    const decorationState = decorationPluginKey.getState(state);
    if (decorationState?.sourceView) return null;
    const level = match[1].length;
    const $start = state.doc.resolve(start);
    if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType)) {
      return null;
    }
    return state.tr.delete(start, end).setBlockType(start, start, nodeType, { level });
  });
}
```

在 `createInputRulesPlugin` 的块级规则区（`blockquote` 之前）装配：

```ts
  if (schema.nodes.heading) {
    rules.push(headingRule(schema.nodes.heading));
  }
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/components/markdown-editor/prosemirror/tests/input-rules.test.ts`
Expected: PASS

- [ ] **Step 5: 真实路径验证（systematic-debugging）**

若步骤 4 通过但仍怀疑真实渲染，参照 superpowers:systematic-debugging：在 `pnpm tauri:dev` 中于笔记编辑页与速记浮窗输入 `# 标题`，确认即时渲染为 H1（光标移出后隐藏 `#`）。

- [ ] **Step 6: 全量回归 + 提交**

Run: `pnpm test src/components/markdown-editor && pnpm typecheck`
Expected: 相对基线无新增失败

```bash
git add src/components/markdown-editor/prosemirror/plugins/input-rules.ts src/components/markdown-editor/prosemirror/tests/input-rules.test.ts
git commit -m "fix(editor): 标题语法输入即时渲染（补 ATX 标题 input rule）"
```

---

## Task 5: 编辑器 — Ctrl+1~6 标题快捷键

**Files:**
- Modify: `src/components/markdown-editor/prosemirror/plugins/keymap.ts`
- Test: `src/components/markdown-editor/prosemirror/tests/keymap.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

新建 `keymap.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { createMarkKeymap } from '../plugins/keymap';

describe('mark keymap', () => {
  it('binds Mod-1..6 to heading and Mod-0 to paragraph', () => {
    const map = createMarkKeymap();
    for (let i = 1; i <= 6; i++) {
      expect(typeof map[`Mod-${i}`]).toBe('function');
    }
    expect(typeof map['Mod-0']).toBe('function');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/components/markdown-editor/prosemirror/tests/keymap.test.ts`
Expected: FAIL（`Mod-1` 未绑定）

- [ ] **Step 3: 实现**

在 `keymap.ts::createMarkKeymap` 的返回对象内追加（保留既有 `Mod-Alt-*`）：

```ts
    'Mod-1': setHeading(1),
    'Mod-2': setHeading(2),
    'Mod-3': setHeading(3),
    'Mod-4': setHeading(4),
    'Mod-5': setHeading(5),
    'Mod-6': setHeading(6),
    'Mod-0': setParagraph,
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/components/markdown-editor/prosemirror/tests/keymap.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/markdown-editor/prosemirror/plugins/keymap.ts src/components/markdown-editor/prosemirror/tests/keymap.test.ts
git commit -m "feat(editor): 新增 Ctrl+1~6 标题与 Ctrl+0 段落快捷键"
```

---

## Task 6: 编辑器 — 粘贴图片后光标落点

**Files:**
- Modify: `src/components/markdown-editor/prosemirror/plugins/paste.ts`

- [ ] **Step 1: 写失败测试**

新建 `paste.test.ts`，直接测试"插入 block 图片后选区落在图片之后"的辅助函数。先把插入逻辑抽成可测纯函数 `insertImageWithCaretAfter(state, imageNode)` 返回 `tr`：

```ts
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { stenoSchema } from '../schema';
import { insertImageWithCaretAfter } from '../plugins/paste';

it('places caret after the inserted block image', () => {
  let state = EditorState.create({ schema: stenoSchema });
  // 初始光标在空段落
  const img = stenoSchema.nodes.image.createAndFill({ src: 'steno-asset:x.png', alt: 'x' })!;
  const tr = insertImageWithCaretAfter(state, img);
  state = state.apply(tr);
  const { $from } = state.selection;
  // 光标父节点应为图片之后的文本块（paragraph）
  expect($from.parent.type.name).toBe('paragraph');
  // 光标位置应大于图片结束位置
  let imgEnd = 0;
  state.doc.descendants((node, pos) => { if (node.type.name === 'image') imgEnd = pos + node.nodeSize; });
  expect($from.pos).toBeGreaterThanOrEqual(imgEnd);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/components/markdown-editor/prosemirror/tests/paste.test.ts`
Expected: FAIL（`insertImageWithCaretAfter` 未导出）

- [ ] **Step 3: 实现 — 抽函数并改 handleImagePaste**

在 `paste.ts` 顶部 import 补 `TextSelection`、`Selection`：

```ts
import { Plugin, PluginKey, TextSelection, Selection } from 'prosemirror-state';
```

新增导出函数：

```ts
/** 在当前选区插入 block 图片，并把光标放到图片之后的文本块（必要时补空段落）。 */
export function insertImageWithCaretAfter(state: EditorState, imageNode: Node) {
  const { $from } = state.selection;
  let tr = state.tr.insert($from.pos, imageNode);
  // 图片插入后，定位其结束位置
  const afterPos = $from.pos + imageNode.nodeSize;
  const $after = tr.doc.resolve(Math.min(afterPos, tr.doc.content.size));
  const nextIsTextblock = $after.nodeAfter?.isTextblock ?? false;
  if (!nextIsTextblock) {
    const para = state.schema.nodes.paragraph.create();
    tr = tr.insert(afterPos, para);
  }
  const sel = Selection.near(tr.doc.resolve(Math.min(afterPos + 1, tr.doc.content.size)), 1);
  tr = tr.setSelection(sel).scrollIntoView();
  return tr;
}
```

（需在文件顶部 import `EditorState`、`Node`：`import type { EditorState } from 'prosemirror-state';` 与 `import { Slice, type Node } from 'prosemirror-model';`）

把 `handleImagePaste` 内插入分支改为：

```ts
      const imageNode = imageType.createAndFill({ src, alt: file.name, title: '' });
      if (imageNode) {
        view.dispatch(insertImageWithCaretAfter(view.state, imageNode));
      }
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/components/markdown-editor/prosemirror/tests/paste.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/markdown-editor/prosemirror/plugins/paste.ts src/components/markdown-editor/prosemirror/tests/paste.test.ts
git commit -m "fix(editor): 粘贴图片后光标落到图片下一行"
```

---

## Task 7: 笔记编辑页布局 — 固定顶/底栏 + 内容滚动 + 大纲

**Files:**
- Modify: `src/views/NoteEditorView.vue`（`<style scoped>` + 模板大纲面板定位）
- Test: `src/views/NoteEditorView.test.ts`

- [ ] **Step 1: 写/调整测试**

在 `NoteEditorView.test.ts` 增加断言（结构层面，jsdom 无布局引擎，断 DOM 关系）：

```ts
it('renders header, scrollable body, footer as siblings', () => {
  const wrapper = mountView();
  expect(wrapper.find('.note-editor-header').exists()).toBe(true);
  expect(wrapper.find('.note-editor-body').exists()).toBe(true);
  expect(wrapper.find('.note-editor-footer').exists()).toBe(true);
  // 大纲 FAB 在 body 内
  expect(wrapper.find('.note-editor-body [data-testid="note-outline-toggle"]').exists()).toBe(true);
});
```

- [ ] **Step 2: 运行（基线）**

Run: `pnpm test src/views/NoteEditorView.test.ts`
Expected: 记录当前通过情况

- [ ] **Step 3: 实现 — CSS 三段式**

`.note-editor-root`：把 `min-height: 100%` 改为 `height: 100%`。
`.note-editor-header` 增加 `flex-shrink: 0;`。
`.note-editor-footer` 增加 `flex-shrink: 0;`。
`.note-editor-body` 增加 `overflow: auto;`（已是 `flex:1; min-height:0;`），成为唯一滚动容器。
大纲面板 `.note-editor-outline-panel`：把 `top: 18px;` 改为锚定 FAB 上方——

```css
.note-editor-outline-panel {
  position: absolute;
  right: 24px;
  bottom: 72px;          /* 原 top: 18px */
  z-index: 3;
  width: 220px;
  max-height: calc(100% - 96px);
  /* 其余不变 */
}
```

FAB 已是 `position:absolute; right:40px; bottom:32px; z-index:2`，因 body 不再整页滚动，FAB 自然悬浮于内容区右下角；将 `z-index` 提到 `4` 确保覆盖内容。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/views/NoteEditorView.test.ts && pnpm typecheck`
Expected: 相对基线无新增失败

- [ ] **Step 5: 真实验证 + 提交**

`pnpm tauri:dev` 打开长笔记，确认顶/底栏固定、仅内容区滚动、大纲面板在按钮上方展开。

```bash
git add src/views/NoteEditorView.vue src/views/NoteEditorView.test.ts
git commit -m "fix(editor): 编辑页顶/底栏固定，滚动仅作用内容区，大纲面板锚定按钮上方"
```

---

## Task 8: Zen 模式内容回显

**Files:**
- Modify: `src/views/ZenMode.vue`
- Test: `src/views/ZenMode.test.ts`

- [ ] **Step 1: 写失败测试**

在 `ZenMode.test.ts` 增加（mock `useDb.getEditorEntry`/`getNote` 返回带内容的笔记）：

```ts
it('echoes the note content into the editor when entered with a noteId', async () => {
  // ui.noteId 指向某笔记，db 返回 content='# 回显内容'
  const wrapper = await mountZenWithNote({ id: 'n1', title: 'T', content: '# 回显内容', tags: [] });
  await flushPromises();
  // MarkdownEditor 收到的 modelValue 应为该内容
  const editor = wrapper.findComponent({ name: 'MarkdownEditor' });
  expect(editor.props('modelValue')).toContain('回显内容');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/views/ZenMode.test.ts`
Expected: FAIL（编辑器 modelValue 为空——本地 ref 未同步）

- [ ] **Step 3: 实现 — 统一到 session**

在 `ZenMode.vue` 删除：

```ts
const title = ref('');
const content = ref('');
const tags = ref<string[]>([]);
```

改为复用 session（与 NoteEditorView 一致）：

```ts
const title = session.title;
const content = session.content;
const tags = session.tags;
```

其余引用（`wordCount`、`outlineNodes`、`displayTitle`、`<MarkdownEditor v-model="content">`、footer tags、标题编辑）保持变量名不变即可（现在指向 session 的 ref）。确认 `isEmpty` 已用 `session.*`，无需改。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/views/ZenMode.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/views/ZenMode.vue src/views/ZenMode.test.ts
git commit -m "fix(zen): Zen 模式回显当前笔记内容并写回同一笔记"
```

---

## Task 9: 笔记列表 — 进入 Zen 菜单 + 红色未保存徽章

**Files:**
- Modify: `src/views/MainView.vue`
- Test: `src/views/MainView.test.ts`

- [ ] **Step 1: 写失败测试**

在 `MainView.test.ts` 增加：

```ts
it('shows "进入 Zen 模式" context item and navigates to zen', async () => {
  const wrapper = await mountMainWithNote({ id: 'n1', isDraft: false });
  await openContextMenuOn(wrapper, 'n1');
  const item = wrapper.find('[data-testid="context-edit"]');
  expect(item.text()).toContain('进入 Zen 模式');
  await item.trigger('click');
  expect(uiStore.navigateTo).toHaveBeenCalledWith('zen', 'n1', { mode: 'main', noteId: null });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/views/MainView.test.ts`
Expected: FAIL（文案仍为"编辑"/未调用 zen 导航）

- [ ] **Step 3: 实现 — 菜单项**

`MainView.vue` 模板中 `data-testid="context-edit"` 按钮文案"编辑"改为"进入 Zen 模式"。
`onContextEdit` 改为：

```ts
function onContextEdit() {
  const note = contextTargetNote.value;
  if (!note) return;
  closeContextMenu();
  ui.navigateTo('zen', note.id, { mode: 'main', noteId: null });
}
```

（移除原 `onOpenNoteEditor` 调用；草稿亦走 Zen。）

- [ ] **Step 4: 实现 — 红色徽章**

`.note-card-draft-tag` 样式改为红底浅字：

```css
.note-card-draft-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  border: 1px solid oklch(55% 0.2 25);
  border-radius: 4px;
  background: oklch(58% 0.2 25);   /* 红底 */
  color: #fff;                     /* 浅字 */
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.02em;
  cursor: default;
}
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm test src/views/MainView.test.ts && pnpm typecheck`
Expected: 相对基线无新增失败

- [ ] **Step 6: 提交**

```bash
git add src/views/MainView.vue src/views/MainView.test.ts
git commit -m "feat(list): 右键改为进入 Zen 模式，未保存徽章改红色醒目样式"
```

---

## Task 10: 文档与归档准备

**Files:**
- Modify: `README.md`
- Modify: `openspec/changes/pending-features-and-bugfixes/tasks.md`（勾选）

- [ ] **Step 1: 更新 README**

在功能/设置章节补充：文件日志（`~/.steno/data/logs`、30 天保留）、未保存/粘贴板保留天数设置、列表右键"进入 Zen 模式"、Ctrl+1~6 标题快捷键。

- [ ] **Step 2: 全量回归**

Run: `pnpm typecheck && pnpm test`
Expected: 相对基线无新增失败（仍仅 3 个预存失败）
Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全绿

- [ ] **Step 3: openspec 校验**

Run: `openspec validate pending-features-and-bugfixes --strict`
Expected: valid

- [ ] **Step 4: 勾选 tasks.md 并提交**

将 `openspec/changes/pending-features-and-bugfixes/tasks.md` 全部勾选完成。

```bash
git add README.md openspec/changes/pending-features-and-bugfixes/tasks.md
git commit -m "docs: 更新 README 与 openspec 任务进度，完成待实现功能与缺陷修复"
```

- [ ] **Step 5: 收尾**

参照 superpowers:finishing-a-development-branch 决定合并/PR；如归档变更：`openspec archive pending-features-and-bugfixes`。

---

## Self-Review 检查记录

- **Spec 覆盖**：application-logging→T2；data-retention-cleanup→T1/T3；note-editor-layout→T7(布局)+T8(Zen 回显)；note-list-management→T9；markdown-wysiwyg-editor(标题即时渲染→T4 / Ctrl+数字→T5 / 图片光标→T6)。全部 spec 有对应任务。
- **类型一致**：`cleanup_expired_drafts`/`cleanup_expired_clipboard`（db）、`insertImageWithCaretAfter`（paste）、`headingRule`（input-rules）、`setHeading/setParagraph`（已存在 commands）命名在各任务间一致。
- **占位符扫描**：各代码步骤均含真实代码；CSS 红色用 oklch 具体值；命令含预期输出。
- **依赖顺序**：设置(T1)→日志(T2)→清理(T3，依赖 T1 设置键 + T2 日志宏)；编辑器/视图任务相互独立，可按序执行。
