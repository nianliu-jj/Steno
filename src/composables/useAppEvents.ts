import { isTauri } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';

import type { ThemeMode } from '@/stores/settings';

const THEME_MODE_CHANGED_EVENT = 'steno:theme-mode-changed';
const NOTE_SAVED_EVENT = 'steno:note-saved';

export interface NoteSavedPayload {
  noteId: string;
}

export type AppThemeModeChangedPayload = ThemeMode;

async function safeEmit<TPayload>(event: string, payload: TPayload): Promise<void> {
  if (!isTauri()) {
    return;
  }
  await emit(event, payload);
}

async function safeListen<TPayload>(
  event: string,
  handler: (payload: TPayload) => void,
): Promise<() => void> {
  if (!isTauri()) {
    return () => {};
  }
  return await listen<TPayload>(event, ({ payload }) => handler(payload));
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
