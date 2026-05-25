/**
 * @file 笔记列表 Store — 前端缓存的 view-model 层
 *
 * 后端 (SQLite) 仍是单一真实来源（Single Source of Truth）；
 * store 只是 UI 层的缓存与 view-model。写操作走 `useDb()`，
 * 成功后**本地同步更新**对应缓存项，避免每次都重新 list。
 *
 * **缓存策略**：
 * - `notes` — 最近笔记列表（`listNotes` 拉取）
 * - `pinned` — 置顶笔记列表（`listPinnedNotes` 拉取）
 * - 写操作成功后通过 `upsertLocal` / `upsertPinned` 就地更新缓存
 * - 跨窗口同步通过 `syncExternalNote`（收到 `steno:note-saved` 事件）触发
 */

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

  /** 最近笔记列表（`listNotes` 拉取，按 `isDraft DESC, updatedAt DESC`）。 */
  const notes = ref<Note[]>([]);
  /** 置顶笔记列表（`listPinnedNotes` 拉取）。 */
  const pinned = ref<Note[]>([]);
  /** 是否正在加载笔记列表。 */
  const loading = ref(false);
  /** 最近一次操作失败的错误消息。 */
  const error = ref<string | null>(null);

  /**
   * 从后端加载最近笔记列表。
   *
   * @param limit - 返回条数上限，默认 200
   */
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

  /** 从后端加载置顶笔记列表。 */
  async function loadPinned() {
    try {
      pinned.value = await db.listPinnedNotes();
    } catch (e) {
      error.value = String(e);
    }
  }

  /**
   * 保存/新建笔记（委托给 `db.saveNote`）并同步更新本地缓存。
   *
   * @param input - 保存请求体
   * @returns 保存后的笔记；后端可能返回 `null`（空内容草稿被跳过），
   *          此时调用方通常不需要 UI 反馈
   */
  async function saveDraft(input: SaveNoteRequest): Promise<Note | null> {
    const saved = await db.saveNote(input);
    if (saved) {
      upsertLocal(saved);
    }
    return saved;
  }

  /**
   * 置顶笔记（设为 `isPinned = true`）并更新本地缓存。
   *
   * @param id - 笔记 UUID
   * @returns 更新后的笔记
   */
  async function pinNote(id: string): Promise<Note> {
    const updated = await db.setNotePinned(id, true);
    upsertLocal(updated);
    upsertPinned(updated);
    return updated;
  }

  /**
   * 取消置顶（设为 `isPinned = false`）并从置顶列表移除。
   *
   * @param id - 笔记 UUID
   * @returns 更新后的笔记
   */
  async function unpinNote(id: string): Promise<Note> {
    const updated = await db.setNotePinned(id, false);
    upsertLocal(updated);
    pinned.value = pinned.value.filter(n => n.id !== id);
    return updated;
  }

  /**
   * 更新置顶窗口配置（透明度/颜色/字号等）并同步本地缓存。
   *
   * @param id - 笔记 UUID
   * @param config - 新窗口配置
   * @returns 更新后的笔记
   */
  async function updatePinnedConfig(
    id: string,
    config: PinnedWindowConfig,
  ): Promise<Note> {
    const updated = await db.updatePinnedWindowConfig(id, config);
    upsertLocal(updated);
    upsertPinned(updated);
    return updated;
  }

  /**
   * 更新画布位置并同步本地缓存。
   *
   * @param id - 笔记 UUID
   * @param position - 新世界坐标位置
   * @returns 更新后的笔记
   */
  async function updateCanvasPosition(
    id: string,
    position: CanvasPosition,
  ): Promise<Note> {
    const updated = await db.updateCanvasPosition(id, position);
    upsertLocal(updated);
    upsertPinned(updated);
    return updated;
  }

  /**
   * 删除笔记（硬删除，不可恢复）并从本地缓存中移除。
   *
   * @param id - 笔记 UUID
   */
  async function removeNote(id: string) {
    await db.deleteNote(id);
    notes.value = notes.value.filter(n => n.id !== id);
    pinned.value = pinned.value.filter(n => n.id !== id);
  }

  /**
   * 跨窗口同步：收到其他窗口保存的笔记后，upsert 到本地列表。
   *
   * 用于 MainView 监听 `steno:note-saved` 事件后调用，
   * 使笔记卡片实时更新（标题/标签/内容）。如果笔记不再置顶，同时从 pinned 列表移除。
   *
   * @param note - 来自事件的完整 Note 对象
   */
  function syncExternalNote(note: Note) {
    upsertLocal(note);
    if (note.isPinned) {
      upsertPinned(note);
      return;
    }
    pinned.value = pinned.value.filter(n => n.id !== note.id);
  }

  /**
   * 跨窗口"笔记已删除"事件同步：只清本地数组，不再走 IPC。
   *
   * 用于速记浮窗 promote 草稿 / 关闭空草稿后，主窗口列表立即移除卡片。
   *
   * @param id - 被删除笔记的 UUID
   */
  function purgeLocal(id: string) {
    notes.value = notes.value.filter(n => n.id !== id);
    pinned.value = pinned.value.filter(n => n.id !== id);
  }

  /**
   * 本地 upsert — 存在则替换，不存在则插入到列表头部。
   *
   * `unshift` 而非 `push` 是因为更新后的笔记通常是"最新编辑的"，
   * 放在列表顶部符合用户预期。
   */
  function upsertLocal(note: Note) {
    const i = notes.value.findIndex(n => n.id === note.id);
    if (i >= 0) {
      notes.value[i] = note;
    } else {
      notes.value.unshift(note);
    }
  }

  /** 本地 upsert 到置顶列表（`push` 因为置顶列表不强调顺序）。 */
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
    purgeLocal,
  };
});
