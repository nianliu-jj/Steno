# 文本文档与工作区分组 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Steno 同时支持数据库文本和磁盘文档，补齐工作区/文件夹/分组结构、主列表混合显示、文本 `10KB` 限制、原地转文档、类型筛选与当前工作区底部栏。

**Architecture:** 这次改动分四层推进。第一层先把 Rust 端从单一 `notes` 记录升级成“统一条目索引 + 文本文字存在数据库 + 文档正文存在磁盘”的模型，并暴露新的 Tauri commands；第二层新增前端 `library` store 和 typed IPC，显式维护当前工作区、当前文件夹、当前分组和持久化类型筛选；第三层重做 `MainView`，把中心列表、右侧工作区树、底部工作区栏和右键动作接到新模型；第四层把 `FloatingEditor` 和 `NoteEditorView` 分流到 `text` / `document` 保存路径，确保速记、新建文档和文本转文档都按新规则运行。

**Tech Stack:** Vue 3、TypeScript、Pinia、Vitest、Naive UI、Tauri 2、Rust、rusqlite、walkdir、`@tauri-apps/plugin-dialog`。

---

## 文件结构与责任

- `package.json`
  - 新增工作区选择所需的 `@tauri-apps/plugin-dialog` 前端依赖。
- `src-tauri/Cargo.toml`
  - 新增 `tauri-plugin-dialog` 和 `walkdir` 依赖。
- `src-tauri/src/models.rs`
  - 定义统一条目模型、条目类型、工作区树节点、编辑器读取 DTO 和保存请求 DTO。
- `src-tauri/src/db.rs`
  - 管理 `workspaces`、`library_entries` 和迁移逻辑；实现文本字节限制、默认分组、文档索引更新和类型筛选读取。
- `src-tauri/src/workspace_fs.rs`
  - 负责目录扫描、Markdown 文件读写、目标路径生成和文本转文档落盘。
- `src-tauri/src/commands.rs`
  - 暴露工作区选择、混合列表查询、工作区树查询、文本/文档保存和转换命令。
- `src-tauri/src/lib.rs`
  - 注册新 commands 和 dialog plugin。
- `src/types/steno.ts`
  - 前端条目类型、工作区树节点、编辑器条目 DTO 与保存请求。
- `src/composables/useDb.ts`
  - 新增 library/workspace/document/text 相关 typed IPC 封装。
- `src/stores/settings.ts`
  - 新增 `mainListTypeFilters` 设置键解码与更新。
- `src/stores/library.ts`
  - 主列表混合数据、当前工作区/文件夹/分组上下文、类型筛选、统计和工作区树状态。
- `src/stores/library.test.ts`
  - 验证当前页统计、类型筛选和上下文切换逻辑。
- `src/components/EntryTypeBadge.vue`
  - 文件夹、分组、文档、文本的统一角标。
- `src/components/WorkspaceTreePanel.vue`
  - 右侧工作区树展示与节点点击。
- `src/components/WorkspaceTreePanel.test.ts`
  - 验证工作区树只渲染文件夹/文档，不混入分组/文本。
- `src/components/WorkspacePickerDialog.vue`
  - 无工作区时的新建文档/转文档选择工作区入口。
- `src/views/MainView.vue`
  - 重做为混合内容列表，新增类型筛选、卡片角标、右键“转为文档”、底部工作区栏和右侧结构栏入口。
- `src/views/MainView.test.ts`
  - 验证混合列表、类型筛选、类型角标、右键转换动作和底部统计。
- `src/components/FloatingEditor.vue`
  - 速记保存改走 `text`，接入默认分组与 `10KB` 限制提示。
- `src/views/NoteEditorView.vue`
  - 根据条目类型分别读取/保存数据库文本和磁盘文档。
- `src/views/NoteEditorView.test.ts`
  - 验证文档落点、文本超限和文本/文档保存分流。

### Task 1: 升级 Rust 端存储模型与命令面

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/db.rs`
- Create: `src-tauri/src/workspace_fs.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing tests**

先在 Rust 侧补三个关键失败用例：文本 `10KB` 限制、默认分组、文本转文档落点。

