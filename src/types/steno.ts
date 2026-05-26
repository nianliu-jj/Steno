/**
 * @file 前端 DTO 类型定义 — IPC 边界处的 TypeScript 镜像
 *
 * 与 `src-tauri/src/models.rs` 的 `#[serde(rename_all = "camelCase")]`
 * 输出严格一致。Rust 是单一真实来源（Single Source of Truth）；这里只做
 * IDE 类型推导用，**不包含任何运行时逻辑**。
 *
 * **修改规则**：任何字段重命名/增删都要先改 Rust 再改这里。
 */

/**
 * 置顶便签窗口的视觉/尺寸配置。
 *
 * 存储在 `notes.pinned_window_config` 列（JSON TEXT），
 * 前端通过 `updatePinnedWindowConfig` 单列更新，不走整行 REPLACE。
 *
 * @example
 * ```ts
 * const cfg: PinnedWindowConfig = {
 *   width: 320, height: 240, opacity: 0.9,
 *   color: '#1f1f24', fontSize: 14,
 * };
 * ```
 */
export interface PinnedWindowConfig {
  /** 窗口左上角 X 坐标（逻辑像素）。`undefined`/`null` 表示由 OS 决定。 */
  x?: number | null;
  /** 窗口左上角 Y 坐标（逻辑像素）。`undefined`/`null` 表示由 OS 决定。 */
  y?: number | null;
  /** 窗口宽度（逻辑像素）。 */
  width: number;
  /** 窗口高度（逻辑像素）。 */
  height: number;
  /** 窗口不透明度，范围 0.0–1.0。 */
  opacity: number;
  /** 窗口背景色（CSS 颜色字符串，如 `"#1f1f24"`）。 */
  color: string;
  /** 编辑器字号（px）。 */
  fontSize: number;
}

/**
 * 画布上卡片的世界坐标位置。
 *
 * 存储在 `notes.canvas_position` 列（JSON TEXT），
 * Canvas 拖拽释放后通过 `updateCanvasPosition` 单列写入。
 *
 * 坐标转换公式：
 * ```
 * screenX = worldX * zoom + panX
 * screenY = worldY * zoom + panY
 * ```
 */
export interface CanvasPosition {
  /** 世界坐标 X。 */
  x: number;
  /** 世界坐标 Y。 */
  y: number;
  /**
   * 上次保存时的缩放比例。
   * 仅用于恢复视口参考，不影响实际渲染（渲染使用 `Canvas` 组件的 `zoom` ref）。
   */
  scale?: number | null;
}

/**
 * 笔记实体 — 从 Rust 端反序列化的完整 DTO。
 *
 * 对应 SQLite `notes` 表的一行，字段命名 camelCase（与 Rust `#[serde(rename_all)]` 对齐）。
 *
 * `isDraft` 笔记的特殊规则：
 * - 列表页排在最前面 + 附"未保存"灰标签
 * - 禁止进入 NoteEditorView 编辑页
 * - 只能通过速记浮窗继续编辑或点"保存"按钮 promote
 */
export interface Note {
  /** UUID v4 字符串，Rust 端生成。 */
  id: string;
  /** 标题；保存时为空则后端自动从内容首行派生（`derive_title`）。 */
  title: string;
  /** Markdown 原文。 */
  content: string;
  /** 后端用 `pulldown-cmark` 渲染的 HTML，存库供只读预览直接使用。 */
  htmlContent: string;
  /** 标签列表（不含 `#` 前缀），由后端 `extract_tags` 从内容和 `extra_tags` 合并。 */
  tags: string[];
  /** 是否置顶（= 拥有独立 sticky 窗口）。 */
  isPinned: boolean;
  /** 置顶窗口配置；仅 `isPinned` 为 true 时有效。 */
  pinnedWindowConfig?: PinnedWindowConfig | null;
  /** 画布卡片位置；仅被拖放到过 Canvas 的笔记有此字段。 */
  canvasPosition?: CanvasPosition | null;
  /** 创建时间，RFC3339 字符串（如 `"2025-06-15T10:30:00+08:00"`）。 */
  createdAt: string;
  /** 最后更新时间，RFC3339 字符串。每次 save/set_pinned/update_*_config 都会刷新。 */
  updatedAt: string;
  /** 字数（后端 `word_count` 计算，空白分割计数）。 */
  wordCount: number;
  /**
   * 未保存草稿标记。
   *
   * - 速记浮窗未点"保存"就关闭 → 持久化为 `isDraft=true`
   * - 笔记列表排最前 + 灰色"未保存"标签
   * - 禁止进入编辑页（NoteEditorView），只能通过浮窗继续编辑
   * - 置顶笔记后端会强制清零此字段（pin 表示用户已表达"留下来"）
   */
  isDraft: boolean;
}

