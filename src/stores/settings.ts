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
import { type Locale, isValidLocale } from '@/i18n/types';
import type { ReminderOption } from '@/types/steno';

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
  /** 粘贴板列表每页显示条数。 */
  clipboardPageSize: number;
  /** 速记浮窗弹出位置策略。 */
  quicknotePopupPosition: 'cursor' | 'center' | 'last';
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
  /**
   * 主列表条目类型筛选（持久化为逗号分隔字符串）。
   *
   * 空串 = 不过滤；典型值如 `'document,text'`。
   * 解析/序列化通过 `parseTypeFilters` / `serializeTypeFilters`（在 library store 中）。
   */
  mainListTypeFilters: string;
  /** 笔记编辑器大纲面板宽度（px）。 */
  noteEditorOutlineWidth: number;
  /** 笔记编辑器大纲面板是否展开。 */
  noteEditorOutlineOpen: boolean;
  /** Zen 模式大纲面板宽度（px）。 */
  zenOutlineWidth: number;
  /** Zen 模式大纲面板是否展开。 */
  zenOutlineOpen: boolean;
  /** 待办浮窗是否启用（关闭时全局快捷键会注销）。 */
  todoQuickPanelEnabled: boolean;
  /** 待办浮窗呼出快捷键（系统级注册）。 */
  todoQuickPanelShortcut: string;
  /** 待办浮窗弹出位置策略。 */
  todoQuickPanelPosition: 'bottom-right' | 'cursor' | 'last';
  /**
   * 浮窗上次位置（仅 `position === 'last'` 时使用）。
   *
   * 存储为 `"x,y"` 字符串（与 Rust 端 `commands.rs::show_todo_panel` 期望格式一致）。
   * 空串表示尚未记录过。
   */
  todoQuickPanelLastPos: string;
  /** 任务编辑器中展示的快捷提醒选项。 */
  reminderQuickOptions: ReminderOption[];
  /** 界面语言。 */
  locale: Locale;
  /** 主窗口圆角半径（px）。 */
  windowBorderRadius: number;
}

export const DEFAULT_REMINDER_QUICK_OPTIONS: ReminderOption[] = [
  {
    id: 'after-30-minutes',
    label: '30 分钟后',
    type: 'relative',
    value: 30,
    unit: 'minute',
  },
  {
    id: 'after-1-hour',
    label: '1 小时后',
    type: 'relative',
    value: 1,
    unit: 'hour',
  },
  {
    id: 'after-2-hours',
    label: '2 小时后',
    type: 'relative',
    value: 2,
    unit: 'hour',
  },
  {
    id: 'after-1-day',
    label: '1 天后',
    type: 'relative',
    value: 1,
    unit: 'day',
  },
  {
    id: 'next-week',
    label: '下周',
    type: 'relative',
    value: 7,
    unit: 'day',
  },
  {
    id: 'today-16',
    label: '今天下午 4 点',
    type: 'absolute',
    value: 0,
    unit: 'minute',
    absoluteTime: '16:00',
    dayOffset: 0,
  },
];

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
  clipboardPageSize: 20,
  quicknotePopupPosition: 'cursor',
  searchShortcut: 'Ctrl+Shift+F',
  floatingWidth: 400,
  floatingHeight: 300,
  blurCloseDelayMs: 800,
  editorMode: 'split',
  backupEveryChanges: 10,
  mainSidebarWidth: 220,
  mainSidebarCollapsed: false,
  mainListTypeFilters: '',
  noteEditorOutlineWidth: 280,
  noteEditorOutlineOpen: false,
  zenOutlineWidth: 300,
  zenOutlineOpen: true,
  todoQuickPanelEnabled: true,
  todoQuickPanelShortcut: 'Ctrl+Shift+T',
  todoQuickPanelPosition: 'bottom-right',
  todoQuickPanelLastPos: '',
  reminderQuickOptions: DEFAULT_REMINDER_QUICK_OPTIONS,
  locale: 'zh-CN',
  windowBorderRadius: 12,
};

function cloneReminderOptions(options: ReminderOption[]): ReminderOption[] {
  return options.map(option => ({ ...option }));
}