把下面三条测试加到 [src-tauri/src/db.rs](/D:/Steno/src-tauri/src/db.rs:1) 的现有 `#[cfg(test)]` 模块里：

```rust
#[test]
fn save_text_rejects_markdown_body_over_10kb() {
    let db = fresh_db();
    let content = "a".repeat(10 * 1024 + 1);

    let err = db
        .save_text_entry(SaveTextEntryRequest {
            id: None,
            title: Some("超限文本".into()),
            content,
            tags: vec![],
            group_id: None,
        })
        .unwrap_err()
        .to_string();

    assert!(err.contains("文本文件最大不能超过 10KB"), "{err}");
}

#[test]
fn save_text_without_group_uses_system_inbox_group() {
    let db = fresh_db();
    let saved = db
        .save_text_entry(SaveTextEntryRequest {
            id: None,
            title: Some("默认分组文本".into()),
            content: "hello".into(),
            tags: vec![],
            group_id: None,
        })
        .unwrap();

    assert_eq!(saved.kind, EntryKind::Text);
    assert_eq!(saved.group_id.as_deref(), Some("group-inbox"));
}

#[test]
fn convert_text_to_document_writes_markdown_file_and_changes_kind() {
    let db = fresh_db();
    let workspace = db
        .create_workspace("默认工作区", std::env::temp_dir().join("steno-plan-test"))
        .unwrap();
    let text = db
        .save_text_entry(SaveTextEntryRequest {
            id: None,
            title: Some("待转换".into()),
            content: "# 标题\n正文".into(),
            tags: vec!["draft".into()],
            group_id: Some("group-inbox".into()),
        })
        .unwrap();

    let converted = db
        .convert_text_to_document(ConvertTextToDocumentRequest {
            id: text.id.clone(),
            workspace_id: workspace.id.clone(),
            folder_entry_id: None,
        })
        .unwrap();

    assert_eq!(converted.kind, EntryKind::Document);
    assert!(converted.file_path.as_ref().is_some());
    assert!(std::fs::exists(converted.file_path.as_ref().unwrap()).unwrap());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test save_text_rejects_markdown_body_over_10kb save_text_without_group_uses_system_inbox_group convert_text_to_document_writes_markdown_file_and_changes_kind --manifest-path src-tauri/Cargo.toml`

Expected: FAIL，因为当前 `db.rs` 只有单一 `notes` 表，没有 `save_text_entry`、`create_workspace` 和 `convert_text_to_document`。

- [ ] **Step 3: Write minimal implementation**

先加依赖：

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "macos-private-api"] }
tauri-plugin-dialog = "2"
walkdir = "2"
```

```json
// package.json
{
  "dependencies": {
    "@tauri-apps/plugin-dialog": "^2.0.0"
  }
}
```

把 [src-tauri/src/models.rs](/D:/Steno/src-tauri/src/models.rs:1) 从单一 `Note` 扩成统一条目 DTO：

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EntryKind {
    Workspace,
    Folder,
    Group,
    Text,
    Document,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    pub id: String,
    pub kind: EntryKind,
    pub title: String,
    pub preview_text: String,
    pub tags: Vec<String>,
    pub workspace_id: Option<String>,
    pub parent_id: Option<String>,
    pub group_id: Option<String>,
    pub file_path: Option<String>,
    pub word_count: i64,
    pub byte_size: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTextEntryRequest {
    pub id: Option<String>,
    pub title: Option<String>,
    pub content: String,
    pub tags: Vec<String>,
    pub group_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertTextToDocumentRequest {
    pub id: String,
    pub workspace_id: String,
    pub folder_entry_id: Option<String>,
}
```

在 [src-tauri/src/db.rs](/D:/Steno/src-tauri/src/db.rs:1) 增加 `user_version = 2` 迁移，建立统一索引表：

```rust
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS library_entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  preview_text TEXT NOT NULL DEFAULT '',
  body_markdown TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  workspace_id TEXT,
  parent_id TEXT,
  group_id TEXT,
  file_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  byte_size INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_library_entries_kind ON library_entries(kind);
CREATE INDEX IF NOT EXISTS idx_library_entries_workspace_parent ON library_entries(workspace_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_library_entries_group_parent ON library_entries(group_id, parent_id);
```

