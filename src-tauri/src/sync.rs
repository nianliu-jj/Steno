// 同步服务预留。Plan Task 2 Step 8。
//
// MVP 决策：只支持本地（LocalOnlySync 是 no-op）；通过 trait 留出未来接入
// 云同步 / 协同编辑的接口。SyncService 必须 Send + Sync 才能进 Tauri State。

#[allow(dead_code)]
pub trait SyncService: Send + Sync {
    /// 笔记保存后调用。本地实现为 no-op；远端实现负责入队 + 后台上传。
    fn enqueue_note_changed(&self, note_id: &str);
}

#[allow(dead_code)]
pub struct LocalOnlySync;

impl SyncService for LocalOnlySync {
    fn enqueue_note_changed(&self, _note_id: &str) {
        // 本地存储模式 — 永远不出口数据。
    }
}