/**
 * 保存笔记的请求体 — 前端 → Rust `save_note` command。
 *
 * `id` 为 `undefined` 时后端分配新 UUID（新建）。
 * `id` 存在时走 `INSERT OR REPLACE`（更新）。
 */
export interface SaveNoteRequest {
  /**
   * 笔记 UUID。新建时省略，让后端生成。
   * @example `"550e8400-e29b-41d4-a716-446655440000"`
   */
  id?: string;
  /** 标题；空字符串时后端从内容首行派生。 */
  title?: string;
  /** Markdown 原文（必填）。 */
  content: string;
  /**
   * 用户显式指定的标签（不含 `#` 前缀）。
   * 最终入库标签 = 内容中 `#tag` 解析结果 ∪ 此字段，取并集。
   */
  tags: string[];
  /** 是否置顶。 */
  isPinned?: boolean;
  /** 置顶窗口配置。 */
  pinnedWindowConfig?: PinnedWindowConfig | null;
  /** 画布位置。 */
  canvasPosition?: CanvasPosition | null;
  /**
   * 仅速记浮窗写入草稿时传 `true`。
   * 置顶笔记（`isPinned=true`）后端会强制清零，因为置顶 = 用户已表达保留意图。
   */
  isDraft?: boolean;
}

/**
 * 搜索笔记的请求体 — 前端 → Rust `search_notes` command。
 *
 * 搜索逻辑：`title LIKE %query% OR content LIKE %query%`，
 * 再在 Rust 侧按 `tags` 做内存过滤（交集语义）。
 */
export interface SearchNotesRequest {
  /** 搜索关键词，匹配标题和内容。空字符串表示不按关键词过滤。 */
  query: string;
  /** 必须全部包含的标签列表（交集语义）。空数组表示不过滤标签。 */
  tags: string[];
  /** 为 `true` 时仅搜索置顶笔记（`WHERE is_pinned = 1`）。 */
  pinnedOnly: boolean;
  /** 返回结果数量上限。 */
  limit: number;
}

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

// ----- 前端独有：窗口模式（不进 Rust） -----------------------------------

/**
 * 当前进程内窗口承担的角色。
 *
 * **路由来源（优先级从高到低）**：
 * 1. Tauri 窗口 label → `getCurrentWindow().label`（首选，无编码风险）
 * 2. URL hash 兜底 → `#mode?id=...`（纯浏览器调试 / 非 Tauri 上下文）
 *
 * **模式分类**：
 * - **页面型**（在 main 窗口内通过 `steno:navigate` 事件切换）：
 *   `main` `note-editor` `canvas` `clipboard` `todo` `screenshot` `ocr` `translate`
 * - **独立窗口型**（各自拥有独立 webview）：
 *   `floating`（速记浮窗） `sticky`（置顶便签） `zen` `settings`
 */
export type WindowMode =
  | 'main'
  | 'floating'
  | 'sticky'
  | 'canvas'
  | 'zen'
  | 'settings'
  | 'note-editor'
  | 'clipboard'
  | 'todo'
  | 'todo-panel'
  | 'screenshot'
  | 'ocr'
  | 'translate';

// ----- 工作区与文库条目（library_entries）DTO ----------------------------

/**
 * `library_entries.kind` 列对应的判别字段。
 *
 * - 容器型：`workspace` / `folder` / `group`
 * - 内容型：`text`（Inbox 速记）/ `document`（工作区中的 .md 文件）
 *
 * 与 Rust `EntryKind`（`#[serde(rename_all = "camelCase")]`）对齐。
 */
export type EntryKind = 'workspace' | 'folder' | 'group' | 'text' | 'document';

/**
 * 主列表卡片视图条目 DTO — 对应 SQLite `library_entries` 一行。
 *
 * 字段语义由 `kind` 决定：容器条目（workspace/folder/group）没有 `filePath`；
 * 内容条目（text/document）才有 `wordCount` / `byteSize` 等统计字段。
 */