在同文件里新增文本大小限制：

```rust
fn markdown_byte_size(content: &str) -> i64 {
    content.as_bytes().len() as i64
}

fn ensure_text_size_limit(content: &str) -> Result<i64, DbError> {
    let size = markdown_byte_size(content);
    if size > 10 * 1024 {
        let kb = (size as f64 / 1024.0).ceil() as i64;
        return Err(DbError::Validation(format!(
            "当前文件大小 {}KB，文本文件最大不能超过 10KB",
            kb
        )));
    }
    Ok(size)
}
```

以及默认分组与转换逻辑：

```rust
const INBOX_GROUP_ID: &str = "group-inbox";

fn ensure_default_group(conn: &Connection) -> Result<(), DbError> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO library_entries
         (id, kind, title, preview_text, tags, created_at, updated_at)
         VALUES (?1, 'group', '收件箱', '', '[]', ?2, ?2)",
        rusqlite::params![INBOX_GROUP_ID, &now],
    )?;
    Ok(())
}
```

把文件系统读写收进新文件 [workspace_fs.rs](/D:/Steno/src-tauri/src/workspace_fs.rs:1)：

```rust
use std::path::{Path, PathBuf};

pub fn build_document_path(root: &Path, title: &str) -> PathBuf {
    let stem = title.trim().replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "-");
    root.join(format!("{stem}.md"))
}

pub fn write_markdown_file(path: &Path, content: &str) -> Result<(), std::io::Error> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, content)
}
```

最后在 [src-tauri/src/commands.rs](/D:/Steno/src-tauri/src/commands.rs:1) 和 [src-tauri/src/lib.rs](/D:/Steno/src-tauri/src/lib.rs:1) 暴露新命令：

```rust
#[tauri::command]
pub async fn save_text_entry(
    db: State<'_, Db>,
    input: SaveTextEntryRequest,
) -> Result<LibraryEntry, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.save_text_entry(input))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}

#[tauri::command]
pub async fn convert_text_to_document(
    db: State<'_, Db>,
    input: ConvertTextToDocumentRequest,
) -> Result<LibraryEntry, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.convert_text_to_document(input))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test save_text_rejects_markdown_body_over_10kb save_text_without_group_uses_system_inbox_group convert_text_to_document_writes_markdown_file_and_changes_kind --manifest-path src-tauri/Cargo.toml`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add package.json src-tauri/Cargo.toml src-tauri/src/models.rs src-tauri/src/db.rs src-tauri/src/workspace_fs.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: 引入文本文档统一条目存储模型"
```

### Task 2: 建立前端 library store 与 typed IPC

**Files:**
- Modify: `src/types/steno.ts`
- Modify: `src/composables/useDb.ts`
- Modify: `src/stores/settings.ts`
- Create: `src/stores/library.ts`
- Create: `src/stores/library.test.ts`

- [ ] **Step 1: Write the failing tests**

创建 [src/stores/library.test.ts](/D:/Steno/src/stores/library.test.ts:1)，先锁定当前页统计、类型筛选和上下文切换：

```ts
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLibraryStore } from './library';

const db = {
  listLibraryEntries: vi.fn(),
  listWorkspaceTree: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(() => Promise.resolve()),
};

vi.mock('@/composables/useDb', () => ({
  useDb: () => db,
}));

describe('library store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('computes bottom stats from the currently visible entries only', async () => {
    db.listLibraryEntries.mockResolvedValue([
      { id: 'folder-1', kind: 'folder', title: 'A', previewText: '', tags: [] },
      { id: 'doc-1', kind: 'document', title: 'B', previewText: '', tags: [] },
      { id: 'group-1', kind: 'group', title: 'G', previewText: '', tags: [] },
      { id: 'text-1', kind: 'text', title: 'T', previewText: '', tags: [] },
    ]);

    const store = useLibraryStore();
    await store.loadMainList();

    expect(store.stats).toEqual({
      folders: 1,
      groups: 1,
      documents: 1,
      texts: 1,
    });
  });
});
```

同时扩展 [src/stores/settings.ts](/D:/Steno/src/stores/settings.ts:1) 的测试面：先在计划里新增 `mainListTypeFilters` 解码断言。

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/stores/library.test.ts`

