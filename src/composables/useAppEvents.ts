/**
 * @file 跨窗口事件总线
 *
 * 基于 Tauri 的 `emit` / `listen` 实现进程内跨窗口通信。
 * 所有 emit/listen 函数在非 Tauri 环境（浏览器调试）下安全降级为 no-op。
 *
 * **事件列表**：
 * - `steno:theme-mode-changed` — 设置面板切换主题后广播
 * - `steno:note-saved` — FloatingEditor / NoteEditorView 保存后广播，
 *   主窗口 MainView 监听后更新卡片列表
 * - `steno:note-removed` — 速记浮窗 promote 草稿 / 关闭空草稿后广播，
 *   主窗口监听后移除对应卡片
 */

import { isTauri } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';

import type { ThemeMode } from '@/stores/settings';
import type { Note } from '@/types/steno';

/** 主题变更事件名。 */
const THEME_MODE_CHANGED_EVENT = 'steno:theme-mode-changed';
/** 笔记保存事件名（payload = 完整 Note 对象）。 */
const NOTE_SAVED_EVENT = 'steno:note-saved';
/** 笔记删除事件名（payload = `{ id: string }`）。 */
const NOTE_REMOVED_EVENT = 'steno:note-removed';

/** 笔记保存事件的 payload 类型 — 就是完整的 Note DTO。 */
export type NoteSavedPayload = Note;
/** 笔记删除事件的 payload 类型 — 仅需 id。 */
export type NoteRemovedPayload = { id: string };

/** 主题变更事件的 payload 类型。 */
export type AppThemeModeChangedPayload = ThemeMode;

/**
 * 安全 emit — 非 Tauri 环境静默跳过。
 *
 * 防止在浏览器 `pnpm dev` 调试时因 `emit` 不可用而崩溃。
 */
async function safeEmit<TPayload>(event: string, payload: TPayload): Promise<void> {
  if (!isTauri()) {
    return;
  }
  await emit(event, payload);
}

/**
 * 安全 listen — 非 Tauri 环境返回空的 unlisten 函数。
 *
 * @returns unlisten 函数，调用方在 `onUnmounted` 里调用以清理监听
 */
async function safeListen<TPayload>(
  event: string,
  handler: (payload: TPayload) => void,
): Promise<() => void> {
  if (!isTauri()) {
    return () => {};
  }
  return await listen<TPayload>(event, ({ payload }) => handler(payload));
}

/**
 * 跨窗口事件工具集。
 *
 * @returns emit/listen 方法对，按事件类型分组
 *
 * @example
 * ```ts
 * const { emitNoteSaved, listenNoteSaved } = useAppEvents();
 * // 发送方（FloatingEditor 保存后）
 * await emitNoteSaved(savedNote);
 * // 接收方（MainView onMounted 里）
 * const unlisten = await listenNoteSaved((note) => {
 *   notes.syncExternalNote(note);
 * });
 * onUnmounted(() => unlisten());
 * ```
 */
export function useAppEvents() {
  /** 广播主题变更（SettingsView 切换主题后调用）。 */
  function emitThemeModeChanged(payload: AppThemeModeChangedPayload) {
    return safeEmit(THEME_MODE_CHANGED_EVENT, payload);
  }

  /** 广播笔记已保存（编辑器保存后调用，主窗口监听以更新卡片列表）。 */
  function emitNoteSaved(payload: NoteSavedPayload) {
    return safeEmit(NOTE_SAVED_EVENT, payload);
  }

  /** 广播笔记已删除（草稿 promote / 空草稿关闭后调用）。 */
  function emitNoteRemoved(payload: NoteRemovedPayload) {
    return safeEmit(NOTE_REMOVED_EVENT, payload);
  }

  /**
   * 监听主题变更。
   *
   * @param handler - 收到新主题模式后的回调
   * @returns unlisten 函数
   */
  function listenThemeModeChanged(handler: (payload: AppThemeModeChangedPayload) => void) {
    return safeListen(THEME_MODE_CHANGED_EVENT, handler);
  }

  /**
   * 监听笔记保存事件。
   *
   * @param handler - 收到新笔记后的回调（用于列表同步）
   * @returns unlisten 函数
   */
  function listenNoteSaved(handler: (payload: NoteSavedPayload) => void) {
    return safeListen(NOTE_SAVED_EVENT, handler);
  }

  /**
   * 监听笔记删除事件。
   *
   * @param handler - 收到删除通知后的回调（`payload.id` 为被删笔记 UUID）
   * @returns unlisten 函数
   */
  function listenNoteRemoved(handler: (payload: NoteRemovedPayload) => void) {
    return safeListen(NOTE_REMOVED_EVENT, handler);
  }

  return {
    emitThemeModeChanged,
    emitNoteSaved,
    emitNoteRemoved,
    listenThemeModeChanged,
    listenNoteSaved,
    listenNoteRemoved,
  };
}
