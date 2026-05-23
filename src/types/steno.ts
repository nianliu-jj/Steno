// 前端 DTO：与 src-tauri/src/models.rs 的 #[serde(rename_all = "camelCase")]
// 输出严格一致。Rust 是单一真实来源（Single Source of Truth）；这里只是
// IPC 边界处的 TypeScript 镜像，方便 IDE 类型推导。
//
// 任何字段重命名/增删都要先改 Rust 再改这里。

export interface PinnedWindowConfig {
  x?: number | null;
  y?: number | null;
  width: number;
  height: number;
  opacity: number;
  color: string;
  fontSize: number;
}

export interface CanvasPosition {
  x: number;
  y: number;
  scale?: number | null;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  htmlContent: string;
  tags: string[];
  isPinned: boolean;
  pinnedWindowConfig?: PinnedWindowConfig | null;
  canvasPosition?: CanvasPosition | null;
  /** RFC3339 字符串 */
  createdAt: string;
  /** RFC3339 字符串 */
  updatedAt: string;
  wordCount: number;
  /**
   * 未保存草稿标记。速记浮窗未点保存就关闭时持久化为 true；
   * 笔记列表会把它排在最前面并附"未保存"灰标签，禁止进入编辑页。
   */
  isDraft: boolean;
}

export interface SaveNoteRequest {
  id?: string;
  title?: string;
  content: string;
  tags: string[];
  isPinned?: boolean;
  pinnedWindowConfig?: PinnedWindowConfig | null;
  canvasPosition?: CanvasPosition | null;
  /** 仅速记浮窗写入草稿时传 true；置顶笔记后端会强制清零。 */
  isDraft?: boolean;
}

/** 速记浮窗的固定草稿 ID。前后端共同约定，前端写入与 hydrate 都用这个 id。 */
export const QUICKNOTE_DRAFT_ID = 'quicknote-draft';

export interface SearchNotesRequest {
  query: string;
  tags: string[];
  pinnedOnly: boolean;
  limit: number;
}

// ----- 前端独有：窗口模式（不进 Rust） -----------------------------------

/** 当前进程内窗口承担的角色，由 URL hash/query 决定。 */
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
