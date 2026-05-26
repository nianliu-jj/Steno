//! 待办事项（todos）模块 — 数据模型、状态枚举、跨窗口事件 payload。
//!
//! ## 设计要点
//! - 字段对齐 ZhiDo（D:\待办事项\ZhiDo），但 id 用 TEXT/UUID 与 Steno 既有 schema 一致。
//! - 状态枚举 `todo` / `doing` / `paused` / `done`；删除走逻辑删除 `is_deleted=1`。
//! - 所有时间戳采用 RFC3339 字符串（与 notes、clipboard_history 一致），便于前端直接 `new Date()`。
//! - 跨窗口同步事件统一为 `steno:todo-changed`，payload 含 `kind`(`created`/`updated`/`completed`/`deleted`)。
//!
//! ## 关键边界
//! - `content` 限定 1..=500 字符（前后端共识，前端禁止超过、后端兜底校验）。
//! - `due_date`/`reminder_time`/`completed_at` 为可选；`due_date IS NULL` 表示"今天创建即今天"。
//! - `list_id` 为字符串，留作后续多清单扩展（"收件箱"、"工作"等），默认 `default`。

use serde::{Deserialize, Serialize};

/// 待办事项跨窗口同步事件名（Tauri global emit）。
pub const TODO_CHANGED_EVENT: &str = "steno:todo-changed";

/// 待办浮窗切换事件名（全局快捷键 → 浮窗前端）。Phase 2 才会发出。
#[allow(dead_code)]
pub const TODO_PANEL_TOGGLE_EVENT: &str = "steno:todo-panel-toggle";

/// 待办状态机：
/// - `Todo`   新建未开始（默认）
/// - `Doing`  主动开始（主窗口可手动切换）
/// - `Paused` 暂停（主窗口可手动切换）
/// - `Done`   已完成（勾选触发）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TodoStatus {
    Todo,
    Doing,
    Paused,
    Done,
}

impl TodoStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TodoStatus::Todo => "todo",
            TodoStatus::Doing => "doing",
            TodoStatus::Paused => "paused",
            TodoStatus::Done => "done",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "todo" => Some(TodoStatus::Todo),
            "doing" => Some(TodoStatus::Doing),
            "paused" => Some(TodoStatus::Paused),
            "done" => Some(TodoStatus::Done),
            _ => None,
        }
    }
}

/// 待办事项 DTO — 直接 emit/返回给前端。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    pub content: String,
    pub status: TodoStatus,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub due_date: Option<String>,
    pub reminder_time: Option<String>,
    /// 提醒是否已被调度器触发（防止重复弹通知）。修改 `reminder_time` 时后端会重置为 false。
    pub reminder_fired: bool,
    /// `status` 首次进入 `Doing` 的 RFC3339 时间戳；用于"开始"折线统计。
    pub started_at: Option<String>,
    pub list_id: String,
}

/// 新建请求 DTO。`id` 由后端生成；`status` 不在创建期暴露（始终为 `Todo`）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTodoRequest {
    pub content: String,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub reminder_time: Option<String>,
    #[serde(default)]
    pub list_id: Option<String>,
}

/// 更新请求 DTO。所有字段可选，仅传入需要修改的字段。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTodoRequest {
    pub id: String,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub status: Option<TodoStatus>,
    #[serde(default)]
    pub due_date: Option<Option<String>>,
    #[serde(default)]
    pub reminder_time: Option<Option<String>>,
    #[serde(default)]
    pub list_id: Option<String>,
}

/// "今日"查询请求。`include_completed=true` 时也带出当日已完成（浮窗顶部计数用）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodayTodosRequest {
    #[serde(default)]
    pub include_completed: bool,
}

/// 统计查询范围：日期格式为 YYYY-MM-DD。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoStatsRange {
    pub start: String,
    pub end: String,
}

/// 每日趋势查询输入。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoDailyTrendRequest {
    pub start: String,
    pub end: String,
    #[serde(default)]
    pub status_filter: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TodoActivityPoint {
    pub date: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TodoTrendPoint {
    pub date: String,
    pub created: i64,
    pub started: i64,
    pub completed: i64,
}

/// 跨窗口事件变更类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TodoChangeKind {
    Created,
    Updated,
    Completed,
    Deleted,
    Reset,
}

/// 跨窗口事件 payload。`todo` 为快照（被删除时为 `None`）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoChangePayload {
    pub kind: TodoChangeKind,
    pub id: String,
    pub todo: Option<Todo>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_round_trip() {
        for s in [
            TodoStatus::Todo,
            TodoStatus::Doing,
            TodoStatus::Paused,
            TodoStatus::Done,
        ] {
            assert_eq!(TodoStatus::parse(s.as_str()), Some(s));
        }
        assert_eq!(TodoStatus::parse("unknown"), None);
    }

    #[test]
    fn todo_serializes_to_camel_case() {
        let todo = Todo {
            id: "abc".into(),
            content: "demo".into(),
            status: TodoStatus::Todo,
            created_at: "2026-05-26T10:00:00Z".into(),
            updated_at: "2026-05-26T10:00:00Z".into(),
            completed_at: None,
            due_date: None,
            reminder_time: None,
            reminder_fired: false,
            started_at: None,
            list_id: "default".into(),
        };
        let json = serde_json::to_value(&todo).unwrap();
        assert_eq!(json["createdAt"], "2026-05-26T10:00:00Z");
        assert_eq!(json["updatedAt"], "2026-05-26T10:00:00Z");
        assert_eq!(json["listId"], "default");
        assert_eq!(json["status"], "todo");
        assert_eq!(json["reminderFired"], false);
        assert!(json["startedAt"].is_null());
        assert!(json.get("created_at").is_none());
    }

    #[test]
    fn change_payload_serializes_kind_lowercase() {
        let payload = TodoChangePayload {
            kind: TodoChangeKind::Created,
            id: "abc".into(),
            todo: None,
        };
        let json = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["kind"], "created");
    }

    #[test]
    fn reset_payload_serializes_kind_lowercase() {
        let payload = TodoChangePayload {
            kind: TodoChangeKind::Reset,
            id: String::new(),
            todo: None,
        };
        let json = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["kind"], "reset");
    }
}