Expected: FAIL，因为 `useLibraryStore()` 和 `listLibraryEntries()` 目前都不存在。

- [ ] **Step 3: Write minimal implementation**

把 [src/types/steno.ts](/D:/Steno/src/types/steno.ts:1) 补成统一条目前端 DTO：

```ts
export type EntryKind = 'workspace' | 'folder' | 'group' | 'text' | 'document';

export interface LibraryEntry {
  id: string;
  kind: EntryKind;
  title: string;
  previewText: string;
  tags: string[];
  workspaceId?: string | null;
  parentId?: string | null;
  groupId?: string | null;
  filePath?: string | null;
  wordCount?: number;
  byteSize?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MainListContext {
  workspaceId: string | null;
  folderEntryId: string | null;
  groupEntryId: string | null;
  selectedEntryId: string | null;
}
```

在 [src/composables/useDb.ts](/D:/Steno/src/composables/useDb.ts:1) 增加 typed IPC：

```ts
function listLibraryEntries(context: MainListContext) {
  return invoke<LibraryEntry[]>('list_library_entries', { context });
}

function listWorkspaceTree(workspaceId: string) {
  return invoke<LibraryEntry[]>('list_workspace_tree', { workspaceId });
}

function saveTextEntry(input: SaveTextEntryRequest) {
  return invoke<LibraryEntry>('save_text_entry', { input });
}

function convertTextToDocument(input: ConvertTextToDocumentRequest) {
  return invoke<LibraryEntry>('convert_text_to_document', { input });
}
```

在 [src/stores/settings.ts](/D:/Steno/src/stores/settings.ts:1) 增加持久化类型筛选键：

```ts
export interface StenoSettings {
  // ...
  mainListTypeFilters: string;
}

const DEFAULTS: StenoSettings = {
  // ...
  mainListTypeFilters: 'folder,group,document,text',
};
```

新增 [src/stores/library.ts](/D:/Steno/src/stores/library.ts:1)：

```ts
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { useDb } from '@/composables/useDb';
import type { EntryKind, LibraryEntry, MainListContext } from '@/types/steno';

export const useLibraryStore = defineStore('library', () => {
  const db = useDb();
  const entries = ref<LibraryEntry[]>([]);
  const workspaceTree = ref<LibraryEntry[]>([]);
  const context = ref<MainListContext>({
    workspaceId: null,
    folderEntryId: null,
    groupEntryId: null,
    selectedEntryId: null,
  });
  const typeFilters = ref<EntryKind[]>(['folder', 'group', 'document', 'text']);

  const visibleEntries = computed(() =>
    entries.value.filter(entry => typeFilters.value.includes(entry.kind)),
  );

  const stats = computed(() => ({
    folders: visibleEntries.value.filter(entry => entry.kind === 'folder').length,
    groups: visibleEntries.value.filter(entry => entry.kind === 'group').length,
    documents: visibleEntries.value.filter(entry => entry.kind === 'document').length,
    texts: visibleEntries.value.filter(entry => entry.kind === 'text').length,
  }));

  async function loadMainList() {
    entries.value = await db.listLibraryEntries(context.value);
  }

  return { entries, workspaceTree, context, typeFilters, visibleEntries, stats, loadMainList };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/stores/library.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/types/steno.ts src/composables/useDb.ts src/stores/settings.ts src/stores/library.ts src/stores/library.test.ts
git commit -m "feat: 新增工作区分组前端状态与IPC封装"
```

### Task 3: 重做 MainView 为混合内容列表

**Files:**
- Create: `src/components/EntryTypeBadge.vue`
- Create: `src/components/WorkspaceTreePanel.vue`
- Create: `src/components/WorkspaceTreePanel.test.ts`
- Create: `src/components/WorkspacePickerDialog.vue`
- Modify: `src/views/MainView.vue`
- Modify: `src/views/MainView.test.ts`

- [ ] **Step 1: Write the failing tests**

先把 [src/views/MainView.test.ts](/D:/Steno/src/views/MainView.test.ts:1) 从 `notes store` 驱动改成 `library store` 驱动，并锁定类型角标、右键动作和底部统计。

新增一条混合列表断言：

