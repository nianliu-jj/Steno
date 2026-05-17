// Tauri command 调用封装。
//
// 设计：把每个 invoke 调用包成 typed function，前端不再到处写魔法字符串。
// 这里只做"参数 → command 名 → 类型化返回值"的薄薄一层，**不持有任何
// 业务状态**。状态留给 pinia stores。
//
// 命令命名与 src-tauri/src/lib.rs 的 invoke_handler! 列表一一对应。

import { invoke } from '@tauri-apps/api/core';

import type {
  CanvasPosition,
  LibraryEntry,
  MainListContext,
  Note,
  PinnedWindowConfig,
  SaveNoteRequest,
  SearchNotesRequest,
} from '@/types/steno';

export function useDb() {
  // ----- notes ---------------------------------------------------------

  /**
   * 返回 null 表示后端识别为"空内容草稿"主动跳过写库（plan 5.5 空内容丢弃）。
   */
  function saveNote(input: SaveNoteRequest) {
    return invoke<Note | null>('save_note', { input });
  }

  function getNote(id: string) {
    return invoke<Note | null>('get_note', { id });
  }

  function listNotes(limit = 200) {
    return invoke<Note[]>('list_notes', { limit });
  }

  function searchNotes(input: SearchNotesRequest) {
    return invoke<Note[]>('search_notes', { input });
  }

  function listLibraryEntries(context: MainListContext) {
    return invoke<LibraryEntry[]>('list_library_entries', { context });
  }

  function listWorkspaceTree(workspaceId: string) {
    return invoke<LibraryEntry[]>('list_workspace_tree', { workspaceId });
  }

  function deleteNote(id: string) {
    return invoke<void>('delete_note', { id });
  }

  function setNotePinned(id: string, isPinned: boolean) {
    return invoke<Note>('set_note_pinned', { id, isPinned });
  }

  function listPinnedNotes() {
    return invoke<Note[]>('list_pinned_notes');
  }

  /**
   * 仅写 pinned_window_config 一列（plan Task 6）。比 save_note 轻很多，
   * 适合 StickyNote 拖滑块、改字号等高频调用。
   */
  function updatePinnedWindowConfig(id: string, config: PinnedWindowConfig) {
    return invoke<Note>('update_pinned_window_config', { id, config });
  }

  /** Canvas 拖卡片释放后写 canvas_position 单列（plan Task 7）。 */
  function updateCanvasPosition(id: string, position: CanvasPosition) {
    return invoke<Note>('update_canvas_position', { id, position });
  }

  // ----- settings ------------------------------------------------------

  function getSetting(key: string) {
    return invoke<string | null>('get_setting', { key });
  }

  function setSetting(key: string, value: string) {
    return invoke<void>('set_setting', { key, value });
  }

  // ----- 全局快捷键 ----------------------------------------------------

  /** SettingsView 改完 shortcut setting 后调一次，让 Rust 端重新 register。 */
  function reloadShortcuts() {
    return invoke<void>('reload_shortcuts');
  }

  // ----- 导出（plan Task 8.4） -----------------------------------------

  /** 成功时返回写入的完整文件路径。失败时 invoke 抛错。 */
  function exportNoteMarkdown(id: string) {
    return invoke<string>('export_note_markdown', { id });
  }

  /** 成功时返回写入的完整 HTML 文件路径。失败时 invoke 抛错。 */
  function exportNoteHtml(id: string) {
    return invoke<string>('export_note_html', { id });
  }

  /** MVP 当前总是失败，返回的错误用于前端展示"PDF 不可用"提示。 */
  function exportNotePdf(id: string) {
    return invoke<string>('export_note_pdf', { id });
  }

  // ----- 存储路径（SettingsView 展示） ---------------------------------

  function getDataPaths() {
    return invoke<{ dataDir: string; dbPath: string; backupDir: string }>(
      'get_data_paths',
    );
  }

  return {
    saveNote,
    getNote,
    listNotes,
    searchNotes,
    listLibraryEntries,
    listWorkspaceTree,
    deleteNote,
    setNotePinned,
    listPinnedNotes,
    updatePinnedWindowConfig,
    updateCanvasPosition,
    getSetting,
    setSetting,
    reloadShortcuts,
    exportNoteMarkdown,
    exportNoteHtml,
    exportNotePdf,
    getDataPaths,
  };
}
