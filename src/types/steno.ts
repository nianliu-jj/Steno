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
  | 'screenshot'
  | 'ocr'
  | 'translate';
