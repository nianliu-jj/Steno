// settings store：把后端 settings 表抽象成 typed reactive view model。
//
// 启动时调 load() 一次性把所有键拉下来；之后写值时**先本地更新、再写后端**，
// 这样 UI 不会等 IPC round-trip。写失败回滚（恢复上次值）并把 error 暴露给
// SettingsView。
//
// 字段集合与 src-tauri/src/db.rs::ensure_default_settings 完全对齐。
// 后续 plan Task 8 添加新键时同时改两边。

import { defineStore } from 'pinia';
import { reactive, ref } from 'vue';

import { useDb } from '@/composables/useDb';

export type ThemeMode = 'light' | 'dark' | 'system';
export type EditorMode = 'split' | 'edit' | 'preview';

export interface StenoSettings {
  themeMode: ThemeMode;
  mainWindowShortcut: string;
  quicknoteShortcut: string;
  searchShortcut: string;
  floatingWidth: number;
  floatingHeight: number;
  blurCloseDelayMs: number;
  editorMode: EditorMode;
  backupEveryChanges: number;
}

const DEFAULTS: StenoSettings = {
  themeMode: 'system',
  mainWindowShortcut: 'Ctrl+Shift+N',
  quicknoteShortcut: 'Ctrl+Shift+M',
  searchShortcut: 'Ctrl+Shift+F',
  floatingWidth: 400,
  floatingHeight: 300,
  blurCloseDelayMs: 800,
  editorMode: 'split',
  backupEveryChanges: 10,
};

/** 后端 settings 表都是 TEXT；这里按字段把字符串还原成正确的 TS 类型。 */
function decode<K extends keyof StenoSettings>(
  key: K,
  raw: string | null,
): StenoSettings[K] {
  if (raw === null || raw === undefined) {
    return DEFAULTS[key];
  }
  switch (key) {
    case 'floatingWidth':
    case 'floatingHeight':
    case 'blurCloseDelayMs':
    case 'backupEveryChanges': {
      const n = Number.parseInt(raw, 10);
      return (Number.isFinite(n) ? n : DEFAULTS[key]) as StenoSettings[K];
    }
    case 'themeMode': {
      return (['light', 'dark', 'system'].includes(raw)
        ? raw
        : DEFAULTS.themeMode) as StenoSettings[K];
    }
    case 'editorMode': {
      return (['split', 'edit', 'preview'].includes(raw)
        ? raw
        : DEFAULTS.editorMode) as StenoSettings[K];
    }
    default:
      return raw as StenoSettings[K];
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const db = useDb();
  const state = reactive<StenoSettings>({ ...DEFAULTS });
  const loaded = ref(false);
  const error = ref<string | null>(null);

  async function load() {
    error.value = null;
    try {
      const keys = Object.keys(DEFAULTS) as (keyof StenoSettings)[];
      const entries = await Promise.all(
        keys.map(async k => [k, await db.getSetting(k)] as const),
      );
      for (const [k, v] of entries) {
        (state[k] as StenoSettings[typeof k]) = decode(k, v);
      }
      loaded.value = true;
    } catch (e) {
      error.value = String(e);
    }
  }

  /**
   * 乐观写：先改本地、再写后端；失败回滚。
   * 调用方负责后续副作用（例如改完 *Shortcut 后调 reload_shortcuts）。
   */
  async function update<K extends keyof StenoSettings>(
    key: K,
    value: StenoSettings[K],
  ): Promise<void> {
    const prev = state[key];
    (state[key] as StenoSettings[K]) = value;
    try {
      await db.setSetting(key, String(value));
    } catch (e) {
      (state[key] as StenoSettings[K]) = prev;
      error.value = String(e);
      throw e;
    }
  }

  return { state, loaded, error, load, update };
});
