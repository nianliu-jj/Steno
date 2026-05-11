// Tauri command 调用封装。
//
// 设计：把每个 invoke 调用包成 typed function，前端不再到处写魔法字符串。
// 这里只做"参数 → command 名 → 类型化返回值"的薄薄一层，**不持有任何
// 业务状态**。状态留给 pinia stores。
//
// 命令命名与 src-tauri/src/lib.rs 的 invoke_handler! 列表一一对应。

import { invoke } from '@tauri-apps/api/core';

import type {
  Note,
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

  function deleteNote(id: string) {
    return invoke<void>('delete_note', { id });
  }

  function setNotePinned(id: string, isPinned: boolean) {
    return invoke<Note>('set_note_pinned', { id, isPinned });
  }

  function listPinnedNotes() {
    return invoke<Note[]>('list_pinned_notes');
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

  return {
    saveNote,
    getNote,
    listNotes,
    searchNotes,
    deleteNote,
    setNotePinned,
    listPinnedNotes,
    getSetting,
    setSetting,
    reloadShortcuts,
  };
}