```ts
it('renders mixed cards with type badges and current-page footer stats', async () => {
  libraryEntries.value = [
    makeEntry({ id: 'folder-1', kind: 'folder', title: '项目目录' }),
    makeEntry({ id: 'doc-1', kind: 'document', title: '设计文档' }),
    makeEntry({ id: 'group-1', kind: 'group', title: '收件箱' }),
    makeEntry({ id: 'text-1', kind: 'text', title: '速记文本' }),
  ];

  const wrapper = mount(WrappedMainView);
  await flushPromises();

  expect(wrapper.findAll('.entry-card')).toHaveLength(4);
  expect(wrapper.text()).toContain('文件夹');
  expect(wrapper.text()).toContain('文档');
  expect(wrapper.text()).toContain('分组');
  expect(wrapper.text()).toContain('文本');
  expect(wrapper.get('[data-testid="main-footer-stats"]').text()).toContain('文档 1');
  expect(wrapper.get('[data-testid="main-footer-stats"]').text()).toContain('文本 1');
  expect(wrapper.get('[data-testid="main-footer-workspace"]').text()).toContain('未选择工作区');
});
```

再补一条“转为文档只对文本可用”：

```ts
it('enables convert-to-document only for text cards', async () => {
  libraryEntries.value = [
    makeEntry({ id: 'doc-1', kind: 'document', title: '设计文档' }),
    makeEntry({ id: 'text-1', kind: 'text', title: '速记文本' }),
  ];

  const wrapper = mount(WrappedMainView);
  await flushPromises();

  await wrapper.findAll('.entry-card')[0].trigger('contextmenu', { preventDefault: vi.fn(), clientX: 50, clientY: 60 });
  expect(wrapper.get('[data-testid="context-convert-document"]').attributes('aria-disabled')).toBe('true');

  await wrapper.findAll('.entry-card')[1].trigger('contextmenu', { preventDefault: vi.fn(), clientX: 50, clientY: 60 });
  expect(wrapper.get('[data-testid="context-convert-document"]').attributes('aria-disabled')).toBe('false');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/views/MainView.test.ts`

Expected: FAIL，因为当前 `MainView.vue` 只认识 `Note`，没有类型角标、底部工作区栏和 `context-convert-document`。

- [ ] **Step 3: Write minimal implementation**

新增 [EntryTypeBadge.vue](/D:/Steno/src/components/EntryTypeBadge.vue:1)：

```vue
<script setup lang="ts">
defineProps<{ kind: 'folder' | 'group' | 'document' | 'text' }>();
</script>

<template>
  <span class="entry-type-badge" :data-kind="kind">
    {{ kind === 'folder' ? '文件夹' : kind === 'group' ? '分组' : kind === 'document' ? '文档' : '文本' }}
  </span>
</template>
```

新增 [WorkspaceTreePanel.vue](/D:/Steno/src/components/WorkspaceTreePanel.vue:1)：

```vue
<script setup lang="ts">
import type { LibraryEntry } from '@/types/steno';
defineProps<{ entries: LibraryEntry[] }>();
</script>

<template>
  <aside class="workspace-tree-panel">
    <button
      v-for="entry in entries"
      :key="entry.id"
      class="workspace-tree-item"
      type="button"
    >
      {{ entry.title }}
    </button>
  </aside>
</template>
```

把 [src/views/MainView.vue](/D:/Steno/src/views/MainView.vue:1) 改为基于 `library` store：

```ts
import EntryTypeBadge from '@/components/EntryTypeBadge.vue';
import WorkspaceTreePanel from '@/components/WorkspaceTreePanel.vue';
import WorkspacePickerDialog from '@/components/WorkspacePickerDialog.vue';
import { useLibraryStore } from '@/stores/library';

const library = useLibraryStore();
const showWorkspaceTree = ref(false);

onMounted(() => {
  void library.loadMainList();
});
```

列表模板替换成统一 entry 卡片：

