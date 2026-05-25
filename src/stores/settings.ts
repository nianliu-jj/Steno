/**
 * @file 设置 Store — 后端 settings 表的 typed reactive view-model
 *
 * **加载策略**：启动时 `load()` 一次性拉取所有键，`decode()` 按字段类型
 * 还原 TS 类型（后端 settings 表全部存 TEXT）。
 *
 * **写入策略（乐观更新）**：`update()` 先改本地 `state`、再写后端，
 * 这样 UI 不等待 IPC round-trip。写失败时回滚（恢复上次值）并把 `error`
 * 暴露给 SettingsView。
 *
 * **字段对齐**：字段集合与 `src-tauri/src/db.rs::ensure_default_settings`
 * 完全对齐。添加新键时需同时修改两边。
 */

import { defineStore } from 'pinia';
import { reactive, ref } from 'vue';

import { useDb } from '@/composables/useDb';

/** 主题模式：亮色 / 暗色 / 跟随系统。 */
export type ThemeMode = 'light' | 'dark' | 'system';
/**
 * 编辑器默认模式。
 * - `split` — 分屏（编辑 + 预览）
 * - `edit` — 纯编辑
 * - `preview` — 纯预览（只读）
 */
export type EditorMode = 'split' | 'edit' | 'preview';

/**
 * 应用设置接口。
 *
 * 每个字段对应 SQLite `settings` 表中的一行（key = 字段名，value = TEXT）。
 * 读取时通过 `decode()` 将字符串还原为正确的 TS 类型。
 */
export interface StenoSettings {
  /** 主题模式。 */
  themeMode: ThemeMode;
  /** 切换主窗口的全局快捷键。 */
  mainWindowShortcut: string;
  /** 速记浮窗的全局快捷键。 */
  quicknoteShortcut: string;
  /** 粘贴板浮窗 / 页面入口的全局快捷键。 */
  clipboardShortcut: string;
  /** 全局搜索的快捷键。 */
  searchShortcut: string;
  /** 速记浮窗默认宽度（px）。 */
  floatingWidth: number;
  /** 速记浮窗默认高度（px）。 */
  floatingHeight: number;
  /** 浮窗失焦后延迟关闭的毫秒数。 */
  blurCloseDelayMs: number;
  /** 编辑器默认模式。 */
  editorMode: EditorMode;
  /** 每 N 次变更后创建一次备份。 */
  backupEveryChanges: number;
  /** 主窗口侧边栏宽度（px）。 */
  mainSidebarWidth: number;
  /** 主窗口侧边栏是否折叠。 */
  mainSidebarCollapsed: boolean;
  /** Zen 模式大纲面板宽度（px）。 */
  zenOutlineWidth: number;
}

/**
 * 默认设置值。
 *
 * 首次启动时由 Rust 端 `ensure_default_settings` 写入 SQLite；
 * 前端 `load()` 时对未设置的 key 使用此默认值。
 */
const DEFAULTS: StenoSettings = {
  themeMode: 'system',
  mainWindowShortcut: 'Ctrl+Shift+N',
  quicknoteShortcut: 'Ctrl+Shift+M',
  clipboardShortcut: 'Ctrl+Shift+V',
  searchShortcut: 'Ctrl+Shift+F',
  floatingWidth: 400,
  floatingHeight: 300,
  blurCloseDelayMs: 800,
  editorMode: 'split',
  backupEveryChanges: 10,
  mainSidebarWidth: 220,
  mainSidebarCollapsed: false,
  zenOutlineWidth: 280,
};

/**
 * 将后端返回的 TEXT 值按字段类型还原为 TS 类型。
 *
 * 后端 `settings` 表统一存储 TEXT，前端需要知道每个字段的期望类型：
 * - `number` 字段 → `Number.parseInt`
 * - `boolean` 字段 → `raw === 'true'`
 * - 枚举字段 → 白名单校验，非法值 fallback 到默认值
 *
 * @param key - 设置键名
 * @param raw - 后端返回的原始字符串（可能为 null）
 * @returns 还原后的正确类型值
 */
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
    case 'backupEveryChanges':
    case 'mainSidebarWidth':
    case 'zenOutlineWidth': {
      const n = Number.parseInt(raw, 10);
      // 解析失败或 ≤0 时使用默认值
      return (Number.isFinite(n) && n > 0 ? n : DEFAULTS[key]) as StenoSettings[K];
    }
    case 'mainSidebarCollapsed': {
      return (raw === 'true') as StenoSettings[K];
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
  /** 所有设置的响应式状态（`reactive` 支持深层修改追踪）。 */
  const state = reactive<StenoSettings>({ ...DEFAULTS });
  /** 是否已完成首次加载。 */
  const loaded = ref(false);
  /** 最近一次操作失败的错误消息。 */
  const error = ref<string | null>(null);

  /**
   * 一次性加载所有设置项。
   *
   * 后台 `Promise.all` 并行请求所有 key，非逐个串行。
   * 每个值经过 `decode()` 还原 TS 类型后写入 `state`。
   */
  async function load() {
    error.value = null;
    try {
      const keys = Object.keys(DEFAULTS) as (keyof StenoSettings)[];
      // 并行查询所有 key — 减少 round-trip 次数
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
   * 乐观写入一项设置。
   *
   * **乐观更新模式**：
   * 1. 先改本地 `state[key]`（UI 立即响应）
   * 2. 再写后端 `db.setSetting`
   * 3. 写失败 → 回滚 `state[key]` 到旧值 + 设置 `error` + rethrow
   *
   * 调用方负责后续副作用（例如改完 `*Shortcut` 后调 `reload_shortcuts`）。
   *
   * @param key - 设置键名
   * @param value - 新值
   * @throws 后端写入失败时抛出错误
   */
  async function update<K extends keyof StenoSettings>(
    key: K,
    value: StenoSettings[K],
  ): Promise<void> {
    const prev = state[key];
    (state[key] as StenoSettings[K]) = value; // 乐观：先改本地
    try {
      await db.setSetting(key, String(value));
    } catch (e) {
      (state[key] as StenoSettings[K]) = prev; // 回滚
      error.value = String(e);
      throw e; // rethrow 让调用方感知失败
    }
  }

  return { state, loaded, error, load, update };
});
