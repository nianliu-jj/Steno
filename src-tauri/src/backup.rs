//! 数据库备份服务。
//!
//! ## 触发策略
//! - 累计每 10 次"修改 db 的操作"（save/delete/pin 等）触发一次备份
//! - "当天首次保存"备份策略留给后续迭代（需持久化 `lastBackupDate`）
//!
//! ## 备份文件
//! - 目录：`~/.steno/backup/`
//! - 文件名：`data-YYYY-MM-DD-HHMMSS.db`（UTC 时间，避免本地时区切换）
//!
//! ## 错误处理
//! 备份失败不中断业务 — 调用方只记录日志，用户保存操作正常进行。

#![allow(dead_code)]

use std::path::Path;

pub struct BackupService;

impl BackupService {
    /// `change_count` 是自进程启动以来累计的"修改次数"（save/delete/pin
    /// 等），由调用方维护。每 10 次落一次备份。
    ///
    /// 不返回错误时调用方应继续；返回 io::Error 时调用方应记录日志但不
    /// 中断业务（备份失败不阻塞用户保存）。
    pub fn maybe_backup(db_path: &Path, data_dir: &Path, change_count: u64) -> std::io::Result<()> {
        if change_count == 0 || change_count % 10 != 0 {
            return Ok(());
        }
        let backup_dir = data_dir.join("backup");
        std::fs::create_dir_all(&backup_dir)?;
        let ts = chrono::Utc::now().format("%Y-%m-%d-%H%M%S");
        let backup_name = format!("data-{ts}.db");
        std::fs::copy(db_path, backup_dir.join(backup_name))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maybe_backup_skips_when_change_count_zero() {
        // change_count = 0 → 不应尝试 IO；用不存在的路径也安全。
        let res = BackupService::maybe_backup(
            Path::new("/nonexistent/data.db"),
            Path::new("/nonexistent"),
            0,
        );
        assert!(res.is_ok(), "no-op should return Ok");
    }

    #[test]
    fn maybe_backup_skips_non_multiples_of_ten() {
        // 即使 path 不存在，5 也不该触发 copy。
        let res = BackupService::maybe_backup(
            Path::new("/nonexistent/data.db"),
            Path::new("/nonexistent"),
            5,
        );
        assert!(res.is_ok());
    }
}