```vue
<section v-if="library.visibleEntries.length > 0" class="entries-grid">
  <article
    v-for="entry in library.visibleEntries"
    :key="entry.id"
    class="entry-card"
    @contextmenu.stop="onContextMenuEntry($event, entry)"
  >
    <div class="entry-card-head">
      <h3>{{ entry.title || '无标题' }}</h3>
      <EntryTypeBadge
        v-if="entry.kind === 'folder' || entry.kind === 'group' || entry.kind === 'document' || entry.kind === 'text'"
        :kind="entry.kind"
      />
    </div>
    <p>{{ entry.previewText }}</p>
  </article>
</section>
```

右键菜单加新动作：

```vue
<button
  class="context-item"
  type="button"
  data-testid="context-convert-document"
  :disabled="contextTargetEntry?.kind !== 'text'"
  :aria-disabled="contextTargetEntry?.kind !== 'text'"
  @click="onContextConvertToDocument"
>
  转为文档
</button>
```

底部栏：

```vue
<footer class="main-footer">
  <div class="main-footer-workspace" data-testid="main-footer-workspace">
    {{ library.context.workspaceId ? `当前工作区：${library.currentWorkspaceLabel}` : '未选择工作区' }}
  </div>
  <div class="main-footer-stats" data-testid="main-footer-stats">
    文档 {{ library.stats.documents }} · 文本 {{ library.stats.texts }} · 文件夹 {{ library.stats.folders }} · 分组 {{ library.stats.groups }}
  </div>
  <button type="button" data-testid="main-footer-open-tree" @click="showWorkspaceTree = !showWorkspaceTree">
    工作区结构
  </button>
</footer>

<WorkspaceTreePanel v-if="showWorkspaceTree" :entries="library.workspaceTree" />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/views/MainView.test.ts src/components/WorkspaceTreePanel.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/EntryTypeBadge.vue src/components/WorkspaceTreePanel.vue src/components/WorkspaceTreePanel.test.ts src/components/WorkspacePickerDialog.vue src/views/MainView.vue src/views/MainView.test.ts
git commit -m "feat: 重做主列表混合视图与工作区结构栏"
```

### Task 4: 让速记和主编辑页按 text/document 分流

**Files:**
- Modify: `src/components/FloatingEditor.vue`
- Create: `src/components/FloatingEditor.test.ts`
- Modify: `src/views/NoteEditorView.vue`
- Modify: `src/views/NoteEditorView.test.ts`

- [ ] **Step 1: Write the failing tests**

新增 [src/components/FloatingEditor.test.ts](/D:/Steno/src/components/FloatingEditor.test.ts:1)，锁定 `10KB` 错误提示：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import FloatingEditor from './FloatingEditor.vue';

const saveTextEntry = vi.fn(async () => {
  throw new Error('当前文件大小 11KB，文本文件最大不能超过 10KB');
});

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    saveTextEntry,
  }),
}));

