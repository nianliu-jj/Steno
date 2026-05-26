//! 待办提醒调度器 — Rust 后台任务，周期性扫描到期提醒并触发系统通知。
//!
//! ## 设计要点
//! - 周期 30s。最差延迟 30s 在用户感知上等同"准时"，单 SQL 查询 + 索引开销可忽略。
//! - CAS 标记 `reminder_fired=1`：用户在"调度器读出 → 标记"之间改了 `reminder_time`
//!   时，CAS 失败、本周期不发通知、新时间在下个周期再判定。
//! - 每周期最多触发 10 条：防止系统长时间休眠醒来后大批通知淹没用户。
//! - 应用启动期已错过的提醒（关机时间窗内）会在首个周期内被批次补发。
//!
//! ## 调用方
//! `lib.rs::run().setup()` 中 `start_scheduler(app.handle().clone(), db.clone())`。

use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::db::Db;
use crate::todo::{TodoChangeKind, TodoChangePayload, TODO_CHANGED_EVENT};

/// 调度周期：30 秒。
const TICK_INTERVAL: Duration = Duration::from_secs(30);

/// 单周期最多触发的通知条数。
const BATCH_LIMIT: usize = 10;

/// 启动后台调度器。在 `setup` 中调用，永不结束（进程退出时随 tokio runtime 一起停）。
pub fn start_scheduler(app: AppHandle, db: Db) {
    let app = Arc::new(app);
    tauri::async_runtime::spawn(async move {
        // 启动延迟 2 秒，避免与 setup 期的其它初始化抢锁。
        tokio::time::sleep(Duration::from_secs(2)).await;
        loop {
            if let Err(err) = tick(app.as_ref(), &db).await {
                eprintln!("[reminder_scheduler] tick error: {err}");
            }
            tokio::time::sleep(TICK_INTERVAL).await;
        }
    });
}

