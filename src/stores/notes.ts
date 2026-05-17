// notes store：前端持有一份"最近笔记列表 + 当前置顶笔记缓存"。
//
// 后端 (SQLite) 仍是单一真实来源；store 只是 UI 层的缓存与 view-model。
// 写操作走 useDb()，成功后**本地同步更新**对应缓存项，避免每次都重新 list。

import { defineStore } from 'pinia';
import { ref } from 'vue';

import { useDb } from '@/composables/useDb';
import type {
  CanvasPosition,
  Note,
  PinnedWindowConfig,
  SaveNoteRequest,
} from '@/types/steno';

export const useNotesStore = defineStore('notes', () => {
  const db = useDb();

  const notes = ref<Note[]>([]);
  const pinned = ref<Note[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadNotes(limit = 200) {
    loading.value = true;
    error.value = null;
    try {
      notes.value = await db.listNotes(limit);
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  async function loadPinned() {
    try {
      pinned.value = await db.listPinnedNotes();
    } catch (e) {
      error.value = String(e);
    }
  }

  /**
   * @returns 后端可能返回 null（空内容草稿被后端跳过）。返回 null 时调用方
   *   通常不需要任何 UI 反馈。
   */
  async function saveDraft(input: SaveNoteRequest): Promise<Note | null> {
    const saved = await db.saveNote(input);
    if (saved) {
      upsertLocal(saved);
    }
    return saved;
  }

  async function pinNote(id: string): Promise<Note> {
    const updated = await db.setNotePinned(id, true);
    upsertLocal(updated);
    upsertPinned(updated);
    return updated;
  }

  async function unpinNote(id: string): Promise<Note> {
    const updated = await db.setNotePinned(id, false);
    upsertLocal(updated);
    pinned.value = pinned.value.filter(n => n.id !== id);
    return updated;
  }

  async function updatePinnedConfig(
    id: string,
    config: PinnedWindowConfig,
  ): Promise<Note> {
    const updated = await db.updatePinnedWindowConfig(id, config);
    upsertLocal(updated);
    upsertPinned(updated);
    return updated;
  }

  async function updateCanvasPosition(
    id: string,
    position: CanvasPosition,
  ): Promise<Note> {
    const updated = await db.updateCanvasPosition(id, position);
    upsertLocal(updated);
    upsertPinned(updated);
    return updated;
  }

  async function removeNote(id: string) {
    await db.deleteNote(id);
    notes.value = notes.value.filter(n => n.id !== id);
    pinned.value = pinned.value.filter(n => n.id !== id);
  }

  function syncExternalNote(note: Note) {
    upsertLocal(note);
    if (note.isPinned) {
      upsertPinned(note);
    } else {
      pinned.value = pinned.value.filter(n => n.id !== note.id);
    }
  }

  function upsertLocal(note: Note) {
    const i = notes.value.findIndex(n => n.id === note.id);
    if (i >= 0) {
      notes.value[i] = note;
    } else {
      notes.value.unshift(note);
    }
  }

  function upsertPinned(note: Note) {
    const i = pinned.value.findIndex(n => n.id === note.id);
    if (i >= 0) {
      pinned.value[i] = note;
    } else {
      pinned.value.push(note);
    }
  }

  return {
    notes,
    pinned,
    loading,
    error,
    loadNotes,
    loadPinned,
    saveDraft,
    pinNote,
    unpinNote,
    updatePinnedConfig,
    updateCanvasPosition,
    removeNote,
    syncExternalNote,
  };
});
