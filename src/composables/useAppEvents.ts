import { emit, listen } from '@tauri-apps/api/event';

import type { ThemeMode } from '@/stores/settings';

const THEME_MODE_CHANGED_EVENT = 'steno:theme-mode-changed';
const NOTE_SAVED_EVENT = 'steno:note-saved';

export interface NoteSavedPayload {
  noteId: string;
}

export type AppThemeModeChangedPayload = ThemeMode;

async function safeEmit<TPayload>(event: string, payload: TPayload): Promise<void> {
  try {
    await emit(event, payload);
  } catch {
    // 浏览器调试 / 测试环境里没有 Tauri runtime 时静默降级。
  }
}

async function safeListen<TPayload>(
  event: string,
  handler: (payload: TPayload) => void,
): Promise<() => void> {
  try {
    return await listen<TPayload>(event, ({ payload }) => handler(payload));
  } catch {
    return () => {};
  }
}

export function useAppEvents() {
  function emitThemeModeChanged(payload: AppThemeModeChangedPayload) {
    return safeEmit(THEME_MODE_CHANGED_EVENT, payload);
  }

  function emitNoteSaved(payload: NoteSavedPayload) {
    return safeEmit(NOTE_SAVED_EVENT, payload);
  }

  function listenThemeModeChanged(handler: (payload: AppThemeModeChangedPayload) => void) {
    return safeListen(THEME_MODE_CHANGED_EVENT, handler);
  }

  function listenNoteSaved(handler: (payload: NoteSavedPayload) => void) {
    return safeListen(NOTE_SAVED_EVENT, handler);
  }

  return {
    emitThemeModeChanged,
    emitNoteSaved,
    listenThemeModeChanged,
    listenNoteSaved,
  };
}