function defaultValue<K extends keyof StenoSettings>(key: K): StenoSettings[K] {
  if (key === 'reminderQuickOptions') {
    return cloneReminderOptions(DEFAULT_REMINDER_QUICK_OPTIONS) as StenoSettings[K];
  }
  return DEFAULTS[key];
}

function isValidReminderOption(option: unknown): option is ReminderOption {
  if (option === null || typeof option !== 'object') return false;
  const item = option as ReminderOption;
  if (typeof item.id !== 'string' || item.id.trim() === '') return false;
  if (typeof item.label !== 'string' || item.label.trim() === '') return false;
  if (!['relative', 'absolute'].includes(item.type)) return false;
  if (!['minute', 'hour', 'day'].includes(item.unit)) return false;
  if (!Number.isFinite(item.value)) return false;

  if (item.type === 'relative') {
    return item.value > 0;
  }

  return (
    /^([01]\d|2[0-3]):[0-5]\d$/.test(item.absoluteTime ?? '') &&
    Number.isInteger(item.dayOffset) &&
    (item.dayOffset ?? -1) >= 0
  );
}

function isValidReminderOptions(value: unknown): value is ReminderOption[] {
  return Array.isArray(value) && value.every(isValidReminderOption);
}

function encode<K extends keyof StenoSettings>(key: K, value: StenoSettings[K]): string {
  if (key === 'reminderQuickOptions') {
    if (!isValidReminderOptions(value)) {
      throw new Error('Invalid reminder quick option');
    }
    return JSON.stringify(value);
  }
  return String(value);
}

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
    return defaultValue(key);
  }
  switch (key) {
    case 'reminderQuickOptions': {
      try {
        const parsed = JSON.parse(raw);
        return (isValidReminderOptions(parsed)
          ? parsed
          : defaultValue(key)) as StenoSettings[K];
      } catch {
        return defaultValue(key);
      }
    }
    case 'floatingWidth':
    case 'floatingHeight':
    case 'blurCloseDelayMs':
    case 'backupEveryChanges':
    case 'mainSidebarWidth':
    case 'noteEditorOutlineWidth':
    case 'zenOutlineWidth': {
      const n = Number.parseInt(raw, 10);
      // 解析失败或 ≤0 时使用默认值
      return (Number.isFinite(n) && n > 0 ? n : defaultValue(key)) as StenoSettings[K];
    }
    case 'windowBorderRadius': {
      const n = Number.parseInt(raw, 10);
      return (Number.isFinite(n) && n >= 0 && n <= 24 ? n : defaultValue(key)) as StenoSettings[K];
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
    case 'noteEditorOutlineOpen':
    case 'zenOutlineOpen': {
      if (raw === 'true') return true as StenoSettings[K];
      if (raw === 'false') return false as StenoSettings[K];
      return defaultValue(key);
    }
    case 'todoQuickPanelEnabled': {
      if (raw === 'true') return true as StenoSettings[K];
      if (raw === 'false') return false as StenoSettings[K];
      return DEFAULTS[key];
    }
    case 'todoQuickPanelPosition': {
      return (['bottom-right', 'cursor', 'last'].includes(raw)
        ? raw
        : DEFAULTS.todoQuickPanelPosition) as StenoSettings[K];
    }
    case 'locale': {
      return (isValidLocale(raw) ? raw : DEFAULTS.locale) as StenoSettings[K];
    }
    default:
      return raw as StenoSettings[K];
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const db = useDb();
  /** 所有设置的响应式状态（`reactive` 支持深层修改追踪）。 */
  const state = reactive<StenoSettings>({
    ...DEFAULTS,
    reminderQuickOptions: cloneReminderOptions(DEFAULT_REMINDER_QUICK_OPTIONS),
  });
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
    const encoded = encode(key, value);
    const prev = state[key];
    (state[key] as StenoSettings[K]) = value; // 乐观：先改本地
    try {
      await db.setSetting(key, encoded);
    } catch (e) {
      (state[key] as StenoSettings[K]) = prev; // 回滚
      error.value = String(e);
      throw e; // rethrow 让调用方感知失败
    }
  }

  return { state, loaded, error, load, update };
});
