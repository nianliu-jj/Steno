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
}

export interface SaveNoteRequest {
  id?: string;
  title?: string;
  content: string;
  tags: string[];
  isPinned?: boolean;
  pinnedWindowConfig?: PinnedWindowConfig | null;
  canvasPosition?: CanvasPosition | null;
}

export interface SearchNotesRequest {
  query: string;
  tags: string[];
  pinnedOnly: boolean;
  limit: number;
}

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