export interface LibraryEntry {
  id: string;
  kind: EntryKind;
  title: string;
  previewText: string;
  tags: string[];
  workspaceId?: string | null;
  parentId?: string | null;
  groupId?: string | null;
  /** 仅 `kind = 'document'` 时存在，指向工作区根目录下的相对路径。 */
  filePath?: string | null;
  wordCount: number;
  byteSize: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 工作区元数据 — 一条 `library_entries` 中 `kind = 'workspace'` 的行的额外信息。
 */
export interface Workspace {
  id: string;
  name: string;
  /** 工作区在文件系统的绝对根路径。 */
  rootPath: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 主列表筛选上下文 — 前端通过它指定"看哪个工作区 / 分组 / 文件夹"。
 *
 * 三个 id 字段互斥：同时只允许其中一个非空（或全空表示全局 Inbox）。
 */
export interface MainListContext {
  workspaceId?: string | null;
  folderEntryId?: string | null;
  groupEntryId?: string | null;
  selectedEntryId?: string | null;
}

/**
 * 创建工作区请求体。`name` 为空时后端自动从 `rootPath` 末段派生。
 */
export interface CreateWorkspaceRequest {
  name?: string | null;
  rootPath: string;
}

/**
 * 编辑器加载条目时的 DTO — 比 `LibraryEntry` 多 `content`，少统计字段。
 */
export interface EditorEntry {
  id: string;
  kind: EntryKind;
  title: string;
  content: string;
  tags: string[];
  workspaceId?: string | null;
  parentId?: string | null;
  groupId?: string | null;
  filePath?: string | null;
}

/**
 * 保存 Text 条目（Inbox 速记）请求体。
 *
 * `id` 缺省时后端分配新 UUID；存在则更新。
 */
export interface SaveTextEntryRequest {
  id?: string | null;
  title?: string | null;
  content: string;
  tags: string[];
  groupId?: string | null;
}

/**
 * 保存 Document 条目（工作区 .md 文件）请求体。
 *
 * 必填 `workspaceId`；`folderEntryId` 为空时落到工作区根目录。
 */
export interface SaveDocumentEntryRequest {
  id?: string | null;
  title?: string | null;
  content: string;
  tags: string[];
  workspaceId: string;
  folderEntryId?: string | null;
}

/**
 * 将 Text 条目"晋升"为工作区 Document（写到磁盘文件）的请求体。
 */
export interface ConvertTextToDocumentRequest {
  id: string;
  workspaceId: string;
  folderEntryId?: string | null;
}

// ----- 待办（todos） ---------------------------------------------------

/** 待办状态机：新建 / 进行中 / 暂停 / 已完成。 */
export type TodoStatus = 'todo' | 'doing' | 'paused' | 'done';

/** 待办快捷提醒选项，存储在 settings.reminderQuickOptions 中。 */
export interface ReminderOption {
  id: string;
  label: string;
  type: 'relative' | 'absolute';
  value: number;
  unit: 'minute' | 'hour' | 'day';
  absoluteTime?: string;
  dayOffset?: number;
}

/**
 * 待办事项 DTO — 与后端 `todo.rs::Todo`（camelCase 序列化）一致。
 *
 * 时间字段一律 RFC3339 字符串，前端可直接 `new Date(field)` 构造。
 */
export interface Todo {
  id: string;
  content: string;
  status: TodoStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  dueDate: string | null;
  reminderTime: string | null;
  /** 提醒是否已被调度器触发；修改 `reminderTime` 会重置为 false。 */
  reminderFired: boolean;
  /** 首次进入 `doing` 的 RFC3339 时间戳，用于统计折线"开始"序列。 */
  startedAt: string | null;
  listId: string;
}

/** 创建请求 — `id` 由后端生成，`status` 始终从 `todo` 起步。 */
export interface CreateTodoRequest {
  content: string;
  dueDate?: string | null;
  reminderTime?: string | null;
  listId?: string | null;
}

/**
 * 更新请求 — 所有字段可选，仅传入要改的部分。
 *
 * `dueDate` / `reminderTime` 显式传 `null` 表示清空；不传字段则保留原值
 * （前端调用方需自行判断是否传 `null`）。
 */
export interface UpdateTodoRequest {
  id: string;
  content?: string;
  status?: TodoStatus;
  dueDate?: string | null;
  reminderTime?: string | null;
  listId?: string;
}

/** 跨窗口同步事件变更类型。 */
export type TodoChangeKind = 'created' | 'updated' | 'completed' | 'deleted';

/**
 * `steno:todo-changed` 事件 payload — 由后端 `commands.rs` 在每次
 * 写操作成功后 emit；前端 `useTodosStore.applyRemoteChange` 据此局部更新缓存。
 *
 * 删除事件下 `todo` 为 `null`。
 */
export interface TodoChangePayload {
  kind: TodoChangeKind;
  id: string;
  todo: Todo | null;
}

/** 主窗口待办视图的左侧分类标识。 */
export type TodoCategory =
  | 'today'
  | 'planned'
  | 'doing'
  | 'paused'
  | 'done'
  | 'all'
  | 'inbox';
