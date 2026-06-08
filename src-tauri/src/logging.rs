//! 文件日志：按日期目录 + 10MB 切分 + 30 天保留，并 echo 到 stderr。
//!
//! ## 设计要点
//! - 日志根目录 `<data_dir>/data/logs`（即 `~/.steno/data/logs`）。
//! - 每天一个子目录 `YYYY-MM-DD`；同一天内单文件 ≥10MB 时滚动到下一个序号文件。
//! - 启动与跨天切换时清理超过 30 天的日期目录。
//! - 用 `log` facade，业务侧调用 `log::info!/warn!/error!`；写文件失败时降级仅 stderr。

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use log::{Level, LevelFilter, Metadata, Record};

/// 单文件大小上限：10MB。
pub const MAX_FILE_BYTES: usize = 10 * 1024 * 1024;
/// 日志保留天数。
const RETENTION_DAYS: i64 = 30;

/// 当天日期目录：`root/<date>`。
pub fn day_dir(root: &Path, date: &str) -> PathBuf {
    root.join(date)
}

/// 返回当天目录下应写入的日志文件路径：取最新序号文件；若其 ≥10MB 则用下一个序号。
pub fn current_log_path(day: &Path) -> PathBuf {
    let mut idx = 1u32;
    loop {
        let candidate = day.join(format!("steno-{idx}.log"));
        let size = fs::metadata(&candidate).map(|m| m.len() as usize).unwrap_or(0);
        if size == 0 {
            return candidate; // 不存在或为空：用它
        }
        if size < MAX_FILE_BYTES {
            // 未满；若没有更大的后继序号，则继续追加到该文件
            let next = day.join(format!("steno-{}.log", idx + 1));
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
    let Ok(today_date) = chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d") else {
        return;
    };
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if let Ok(d) = chrono::NaiveDate::parse_from_str(&name, "%Y-%m-%d") {
            if (today_date - d).num_days() > retention_days && fs::remove_dir_all(entry.path()).is_ok()
            {
                eprintln!("[logging] pruned old log dir: {name}");
            }
        }
    }
}

/// 保存 FileLogger 的数据结构，明确后端状态在模块边界上的字段含义。
struct FileLogger {
    root: PathBuf,
    /// (当前日期, 当前文件句柄)
    state: Mutex<Option<(String, File)>>,
}

/// 为 FileLogger 实现核心行为，使数据结构和业务操作保持在同一语义区域。
impl FileLogger {
    /// 确保锁内持有的句柄指向"今天"的文件；跨天时先清理过期目录再开新文件。
    fn ensure_today<'a>(
        &'a self,
        guard: &mut std::sync::MutexGuard<'a, Option<(String, File)>>,
        today: &str,
    ) {
        let need_new = match guard.as_ref() {
            Some((date, _)) => date != today,
            None => true,
        };
        if need_new {
            prune_old_dirs(&self.root, today, RETENTION_DAYS);
            let day = day_dir(&self.root, today);
            let _ = fs::create_dir_all(&day);
            let path = current_log_path(&day);
            if let Ok(file) = OpenOptions::new().create(true).append(true).open(&path) {
                **guard = Some((today.to_string(), file));
            }
        }
    }
}

/// 为 log 实现核心行为，使数据结构和业务操作保持在同一语义区域。
impl log::Log for FileLogger {
    /// 执行 enabled 流程，集中处理 logging 相关的输入、错误和返回值。
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= Level::Info
    }

    /// 执行 log 流程，集中处理 logging 相关的输入、错误和返回值。
    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let line = format!(
            "{} [{}] {}\n",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
            record.level(),
            record.args()
        );
        eprint!("{line}");

        let Ok(mut guard) = self.state.lock() else {
            return;
        };
        self.ensure_today(&mut guard, &today);
        if let Some((_, file)) = guard.as_mut() {
            // 当前文件超限 → 滚动到下一个序号文件
            if file.metadata().map(|m| m.len() as usize).unwrap_or(0) >= MAX_FILE_BYTES {
                let day = day_dir(&self.root, &today);
                let path = current_log_path(&day);
                if let Ok(f) = OpenOptions::new().create(true).append(true).open(&path) {
                    *file = f;
                }
            }
            let _ = file.write_all(line.as_bytes());
        }
    }

    /// 执行 flush 流程，集中处理 logging 相关的输入、错误和返回值。
    fn flush(&self) {
        if let Ok(mut guard) = self.state.lock() {
            if let Some((_, file)) = guard.as_mut() {
                let _ = file.flush();
            }
        }
    }
}

/// 初始化全局文件日志。`data_dir` 为 `~/.steno`，日志落在 `data_dir/data/logs`。
/// 多次调用安全（`set_boxed_logger` 失败时静默忽略）。
pub fn init(data_dir: &Path) {
    let root = data_dir.join("data").join("logs");
    let _ = fs::create_dir_all(&root);
    let logger = Box::new(FileLogger {
        root,
        state: Mutex::new(None),
    });
    if log::set_boxed_logger(logger).is_ok() {
        log::set_max_level(LevelFilter::Info);
        log::info!("[logging] initialized");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// 执行 unique_root 流程，集中处理 logging 相关的输入、错误和返回值。
    fn unique_root(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!("steno-log-{tag}-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn day_dir_uses_date_subdir() {
        let root = unique_root("daydir");
        assert_eq!(day_dir(&root, "2026-06-07"), root.join("2026-06-07"));
    }

    #[test]
    fn prune_removes_dirs_older_than_retention() {
        let root = unique_root("prune");
        fs::create_dir_all(root.join("2026-01-01")).unwrap();
        fs::create_dir_all(root.join("2026-06-07")).unwrap();
        prune_old_dirs(&root, "2026-06-07", 30);
        assert!(!root.join("2026-01-01").exists());
        assert!(root.join("2026-06-07").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn next_file_index_rolls_when_over_limit() {
        let root = unique_root("roll");
        let day = root.join("2026-06-07");
        fs::create_dir_all(&day).unwrap();
        fs::write(day.join("steno-1.log"), vec![0u8; MAX_FILE_BYTES]).unwrap();
        let path = current_log_path(&day);
        assert_eq!(path.file_name().unwrap().to_string_lossy(), "steno-2.log");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn current_log_path_appends_to_unfilled_file() {
        let root = unique_root("append");
        let day = root.join("2026-06-07");
        fs::create_dir_all(&day).unwrap();
        fs::write(day.join("steno-1.log"), vec![0u8; 1024]).unwrap();
        let path = current_log_path(&day);
        assert_eq!(path.file_name().unwrap().to_string_lossy(), "steno-1.log");
        let _ = fs::remove_dir_all(&root);
    }
}
