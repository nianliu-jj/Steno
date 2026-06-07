//! 清理调度器 — 周期性清除过期未保存草稿与过期粘贴板条目，并写日志。
//!
//! ## 设计要点
//! - 复用 `reminder_scheduler` 的后台任务范式：启动延迟若干秒先跑一轮，之后每 6 小时一轮。
//! - 每轮从 settings 读取保留天数（非法值回退默认：草稿 30 天、粘贴板 7 天），
//!   计算 RFC3339 截止时间后执行清理，并用 `log` 记录删除数量。
//! - 周期扫描相比"每次编辑后注册 per-draft 定时任务"更健壮：进程重启后仍生效、
//!   覆盖启动时补清理，且实现简单。
//!
//! ## 调用方
//! `lib.rs::run().setup()` 中 `start_scheduler(app.handle().clone(), db.clone())`。

use std::time::Duration;

use tauri::AppHandle;

use crate::db::Db;

/// 启动延迟：5 秒，避免与启动期其它初始化抢锁。
const STARTUP_DELAY: Duration = Duration::from_secs(5);
/// 扫描周期：6 小时。
const TICK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);

/// 未保存草稿默认保留天数。
const DEFAULT_DRAFT_DAYS: i64 = 30;
/// 粘贴板默认保留天数。
const DEFAULT_CLIPBOARD_DAYS: i64 = 7;

/// 启动后台清理调度器。在 `setup` 中调用，永不结束（进程退出时随 tokio runtime 一起停）。
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

/// 从设置读取保留天数；缺失/非法（非正整数）时回退默认值。
fn retention_days(db: &Db, key: &str, default: i64) -> i64 {
    db.get_setting(key)
        .ok()
        .flatten()
        .and_then(|v| v.parse::<i64>().ok())
        .filter(|n| *n > 0)
        .unwrap_or(default)
}

/// 单次清理：草稿 + 粘贴板。抽离便于测试与日志记录。
async fn tick(db: &Db) -> Result<(), String> {
    let db = db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let draft_days = retention_days(&db, "unsavedNoteRetentionDays", DEFAULT_DRAFT_DAYS);
        let clip_days = retention_days(&db, "clipboardRetentionDays", DEFAULT_CLIPBOARD_DAYS);
        let draft_cutoff = (chrono::Utc::now() - chrono::Duration::days(draft_days)).to_rfc3339();
        let clip_cutoff = (chrono::Utc::now() - chrono::Duration::days(clip_days)).to_rfc3339();

        match db.cleanup_expired_drafts(&draft_cutoff) {
            Ok(n) if n > 0 => {
                log::info!("[cleanup] removed {n} expired draft(s) older than {draft_days}d");
            }
            Ok(_) => {}
            Err(e) => log::error!("[cleanup] draft cleanup failed: {e}"),
        }
        match db.cleanup_expired_clipboard(&clip_cutoff) {
            Ok(n) if n > 0 => {
                log::info!("[cleanup] removed {n} expired clipboard entr(ies) older than {clip_days}d");
            }
            Ok(_) => {}
            Err(e) => log::error!("[cleanup] clipboard cleanup failed: {e}"),
        }
    })
    .await
    .map_err(|e| e.to_string())
}