/// 单次扫描+触发。抽离便于测试。
async fn tick(app: &AppHandle, db: &Db) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    let db_clone = db.clone();
    let now_clone = now.clone();
    let due = tauri::async_runtime::spawn_blocking(move || {
        db_clone.list_due_reminders(&now_clone, BATCH_LIMIT)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    if due.is_empty() {
        return Ok(());
    }

    for todo in due {
        // 提醒时间在通知打出前必须先 CAS 标记，否则若 notification show 抛错
        // 会导致本周期看到的任务在下周期重复出现。
        let reminder_time = match todo.reminder_time.as_deref() {
            Some(t) => t.to_string(),
            None => continue, // 防御性：理论上不会发生（查询已过滤）
        };
        let db_clone = db.clone();
        let id_clone = todo.id.clone();
        let claimed = tauri::async_runtime::spawn_blocking(move || {
            db_clone.mark_reminder_fired(&id_clone, &reminder_time)
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

        if !claimed {
            // reminder_time 已被用户修改，跳过本次触发；新时间会在下个周期处理。
            continue;
        }

        // 发系统通知。title 限 80 字，body 描述时间。
        let title = truncate_chars(&todo.content, 80);
        let body = format!("提醒时间到：{}", format_local(&todo.reminder_time));
        let notify_result = app
            .notification()
            .builder()
            .title(title)
            .body(body)
            .show();
        if let Err(err) = notify_result {
            eprintln!("[reminder_scheduler] notification show failed: {err}");
            // 已 CAS 标记，不再回滚（避免下周期重复弹）；用户在 TodoView
            // 看任务行的"已过期未提醒"角标也能感知。
        }

        // 广播 updated 事件，让所有窗口刷新 reminder_fired 标记。
        let _ = app.emit(
            TODO_CHANGED_EVENT,
            TodoChangePayload {
                kind: TodoChangeKind::Updated,
                id: todo.id.clone(),
                todo: Some(crate::todo::Todo {
                    reminder_fired: true,
                    ..todo
                }),
            },
        );
    }

    Ok(())
}

/// 应用启动时按需请求通知权限：仅当库里有任意带 reminder_time 的待办，
/// 且当前权限状态需要用户确认（Prompt / PromptWithRationale）时弹权限请求。
pub async fn maybe_request_permission(app: &AppHandle) {
    use tauri_plugin_notification::PermissionState;
    let db = match app.try_state::<Db>() {
        Some(s) => s.inner().clone(),
        None => return,
    };
    let has_reminder = match tauri::async_runtime::spawn_blocking(move || db.has_any_reminder())
        .await
    {
        Ok(Ok(v)) => v,
        _ => return,
    };
    if !has_reminder {
        return;
    }
    let state = app.notification().permission_state().ok();
    if !matches!(
        state,
        Some(PermissionState::Prompt) | Some(PermissionState::PromptWithRationale)
    ) {
        return;
    }
    let _ = app.notification().request_permission();
}

fn truncate_chars(s: &str, max: usize) -> String {
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if i >= max {
            out.push('…');
            break;
        }
        out.push(c);
    }
    out
}

fn format_local(rfc3339: &Option<String>) -> String {
    let Some(s) = rfc3339 else {
        return "—".to_string();
    };
    match chrono::DateTime::parse_from_rfc3339(s) {
        Ok(dt) => dt
            .with_timezone(&chrono::Local)
            .format("%m/%d %H:%M")
            .to_string(),
        Err(_) => s.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::todo::{CreateTodoRequest, UpdateTodoRequest, TodoStatus};

    fn fresh_db() -> Db {
        Db::open_in_memory_for_tests()
    }

    fn rfc3339_offset(seconds: i64) -> String {
        (chrono::Utc::now() + chrono::Duration::seconds(seconds)).to_rfc3339()
    }

    #[test]
    fn list_due_reminders_returns_overdue_unfired_active() {
        let db = fresh_db();
        let past = rfc3339_offset(-60);
        let future = rfc3339_offset(3600);
        let created = db
            .create_todo(CreateTodoRequest {
                content: "已到期".into(),
                due_date: None,
                reminder_time: Some(past.clone()),
                list_id: None,
            })
            .unwrap();
        let _future_one = db
            .create_todo(CreateTodoRequest {
                content: "未来".into(),
                due_date: None,
                reminder_time: Some(future),
                list_id: None,
            })
            .unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        let due = db.list_due_reminders(&now, 10).unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].id, created.id);
    }

    #[test]
    fn list_due_reminders_skips_done_and_deleted() {
        let db = fresh_db();
        let past = rfc3339_offset(-60);
        let done = db
            .create_todo(CreateTodoRequest {
                content: "已完成".into(),
                due_date: None,
                reminder_time: Some(past.clone()),
                list_id: None,
            })
            .unwrap();
        db.update_todo(UpdateTodoRequest {
            id: done.id.clone(),
            content: None,
            status: Some(TodoStatus::Done),
            due_date: None,
            reminder_time: None,
            list_id: None,
        })
        .unwrap();
        let deleted = db
            .create_todo(CreateTodoRequest {
                content: "已删除".into(),
                due_date: None,
                reminder_time: Some(past.clone()),
                list_id: None,
            })
            .unwrap();
        db.delete_todo(&deleted.id).unwrap();

        let due = db
            .list_due_reminders(&chrono::Utc::now().to_rfc3339(), 10)
            .unwrap();
        assert!(due.is_empty());
    }

    #[test]
    fn mark_reminder_fired_is_cas() {
        let db = fresh_db();
        let past = rfc3339_offset(-60);
        let todo = db
            .create_todo(CreateTodoRequest {
                content: "测试 CAS".into(),
                due_date: None,
                reminder_time: Some(past.clone()),
                list_id: None,
            })
            .unwrap();
        // 第一次 CAS 成功。
        assert!(db.mark_reminder_fired(&todo.id, &past).unwrap());
        // 第二次 CAS 失败（reminder_fired 已变）。
        assert!(!db.mark_reminder_fired(&todo.id, &past).unwrap());
    }

    #[test]
    fn mark_reminder_fired_fails_when_time_changed() {
        let db = fresh_db();
        let original = rfc3339_offset(-60);
        let todo = db
            .create_todo(CreateTodoRequest {
                content: "用户改时间".into(),
                due_date: None,
                reminder_time: Some(original),
                list_id: None,
            })
            .unwrap();
        // 用户改了 reminder_time。
        let new_time = rfc3339_offset(3600);
        db.update_todo(UpdateTodoRequest {
            id: todo.id.clone(),
            content: None,
            status: None,
            due_date: None,
            reminder_time: Some(Some(new_time.clone())),
            list_id: None,
        })
        .unwrap();
        // 调度器拿着旧时间 CAS：应失败。
        let claimed = db
            .mark_reminder_fired(&todo.id, "2026-01-01T00:00:00Z")
            .unwrap();
        assert!(!claimed);
        // 任务的 reminder_fired 仍是 0（未被旧时间影响）。
        let after = db.list_todos().unwrap().into_iter().find(|t| t.id == todo.id).unwrap();
        assert!(!after.reminder_fired);
    }

    #[test]
    fn update_todo_resets_reminder_fired_on_time_change() {
        let db = fresh_db();
        let past = rfc3339_offset(-60);
        let todo = db
            .create_todo(CreateTodoRequest {
                content: "改提醒重置 fired".into(),
                due_date: None,
                reminder_time: Some(past.clone()),
                list_id: None,
            })
            .unwrap();
        db.mark_reminder_fired(&todo.id, &past).unwrap();
        // 现在 fired=1。
        let before = db.list_todos().unwrap().into_iter().find(|t| t.id == todo.id).unwrap();
        assert!(before.reminder_fired);

        // 用户改时间。
        let new_time = rfc3339_offset(3600);
        let updated = db
            .update_todo(UpdateTodoRequest {
                id: todo.id.clone(),
                content: None,
                status: None,
                due_date: None,
                reminder_time: Some(Some(new_time.clone())),
                list_id: None,
            })
            .unwrap();
        assert!(!updated.reminder_fired);
        assert_eq!(updated.reminder_time.as_deref(), Some(new_time.as_str()));
    }

    #[test]
    fn update_todo_keeps_reminder_fired_when_time_untouched() {
        let db = fresh_db();
        let past = rfc3339_offset(-60);
        let todo = db
            .create_todo(CreateTodoRequest {
                content: "改内容不动 fired".into(),
                due_date: None,
                reminder_time: Some(past.clone()),
                list_id: None,
            })
            .unwrap();
        db.mark_reminder_fired(&todo.id, &past).unwrap();

        let updated = db
            .update_todo(UpdateTodoRequest {
                id: todo.id.clone(),
                content: Some("改了文本".into()),
                status: None,
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap();
        assert!(updated.reminder_fired);
    }

    #[test]
    fn update_todo_fills_started_at_on_first_doing() {
        let db = fresh_db();
        let todo = db
            .create_todo(CreateTodoRequest {
                content: "首次开始".into(),
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap();
        assert!(todo.started_at.is_none());

        let updated = db
            .update_todo(UpdateTodoRequest {
                id: todo.id.clone(),
                content: None,
                status: Some(TodoStatus::Doing),
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap();
        let first_started = updated.started_at.clone().expect("started_at should be set");

        // 第二次切到 doing 不应覆盖。
        db.update_todo(UpdateTodoRequest {
            id: todo.id.clone(),
            content: None,
            status: Some(TodoStatus::Paused),
            due_date: None,
            reminder_time: None,
            list_id: None,
        })
        .unwrap();
        let back = db
            .update_todo(UpdateTodoRequest {
                id: todo.id.clone(),
                content: None,
                status: Some(TodoStatus::Doing),
                due_date: None,
                reminder_time: None,
                list_id: None,
            })
            .unwrap();
        assert_eq!(back.started_at, Some(first_started));
    }

    #[test]
    fn has_any_reminder_reflects_db_state() {
        let db = fresh_db();
        assert!(!db.has_any_reminder().unwrap());
        db.create_todo(CreateTodoRequest {
            content: "无提醒".into(),
            due_date: None,
            reminder_time: None,
            list_id: None,
        })
        .unwrap();
        assert!(!db.has_any_reminder().unwrap());
        db.create_todo(CreateTodoRequest {
            content: "有提醒".into(),
            due_date: None,
            reminder_time: Some(rfc3339_offset(3600)),
            list_id: None,
        })
        .unwrap();
        assert!(db.has_any_reminder().unwrap());
    }
}
