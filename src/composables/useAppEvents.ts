import { emit, listen } from '@tauri-apps/api/event';

import type { ThemeMode } from '@/stores/settings';
import type { Note } from '@/types/steno';

const THEME_MODE_CHANGED_EVENT = 'steno:theme-mode-changed';
const NOTE_SAVED_EVENT = 'steno:note-saved';

export async function emitThemeModeChanged(mode: ThemeMode) {
  try {
    await emit(THEME_MODE_CHANGED_EVENT, { mode });
  } catch {
    // 浏览器调试环境没有 Tauri 事件桥，广播失败时不阻塞界面交互。
  }
}

export function listenThemeModeChanged(handler: (mode: ThemeMode) => void) {
  return listen<{ mode: ThemeMode }>(THEME_MODE_CHANGED_EVENT, ({ payload }) => {
    handler(payload.mode);
  });
}

export async function emitNoteSaved(note: Note) {
  try {
    await emit(NOTE_SAVED_EVENT, note);
  } catch {
    // 忽略非 Tauri 场景
  }
}

export function listenNoteSaved(handler: (note: Note) => void) {
  return listen<Note>(NOTE_SAVED_EVENT, ({ payload }) => {
    handler(payload);
  });
}