describe('FloatingEditor', () => {
  it('keeps the window open and shows the size error when text exceeds 10kb', async () => {
    const wrapper = mount(FloatingEditor);
    await wrapper.find('textarea').setValue('x'.repeat(12 * 1024));
    await flushPromises();

    expect(wrapper.text()).toContain('文本文件最大不能超过 10KB');
  });
});
```

把 [src/views/NoteEditorView.test.ts](/D:/Steno/src/views/NoteEditorView.test.ts:1) 扩成“双类型读取”：

```ts
const getEditorEntry = vi.fn((id: string) => Promise.resolve({
  id,
  kind: 'document',
  title: '设计文档',
  content: '# 标题\n正文',
  tags: ['spec'],
}));
```

新增断言：

```ts
it('loads a document entry from the editor command instead of getNote', async () => {
  const wrapper = mount(WrappedNoteEditorView);
  await flushPromises();

  expect(getEditorEntry).toHaveBeenCalledWith('note-1');
  expect(wrapper.get('.note-editor-title-text').text()).toBe('设计文档');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/components/FloatingEditor.test.ts src/views/NoteEditorView.test.ts`

Expected: FAIL，因为当前 `FloatingEditor.vue` 仍走 `notes.saveDraft()`，`NoteEditorView.vue` 仍直接调用 `db.getNote()`。

- [ ] **Step 3: Write minimal implementation**

让 [src/components/FloatingEditor.vue](/D:/Steno/src/components/FloatingEditor.vue:1) 直接走文本保存命令：

```ts
import { useDb } from '@/composables/useDb';

const db = useDb();
const library = useLibraryStore();

const { status, savedAt, error, scheduleSave, flushSave } = useAutosave(
  async () => {
    const saved = await db.saveTextEntry({
      id: currentNoteId.value ?? undefined,
      title: title.value || undefined,
      content: content.value,
      tags: tagsArray.value,
      groupId: library.currentGroupId ?? undefined,
    });
    if (!currentNoteId.value) {
      currentNoteId.value = saved.id;
    }
  },
);
```

在页脚显示后端错误：

```vue
<NText
  depth="3"
  class="floating-meta-item"
  :class="{ 'floating-meta-error': status === 'error' }"
>
  {{ status === 'error' ? String(error).slice(0, 40) : statusText }}
</NText>
```

让 [src/views/NoteEditorView.vue](/D:/Steno/src/views/NoteEditorView.vue:1) 使用统一编辑器命令：

```ts
const entry = ref<EditorEntry | null>(null);

onMounted(async () => {
  if (currentNoteId.value) {
    entry.value = await db.getEditorEntry(currentNoteId.value);
    if (entry.value) {
      title.value = entry.value.title;
      content.value = entry.value.content;
      tags.value = [...entry.value.tags];
    }
  }
  loaded.value = true;
});

watch([title, content, tags], () => {
  if (!loaded.value || !entry.value) return;
  if (entry.value.kind === 'text') {
    scheduleSave({
      kind: 'text',
      id: entry.value.id,
      title: title.value || undefined,
      content: content.value,
      tags: tags.value,
      groupId: entry.value.groupId ?? undefined,
    });
    return;
  }

  scheduleSave({
    kind: 'document',
    id: entry.value.id,
    title: title.value || undefined,
    content: content.value,
    tags: tags.value,
    workspaceId: entry.value.workspaceId!,
    folderEntryId: entry.value.parentId ?? undefined,
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/components/FloatingEditor.test.ts src/views/NoteEditorView.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/FloatingEditor.vue src/components/FloatingEditor.test.ts src/views/NoteEditorView.vue src/views/NoteEditorView.test.ts
git commit -m "feat: 分流速记文本与磁盘文档编辑保存"
```

## Final Verification

- [ ] Run: `cargo test --manifest-path src-tauri/Cargo.toml`
  - Expected: PASS，包含文本 `10KB` 限制、默认分组和文本转文档用例。
- [ ] Run: `pnpm vitest run src/stores/library.test.ts src/views/MainView.test.ts src/components/WorkspaceTreePanel.test.ts src/components/FloatingEditor.test.ts src/views/NoteEditorView.test.ts`
  - Expected: PASS。
- [ ] Run: `pnpm typecheck`
  - Expected: exit 0，没有新增 store、DTO 或视图类型错误。
- [ ] Run: `pnpm lint`
  - Expected: exit 0；如果自动修改文件，再回跑上面的 Vitest 命令。
- [ ] Run: `pnpm build`
  - Expected: `vite build` 成功，`@tauri-apps/plugin-dialog` 和新的 store / 组件导入都通过。
- [ ] Run: `pnpm tauri:dev`
  - Manual check:
    - 速记保存的文本超过 `10KB` 时失败并显示精确提示。
    - 新建笔记在工作区根目录和子文件夹下分别落到正确磁盘位置。
    - 没有工作区时，新建文档和“转为文档”会先提示选工作区。
    - 主列表卡片右上角能区分文件夹、分组、文档、文本。
    - 右键“转为文档”只对文本可用。
    - 主列表底部能显示当前工作区和当前页四类统计。
    - 类型筛选在重启后恢复。

## 自检结果

- Spec coverage: 覆盖文本/文档分流、`10KB` 限制、默认分组、工作区/文件夹落点、混合列表、右侧工作区树、类型筛选、底部统计和原地转文档。
- Placeholder scan: 计划没有留下 TBD / TODO / “类似前一步” 这种占位；每个阶段都给了具体文件、测试和命令。
- Type consistency: `EntryKind`、`LibraryEntry`、`MainListContext`、`SaveTextEntryRequest`、`ConvertTextToDocumentRequest`、`mainListTypeFilters` 在 Rust、TS、store 和视图层保持同名。
