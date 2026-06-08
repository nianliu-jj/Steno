<!--
  @file 前端视图 - Settings View

  承载 Settings View 的界面结构、响应式状态和用户交互，是 前端视图 模块的可视入口之一。
  注释重点标明模板结构、脚本状态、事件派发和样式隔离边界。
-->

<script setup lang="ts">
// 脚本区：组织 Settings View 的响应式状态、计算属性、事件处理和外部模块协作。
/**
 * @component SettingsView
 * @description 设置面板 — 主窗口内由 `NModal` 承载（`embedded=true`），
 *              独立 `settings` 模式下作为整页展示。
 *
 * **标签页**：常规 / 外观 / 快捷键 / 隐私安全 / 存储 / 关于
 *
 * **数据流**：
 * - 读取：`settings.state`（Pinia store），由 `settings.load()` 初始化
 * - 写入：乐观更新模式（`settings.update(key, value)`，失败回滚）
 * - 主题变更：写入后通过 `steno:theme-mode-changed` 事件广播到所有窗口
 * - 快捷键变更：写入后调用 `db.reloadShortcuts()` 让 Rust 端重新注册
 *
 * @props
 * - `embedded?: boolean` — `true` = Modal 内嵌模式（有 close emit）
 *
 * @emits
 * - `close` — 关闭设置面板（仅 embedded 模式）
 */

import { computed, nextTick, onMounted, ref } from 'vue';
import {
  NButton,
  NInput,
  NInputNumber,
  NPopconfirm,
  NRadio,
  NRadioGroup,
  NSelect,
  NSpace,
  NSwitch,
  NText,
  NTooltip,
  useMessage
} from 'naive-ui';

import { useAppEvents } from '@/composables/useAppEvents';
import { useDb } from '@/composables/useDb';
import {
  DEFAULT_REMINDER_QUICK_OPTIONS,
  useSettingsStore,
  // 类型 EditorMode：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  type EditorMode,
  // 类型 StenoSettings：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  type StenoSettings,
  // 类型 ThemeMode：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  type ThemeMode
} from '@/stores/settings';
import type { ReminderOption } from '@/types/steno';
import { useUiStore } from '@/stores/ui';
import { useI18n } from '@/i18n';
import { LOCALE_OPTIONS, type Locale } from '@/i18n/types';

// 局部常量 props：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const props = withDefaults(defineProps<{ embedded?: boolean }>(), {
  embedded: false
});

// 局部常量 emit：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const emit = defineEmits<{
  close: [];
}>();

// 类型 SettingsSection：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
type SettingsSection = 'general' | 'appearance' | 'shortcuts' | 'todo' | 'reminders' | 'privacy' | 'storage' | 'about';

const sections: { key: SettingsSection; label: string }[] = [
  { key: 'general', label: '常规' },
  { key: 'appearance', label: '外观' },
  { key: 'shortcuts', label: '快捷键' },
  { key: 'todo', label: '待办浮窗' },
  { key: 'reminders', label: '提醒设置' },
  { key: 'privacy', label: '隐私安全' },
  { key: 'storage', label: '存储' },
  { key: 'about', label: '关于' }
];

// 局部常量 db：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const db = useDb();
// 局部常量 settings：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const settings = useSettingsStore();
// 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const ui = useUiStore();
// 局部常量 message：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const message = useMessage();
const { emitThemeModeChanged } = useAppEvents();
// 局部常量 i18n：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const i18n = useI18n();
// 局部常量 activeSection：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const activeSection = ref<SettingsSection>('general');

// 局部常量 localeOptions：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const localeOptions = LOCALE_OPTIONS.map(opt => ({ label: opt.label, value: opt.value }));

// 函数 onLocaleChange：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onLocaleChange(value: Locale) {
  try {
    await settings.update('locale', value);
    i18n.state.locale = value;
  } catch (e) {
    message.error(`语言保存失败：${String(e)}`);
  }
}

// 函数 onThemeChange：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onThemeChange(value: ThemeMode) {
  try {
    await settings.update('themeMode', value);
  } catch (e) {
    message.error(`主题保存失败：${String(e)}`);
    return;
  }

  try {
    await emitThemeModeChanged(value);
  } catch (e) {
    console.error('[settings] failed to broadcast theme mode change:', e);
  }
}

// 局部常量 mainShortcut：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const mainShortcut = ref('');
// 局部常量 quicknoteShortcut：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const quicknoteShortcut = ref('');
// 局部常量 clipboardShortcut：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const clipboardShortcut = ref('');
// 局部常量 searchShortcut：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const searchShortcut = ref('');
// 局部常量 todoShortcut：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const todoShortcut = ref('');
// 局部常量 shortcutDialogKey：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const shortcutDialogKey = ref<ShortcutKey | null>(null);
// 局部常量 shortcutDialogRef：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const shortcutDialogRef = ref<HTMLElement | null>(null);

// 类型 ShortcutKey：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
type ShortcutKey =
  | 'mainWindowShortcut'
  | 'quicknoteShortcut'
  | 'clipboardShortcut'
  | 'searchShortcut'
  | 'todoQuickPanelShortcut';

// 函数 syncShortcutLocals：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function syncShortcutLocals() {
  mainShortcut.value = settings.state.mainWindowShortcut;
  quicknoteShortcut.value = settings.state.quicknoteShortcut;
  clipboardShortcut.value = settings.state.clipboardShortcut;
  searchShortcut.value = settings.state.searchShortcut;
  todoShortcut.value = settings.state.todoQuickPanelShortcut;
}

// 局部常量 shortcutDialogLabel：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const shortcutDialogLabel = computed(() => (shortcutDialogKey.value ? labelOf(shortcutDialogKey.value) : ''));
// 局部常量 shortcutDialogCurrent：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const shortcutDialogCurrent = computed(() =>
  shortcutDialogKey.value ? shortcutRefOf(shortcutDialogKey.value).value : ''
);

// 函数 commitShortcut：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function commitShortcut(key: ShortcutKey, value: string) {
  // 局部常量 trimmed：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const trimmed = value.trim();
  if (!trimmed || trimmed === settings.state[key]) return;
  // 局部常量 previous：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const previous = settings.state[key];
  try {
    await settings.update(key, trimmed);
    if (key !== 'searchShortcut') {
      await db.reloadShortcuts();
    }
    message.success(`已更新「${labelOf(key)}」`);
  } catch (e) {
    try {
      await settings.update(key, previous);
      if (key !== 'searchShortcut') {
        await db.reloadShortcuts();
      }
    } catch {
      // 回滚失败时保留原始保存错误给用户。
    }
    message.error(`快捷键保存失败：${String(e)}`);
    syncShortcutLocals();
  }
}

// 函数 shortcutRefOf：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function shortcutRefOf(key: ShortcutKey) {
  switch (key) {
    case 'mainWindowShortcut':
      return mainShortcut;
    case 'quicknoteShortcut':
      return quicknoteShortcut;
    case 'clipboardShortcut':
      return clipboardShortcut;
    case 'searchShortcut':
      return searchShortcut;
    case 'todoQuickPanelShortcut':
      return todoShortcut;
  }
}

// 函数 formatShortcutKey：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function formatShortcutKey(event: KeyboardEvent) {
  // 局部常量 key：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const key = normalizeShortcutKey(event);
  if (!key) return '';
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');
  if (!parts.length) return '';
  parts.push(key);
  return parts.join('+');
}

// 函数 normalizeShortcutKey：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function normalizeShortcutKey(event: KeyboardEvent) {
  // 局部常量 ignored：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const ignored = new Set(['Control', 'Alt', 'Shift', 'Meta', 'Process', 'Unidentified']);
  if (ignored.has(event.key)) return '';
  if (event.key === ' ') return 'Space';
  if (event.key.length === 1) return event.key.toUpperCase();
  return event.key;
}

// 函数 openShortcutDialog：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function openShortcutDialog(key: ShortcutKey) {
  shortcutDialogKey.value = key;
  void nextTick(() => shortcutDialogRef.value?.focus());
}

// 函数 closeShortcutDialog：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function closeShortcutDialog() {
  shortcutDialogKey.value = null;
}

// 函数 captureShortcut：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function captureShortcut(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') {
    closeShortcutDialog();
    return;
  }

  // 局部常量 key：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const key = shortcutDialogKey.value;
  if (!key) return;

  // 局部常量 next：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const next = formatShortcutKey(event);
  if (!next) {
    message.info('请同时按下 Ctrl / Alt / Shift / Meta 与一个按键');
    return;
  }
  if (next.split('+').length > 3) {
    message.info('快捷键最多支持 3 个按键');
    return;
  }

  shortcutRefOf(key).value = next;
  closeShortcutDialog();
  void commitShortcut(key, next);
}

// 函数 labelOf：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function labelOf(key: ShortcutKey) {
  switch (key) {
    case 'mainWindowShortcut':
      return '主窗口快捷键';
    case 'quicknoteShortcut':
      return '速记浮窗快捷键';
    case 'clipboardShortcut':
      return '粘贴板快捷键';
    case 'searchShortcut':
      return '搜索快捷键';
    case 'todoQuickPanelShortcut':
      return '待办浮窗快捷键';
  }
}

// 函数 onUpdateNumber：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onUpdateNumber<
  K extends
    | 'floatingWidth'
    | 'floatingHeight'
    | 'blurCloseDelayMs'
    | 'backupEveryChanges'
    | 'windowBorderRadius'
    | 'unsavedNoteRetentionDays'
    | 'clipboardRetentionDays'
>(key: K, value: number | null) {
  if (value == null || !Number.isFinite(value)) return;
  if (value === settings.state[key]) return;
  try {
    await settings.update(key, value);
  } catch (e) {
    message.error(`设置保存失败：${String(e)}`);
  }
}

// 函数 onEditorModeChange：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onEditorModeChange(value: EditorMode) {
  try {
    await settings.update('editorMode', value);
  } catch (e) {
    message.error(`编辑器模式保存失败：${String(e)}`);
  }
}

// 函数 onTodoEnabledChange：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onTodoEnabledChange(value: boolean) {
  try {
    await settings.update('todoQuickPanelEnabled', value);
    // 后端的 register_from_settings 会读取 enabled 决定是否注册，所以这里需要 reload。
    await db.reloadShortcuts();
    message.success(value ? '已启用待办浮窗' : '已停用待办浮窗');
  } catch (e) {
    message.error(`保存失败：${String(e)}`);
    // 失败时回滚本地状态由 settings.update 自身负责；这里不动 settings.state。
  }
}

// 函数 onTodoPositionChange：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onTodoPositionChange(value: StenoSettings['todoQuickPanelPosition']) {
  try {
    await settings.update('todoQuickPanelPosition', value);
  } catch (e) {
    message.error(`保存失败：${String(e)}`);
  }
}

// 函数 onPopupPositionChange：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onPopupPositionChange(_key: 'quicknotePopupPosition', value: string) {
  try {
    await settings.update('quicknotePopupPosition', value as 'cursor' | 'center' | 'last');
  } catch (e) {
    message.error(`保存失败：${String(e)}`);
  }
}

// 函数 onLaunchAtStartupChange：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onLaunchAtStartupChange(value: boolean) {
  // 局部常量 previous：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const previous = settings.state.launchAtStartup;
  try {
    await settings.update('launchAtStartup', value);
    await db.setLaunchAtStartup(value);
    message.success(value ? '已开启开机自启动' : '已关闭开机自启动');
  } catch (e) {
    try {
      await settings.update('launchAtStartup', previous);
      await db.setLaunchAtStartup(previous);
    } catch {
      // 保留原始错误提示，回滚失败不覆盖用户最需要看到的信息。
    }
    message.error(`开机自启动保存失败：${String(e)}`);
  }
}

// 局部常量 editorModeOptions：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const editorModeOptions = [
  { label: '编辑 + 预览', value: 'split' },
  { label: '只编辑', value: 'edit' },
  { label: '只预览', value: 'preview' }
] satisfies { label: string; value: EditorMode }[];

// 局部常量 popupPositionOptions：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const popupPositionOptions = [
  { label: '跟随光标', value: 'cursor' },
  { label: '屏幕居中', value: 'center' },
  { label: '上次位置', value: 'last' }
];

// 局部常量 reminderUnitOptions：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const reminderUnitOptions = [
  { label: '分钟', value: 'minute' },
  { label: '小时', value: 'hour' },
  { label: '天', value: 'day' }
] satisfies { label: string; value: ReminderOption['unit'] }[];

// 函数 cloneReminderOptions：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function cloneReminderOptions(options: ReminderOption[]) {
  return options.map(option => ({ ...option }));
}

// 函数 nanoid：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function nanoid(size = 10) {
  // 局部常量 alphabet：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  // 局部常量 bytes：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}

// 函数 persistReminderOptions：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function persistReminderOptions(options: ReminderOption[]) {
  try {
    await settings.update('reminderQuickOptions', options);
  } catch (e) {
    message.error(`提醒选项保存失败：${String(e)}`);
  }
}

// 函数 updateReminderOption：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function updateReminderOption(index: number, patch: Partial<ReminderOption>) {
  // 局部常量 next：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const next = cloneReminderOptions(settings.state.reminderQuickOptions);
  next[index] = { ...next[index], ...patch };
  void persistReminderOptions(next);
}

// 函数 onReminderTypeChange：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onReminderTypeChange(index: number, type: ReminderOption['type']) {
  if (type === 'relative') {
    updateReminderOption(index, {
      type,
      value: 15,
      unit: 'minute',
      absoluteTime: undefined,
      dayOffset: undefined
    });
    return;
  }

  updateReminderOption(index, {
    type,
    value: 0,
    unit: 'minute',
    absoluteTime: '16:00',
    dayOffset: 0
  });
}

// 函数 onReminderNumberChange：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onReminderNumberChange(index: number, key: 'value' | 'dayOffset', value: number | null) {
  if (value === null || !Number.isFinite(value)) return;
  updateReminderOption(index, { [key]: value });
}

// 函数 addReminderOption：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function addReminderOption() {
  void persistReminderOptions([
    ...cloneReminderOptions(settings.state.reminderQuickOptions),
    {
      id: `reminder-${nanoid()}`,
      label: '15 分钟后',
      type: 'relative',
      value: 15,
      unit: 'minute'
    }
  ]);
}

// 函数 deleteReminderOption：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function deleteReminderOption(index: number) {
  // 局部常量 next：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const next = cloneReminderOptions(settings.state.reminderQuickOptions);
  next.splice(index, 1);
  void persistReminderOptions(next);
}

// 函数 restoreDefaultReminderOptions：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function restoreDefaultReminderOptions() {
  void persistReminderOptions(cloneReminderOptions(DEFAULT_REMINDER_QUICK_OPTIONS));
}

// 局部常量 paths：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const paths = ref<{ dataDir: string; dbPath: string; backupDir: string } | null>(null);

// 函数 loadPaths：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function loadPaths() {
  try {
    paths.value = await db.getDataPaths();
  } catch (e) {
    console.error('[settings] getDataPaths failed:', e);
  }
}

// 函数 copyPath：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function copyPath(p: string) {
  try {
    await navigator.clipboard.writeText(p);
    message.success('已复制到剪贴板');
  } catch {
    message.error('复制失败');
  }
}

// 函数 closePanel：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function closePanel() {
  if (props.embedded) {
    emit('close');
  } else {
    ui.navigateToMain();
  }
}

onMounted(async () => {
  if (!settings.loaded) {
    await settings.load();
  }
  syncShortcutLocals();
  await loadPaths();
});

// 局部常量 headerSub：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const headerSub = computed(() => (settings.error ? `加载错误：${settings.error}` : '所有更改自动保存'));
</script>

<template>
  <!-- 模板区：描述 Settings View 的 DOM 层级、可交互区域和条件渲染边界。 -->
  <div class="settings-shell" :class="{ 'settings-shell--embedded': props.embedded }">
    <section class="settings-panel" role="dialog" aria-labelledby="settingsTitle">
      <header class="settings-panel__header">
        <div class="settings-brand">
          <span class="settings-brand__mark" aria-hidden="true">S</span>
          <div class="settings-brand__copy">
            <h1 id="settingsTitle">设置</h1>
            <p>{{ headerSub }}</p>
          </div>
        </div>
        <button class="settings-close-btn" type="button" aria-label="关闭设置" @click="closePanel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div class="settings-panel__body-wrap">
        <nav class="settings-sidebar" aria-label="设置分类">
          <button
            v-for="section in sections"
            :key="section.key"
            class="settings-tab"
            :class="{ 'settings-tab--active': activeSection === section.key }"
            :data-testid="`settings-tab-${section.key}`"
            type="button"
            :aria-pressed="activeSection === section.key"
            @click="activeSection = section.key"
          >
            <span>{{ section.label }}</span>
          </button>
        </nav>

        <main class="settings-panel__body">
          <section v-if="activeSection === 'general'" class="settings-section">
            <div class="settings-section__intro">
              <h2>常规</h2>
            </div>

            <h3 class="settings-group">启动与速记</h3>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  开机自启动
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    登录 Windows 后自动启动 Steno，便于保留托盘与全局快捷键。
                  </NTooltip>
                </strong>
              </div>
              <NSwitch
                data-testid="launch-at-startup-switch"
                :value="settings.state.launchAtStartup"
                @update:value="onLaunchAtStartupChange"
              />
            </div>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  速记浮窗宽度
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    新打开速记浮窗时使用的默认宽度。
                  </NTooltip>
                </strong>
              </div>
              <NInputNumber
                :value="settings.state.floatingWidth"
                :min="240"
                :max="1200"
                :step="20"
                size="small"
                @update:value="value => onUpdateNumber('floatingWidth', value)"
              />
            </div>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  速记浮窗高度
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    新打开速记浮窗时使用的默认高度。
                  </NTooltip>
                </strong>
              </div>
              <NInputNumber
                :value="settings.state.floatingHeight"
                :min="180"
                :max="900"
                :step="20"
                size="small"
                @update:value="value => onUpdateNumber('floatingHeight', value)"
              />
            </div>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  失焦关闭延迟
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    速记浮窗失去焦点后等待关闭的毫秒数。
                  </NTooltip>
                </strong>
              </div>
              <NInputNumber
                :value="settings.state.blurCloseDelayMs"
                :min="0"
                :max="5000"
                :step="100"
                size="small"
                @update:value="value => onUpdateNumber('blurCloseDelayMs', value)"
              />
            </div>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  弹出位置
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    速记浮窗打开时的定位策略。
                  </NTooltip>
                </strong>
              </div>
              <NSelect
                :value="settings.state.quicknotePopupPosition"
                :options="popupPositionOptions"
                size="small"
                style="width: 220px"
                @update:value="value => onPopupPositionChange('quicknotePopupPosition', value)"
              />
            </div>

            <h3 class="settings-group">语言</h3>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  界面语言
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    切换应用界面的显示语言，更改后立即生效。
                  </NTooltip>
                </strong>
              </div>
              <NSelect
                class="settings-control"
                size="small"
                :value="settings.state.locale"
                :options="localeOptions"
                @update:value="value => onLocaleChange(value as Locale)"
              />
            </div>
          </section>

          <section v-else-if="activeSection === 'appearance'" class="settings-section">
            <div class="settings-section__intro">
              <h2>外观</h2>
            </div>

            <h3 class="settings-group">主题</h3>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  颜色模式
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    跟随系统会响应操作系统浅色或深色模式。
                  </NTooltip>
                </strong>
              </div>
              <NRadioGroup :value="settings.state.themeMode" @update:value="value => onThemeChange(value as ThemeMode)">
                <NSpace>
                  <NRadio value="light">浅色</NRadio>
                  <NRadio value="dark">深色</NRadio>
                  <NRadio value="system">跟随系统</NRadio>
                </NSpace>
              </NRadioGroup>
            </div>
            <div class="settings-row settings-row--disabled">
              <div class="settings-row__meta">
                <strong>
                  主题强调色
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    原型中的强调色选择已预留，当前版本不写入设置。
                  </NTooltip>
                </strong>
              </div>
              <div class="settings-swatches" aria-label="规划中的主题强调色">
                <span style="--swatch: #b45f2a"></span>
                <span style="--swatch: #2f8f63"></span>
                <span style="--swatch: #3b6ea8"></span>
                <span style="--swatch: #8d5db7"></span>
              </div>
            </div>

            <h3 class="settings-group">窗口</h3>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  窗口圆角
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    主窗口边角的圆角半径，0 为直角。
                  </NTooltip>
                </strong>
              </div>
              <NInputNumber
                :value="settings.state.windowBorderRadius"
                :min="0"
                :max="24"
                :step="1"
                size="small"
                @update:value="value => onUpdateNumber('windowBorderRadius', value)"
              />
            </div>

            <h3 class="settings-group">编辑器</h3>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  编辑器模式
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    控制 Markdown 编辑器默认展示方式。
                  </NTooltip>
                </strong>
              </div>
              <NSelect
                class="settings-control"
                size="small"
                :value="settings.state.editorMode"
                :options="editorModeOptions"
                @update:value="value => onEditorModeChange(value as EditorMode)"
              />
            </div>
            <div class="settings-row settings-row--disabled">
              <div class="settings-row__meta">
                <strong>
                  便签默认底色
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    新便签纸张颜色将在后续版本接入画布卡片。
                  </NTooltip>
                </strong>
              </div>
              <NButton size="tiny" disabled>规划中</NButton>
            </div>
          </section>

          <section v-else-if="activeSection === 'shortcuts'" class="settings-section">
            <div class="settings-section__intro">
              <h2>快捷键</h2>
            </div>

            <h3 class="settings-group">全局入口</h3>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  主窗口
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    呼出或聚焦 Steno 主窗口。
                  </NTooltip>
                </strong>
              </div>
              <button
                class="settings-control settings-shortcut-capture"
                type="button"
                data-testid="main-shortcut-capture"
                aria-haspopup="dialog"
                title="双击更换快捷键"
                @dblclick="openShortcutDialog('mainWindowShortcut')"
              >
                {{ mainShortcut || '按下快捷键' }}
              </button>
            </div>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  速记浮窗
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    从任意应用快速打开速记输入框。
                  </NTooltip>
                </strong>
              </div>
              <button
                class="settings-control settings-shortcut-capture"
                type="button"
                data-testid="quicknote-shortcut-capture"
                aria-haspopup="dialog"
                title="双击更换快捷键"
                @dblclick="openShortcutDialog('quicknoteShortcut')"
              >
                {{ quicknoteShortcut || '按下快捷键' }}
              </button>
            </div>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  粘贴板
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    呼出 Steno 主窗口并打开粘贴板历史。
                  </NTooltip>
                </strong>
              </div>
              <button
                class="settings-control settings-shortcut-capture"
                type="button"
                data-testid="clipboard-shortcut-capture"
                aria-haspopup="dialog"
                title="双击更换快捷键"
                @dblclick="openShortcutDialog('clipboardShortcut')"
              >
                {{ clipboardShortcut || '按下快捷键' }}
              </button>
            </div>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  搜索
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    当前为应用内预留字段，暂不注册到操作系统。
                  </NTooltip>
                </strong>
              </div>
              <button
                class="settings-control settings-shortcut-capture"
                type="button"
                data-testid="search-shortcut-capture"
                aria-haspopup="dialog"
                title="双击更换快捷键"
                @dblclick="openShortcutDialog('searchShortcut')"
              >
                {{ searchShortcut || '按下快捷键' }}
              </button>
            </div>
          </section>

          <section v-else-if="activeSection === 'todo'" class="settings-section">
            <div class="settings-section__intro">
              <h2>待办浮窗</h2>
            </div>

            <h3 class="settings-group">浮窗</h3>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  启用待办浮窗
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    关闭后系统级快捷键会注销，浮窗不可呼出。
                  </NTooltip>
                </strong>
              </div>
              <NSwitch
                :value="settings.state.todoQuickPanelEnabled"
                data-testid="todo-enabled-switch"
                @update:value="onTodoEnabledChange"
              />
            </div>
            <div class="settings-row" :class="{ 'settings-row--disabled': !settings.state.todoQuickPanelEnabled }">
              <div class="settings-row__meta">
                <strong>
                  呼出快捷键
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    聚焦后直接按下组合键保存；系统级快捷键会重新注册。
                  </NTooltip>
                </strong>
              </div>
              <button
                class="settings-control settings-shortcut-capture"
                type="button"
                data-testid="todo-shortcut-capture"
                :disabled="!settings.state.todoQuickPanelEnabled"
                aria-haspopup="dialog"
                title="双击更换快捷键"
                @dblclick="openShortcutDialog('todoQuickPanelShortcut')"
              >
                {{ todoShortcut || '按下快捷键' }}
              </button>
            </div>
            <div class="settings-row" :class="{ 'settings-row--disabled': !settings.state.todoQuickPanelEnabled }">
              <div class="settings-row__meta">
                <strong>
                  弹出位置
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    选择浮窗在屏幕上的初始位置策略。
                  </NTooltip>
                </strong>
              </div>
              <NRadioGroup
                :value="settings.state.todoQuickPanelPosition"
                :disabled="!settings.state.todoQuickPanelEnabled"
                data-testid="todo-position-radio"
                @update:value="onTodoPositionChange"
              >
                <NSpace>
                  <NRadio value="bottom-right">屏幕右下角</NRadio>
                  <NRadio value="cursor">跟随光标</NRadio>
                  <NRadio value="last">记住上次位置</NRadio>
                </NSpace>
              </NRadioGroup>
            </div>
          </section>

          <section v-else-if="activeSection === 'reminders'" class="settings-section">
            <div class="settings-section__intro">
              <h2>提醒设置</h2>
            </div>

            <div class="settings-section__toolbar">
              <NButton size="small" type="primary" data-testid="reminder-option-add" @click="addReminderOption">
                添加选项
              </NButton>
              <NPopconfirm
                positive-text="恢复默认"
                negative-text="取消"
                @positive-click="restoreDefaultReminderOptions"
              >
                <template #trigger>
                  <NButton size="small" secondary data-testid="reminder-options-reset">恢复默认</NButton>
                </template>
                使用默认 6 个提醒选项覆盖当前列表。
              </NPopconfirm>
            </div>

            <div class="reminder-options">
              <div
                v-for="(option, index) in settings.state.reminderQuickOptions"
                :key="option.id"
                class="reminder-option-row"
              >
                <NInput
                  class="reminder-option-label"
                  size="small"
                  :value="option.label"
                  :data-testid="`reminder-option-label-${index}`"
                  placeholder="显示名称"
                  @update:value="value => updateReminderOption(index, { label: value })"
                />

                <NRadioGroup
                  :value="option.type"
                  @update:value="value => onReminderTypeChange(index, value as ReminderOption['type'])"
                >
                  <NSpace :size="10">
                    <NRadio value="relative">相对</NRadio>
                    <NRadio value="absolute">绝对</NRadio>
                  </NSpace>
                </NRadioGroup>

                <template v-if="option.type === 'relative'">
                  <NInputNumber
                    class="reminder-option-number"
                    size="small"
                    :min="1"
                    :value="option.value"
                    @update:value="value => onReminderNumberChange(index, 'value', value)"
                  />
                  <NSelect
                    class="reminder-option-unit"
                    size="small"
                    :value="option.unit"
                    :options="reminderUnitOptions"
                    @update:value="value => updateReminderOption(index, { unit: value as ReminderOption['unit'] })"
                  />
                </template>

                <template v-else>
                  <NInput
                    class="reminder-option-time"
                    size="small"
                    :value="option.absoluteTime"
                    placeholder="16:00"
                    @update:value="value => updateReminderOption(index, { absoluteTime: value })"
                  />
                  <NInputNumber
                    class="reminder-option-number"
                    size="small"
                    :min="0"
                    :value="option.dayOffset ?? 0"
                    @update:value="value => onReminderNumberChange(index, 'dayOffset', value)"
                  />
                </template>

                <NButton
                  size="small"
                  type="error"
                  secondary
                  :data-testid="`reminder-option-delete-${index}`"
                  @click="deleteReminderOption(index)"
                >
                  删除
                </NButton>
              </div>
              <NText v-if="settings.state.reminderQuickOptions.length === 0" depth="3">暂无快捷提醒选项。</NText>
            </div>
          </section>

          <section v-else-if="activeSection === 'privacy'" class="settings-section">
            <div class="settings-section__intro">
              <h2>隐私安全</h2>
            </div>

            <h3 class="settings-group">本地保护</h3>
            <div class="settings-row settings-row--disabled">
              <div class="settings-row__meta">
                <strong>
                  数据库加密
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    SQLCipher 加密入口规划中，当前版本不会修改数据库结构。
                  </NTooltip>
                </strong>
              </div>
              <NButton size="tiny" disabled>规划中</NButton>
            </div>
            <div class="settings-row settings-row--disabled">
              <div class="settings-row__meta">
                <strong>
                  敏感内容过滤
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    信用卡号、Token、私钥等模式过滤需要后端规则支持。
                  </NTooltip>
                </strong>
              </div>
              <NButton size="tiny" disabled>规划中</NButton>
            </div>
            <div class="settings-row settings-row--disabled">
              <div class="settings-row__meta">
                <strong>
                  应用排除名单
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    密码管理器和指定应用排除名单将在权限层接入。
                  </NTooltip>
                </strong>
              </div>
              <NButton size="tiny" disabled>只读</NButton>
            </div>
          </section>

          <section v-else-if="activeSection === 'storage'" class="settings-section">
            <div class="settings-section__intro">
              <h2>存储位置</h2>
            </div>

            <h3 class="settings-group">本地路径</h3>
            <div v-if="paths" class="settings-paths">
              <div class="settings-path-row">
                <span class="settings-path-label">数据目录</span>
                <code class="settings-path-value">{{ paths.dataDir }}</code>
                <NButton tertiary size="tiny" @click="copyPath(paths.dataDir)">复制</NButton>
              </div>
              <div class="settings-path-row">
                <span class="settings-path-label">数据库文件</span>
                <code class="settings-path-value">{{ paths.dbPath }}</code>
                <NButton tertiary size="tiny" @click="copyPath(paths.dbPath)">复制</NButton>
              </div>
              <div class="settings-path-row">
                <span class="settings-path-label">备份目录</span>
                <code class="settings-path-value">{{ paths.backupDir }}</code>
                <NButton tertiary size="tiny" @click="copyPath(paths.backupDir)">复制</NButton>
              </div>
            </div>
            <NText v-else depth="3">加载中...</NText>

            <h3 class="settings-group">备份</h3>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  累计修改次数触发备份
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    达到阈值后打包本地 Markdown 与索引。
                  </NTooltip>
                </strong>
              </div>
              <NInputNumber
                :value="settings.state.backupEveryChanges"
                :min="1"
                :max="200"
                :step="1"
                size="small"
                @update:value="value => onUpdateNumber('backupEveryChanges', value)"
              />
            </div>

            <h3 class="settings-group">数据清理</h3>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  未保存笔记保留天数
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    "未保存"草稿最后修改超过该天数后会被定时清理。
                  </NTooltip>
                </strong>
              </div>
              <NInputNumber
                :value="settings.state.unsavedNoteRetentionDays"
                :min="1"
                :max="3650"
                :step="1"
                size="small"
                data-testid="settings-unsaved-retention"
                @update:value="value => onUpdateNumber('unsavedNoteRetentionDays', value)"
              />
            </div>
            <div class="settings-row">
              <div class="settings-row__meta">
                <strong>
                  粘贴板保留天数
                  <NTooltip trigger="hover">
                    <template #trigger>
                      <svg
                        class="settings-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </template>
                    粘贴板复制项超过该天数未使用后会被定时清理（置顶项不清理）。
                  </NTooltip>
                </strong>
              </div>
              <NInputNumber
                :value="settings.state.clipboardRetentionDays"
                :min="1"
                :max="3650"
                :step="1"
                size="small"
                data-testid="settings-clipboard-retention"
                @update:value="value => onUpdateNumber('clipboardRetentionDays', value)"
              />
            </div>
          </section>

          <section v-else class="settings-section">
            <div class="settings-section__intro">
              <h2>关于 Steno</h2>
            </div>

            <div class="settings-about-grid">
              <div class="settings-about-card">
                <span>版本</span>
                <strong>Steno 0.0.0</strong>
                <small>本地开发版</small>
              </div>
              <div class="settings-about-card">
                <span>运行时</span>
                <strong>Tauri 2 + Vue 3</strong>
                <small>Rust 后端 · SQLite 本地库</small>
              </div>
              <div class="settings-about-card">
                <span>数据策略</span>
                <strong>本地优先</strong>
                <small>默认不上传笔记内容</small>
              </div>
              <div class="settings-about-card">
                <span>许可证</span>
                <strong>MIT</strong>
                <small>开源项目</small>
              </div>
            </div>
          </section>
        </main>
      </div>

      <div
        v-if="shortcutDialogKey"
        ref="shortcutDialogRef"
        class="shortcut-dialog-backdrop"
        data-testid="shortcut-capture-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcutDialogTitle"
        tabindex="-1"
        @click.self="closeShortcutDialog"
        @keydown="captureShortcut"
      >
        <section class="shortcut-dialog" @click.stop>
          <h2 id="shortcutDialogTitle">更换快捷键</h2>
          <p>正在更换「{{ shortcutDialogLabel }}」，请按下新的组合键。</p>
          <div class="shortcut-dialog__preview">
            {{ shortcutDialogCurrent || '等待输入' }}
          </div>
          <small>最多支持 3 个按键，按 Esc 取消。</small>
          <div class="shortcut-dialog__actions">
            <button type="button" class="shortcut-dialog__cancel" @click="closeShortcutDialog">取消</button>
          </div>
        </section>
      </div>

      <footer class="settings-panel__footer">
        <span class="settings-save-hint">所有更改自动保存到本地</span>
      </footer>
    </section>
  </div>
</template>

<style scoped>
/* 样式区：限定 Settings View 的布局、主题色和响应式细节。 */
.settings-shell {
  width: 100vw;
  height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(0deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px), #15151a;
  background-size: 44px 44px;
  color: #ebe7e2;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.settings-shell--embedded {
  /* 主窗口内通过 NModal 承载，mask 已置透明。让 shell 自身 fixed 铺满整个
     app 视口、背景跟随主题，看起来就像设置直接替换了 main view，不再有外层
     黑色 mask + card 边框包裹。 */
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  padding: 0;
  background: var(--app-bg);
  display: grid;
  place-items: stretch;
}

.settings-shell--embedded .settings-panel {
  /* 全屏铺满，去掉 card 视觉（圆角 / 边框 / 阴影），让设置内容直接呈现。 */
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  border-radius: 0;
  border: none;
  box-shadow: none;
}

.settings-panel {
  --settings-control-bg: #ffffff;
  --settings-control-bg-focus: #ffffff;
  --settings-control-bg-disabled: #f3efea;
  --settings-control-fg: #27231f;
  --settings-control-muted: #6f655d;
  --settings-control-placeholder: #8f8378;
  --settings-control-border: rgba(93, 78, 65, 0.55);
  --settings-control-border-hover: rgba(168, 95, 50, 0.68);
  --settings-control-border-focus: #38d8a2;
  width: min(1060px, calc(100vw - 32px));
  height: min(660px, calc(100vh - 48px));
  min-width: 760px;
  position: relative;
  display: grid;
  grid-template-rows: 48px 1fr 40px;
  overflow: hidden;
  border: 1px solid rgba(128, 117, 105, 0.35);
  border-radius: 14px;
  background: #fbfaf8;
  color: #27231f;
  box-shadow: 0 28px 80px rgba(20, 17, 14, 0.35);
}

:global(.dark) .settings-panel,
.settings-shell:not(.settings-shell--embedded) .settings-panel {
  --settings-control-bg: var(--app-surface-2);
  --settings-control-bg-focus: var(--app-surface-2);
  --settings-control-bg-disabled: var(--app-surface);
  --settings-control-fg: var(--app-fg);
  --settings-control-muted: var(--app-muted);
  --settings-control-placeholder: var(--app-faint);
  --settings-control-border: oklch(45% 0.014 70);
  --settings-control-border-hover: var(--app-accent);
  --settings-control-border-focus: var(--app-accent);
  background: var(--app-surface);
  color: var(--app-fg);
  border-color: rgba(255, 255, 255, 0.1);
}

/* NRadio 默认会跟随 Naive UI 主题色（dark 主题下变浅），但 .settings-panel 自身
   背景与 panel.color 已经做了双主题；让 radio label / 数字输入 / 路径 code 直接
   继承 panel 当前 color，避免在浅色背景上残留浅文字看不清。 */
.settings-panel :deep(.n-radio__label),
.settings-panel :deep(.n-input-number .n-input__input-el),
.settings-panel :deep(.n-input .n-input__input-el) {
  color: inherit;
}

.settings-panel__header,
.settings-panel__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(128, 117, 105, 0.07);
  border-color: rgba(128, 117, 105, 0.22);
}

:global(.dark) .settings-panel__header,
:global(.dark) .settings-panel__footer,
.settings-shell:not(.settings-shell--embedded) .settings-panel__header,
.settings-shell:not(.settings-shell--embedded) .settings-panel__footer {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
}

.settings-panel__header {
  min-width: 0;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(128, 117, 105, 0.22);
}

:global(.dark) .settings-panel__header,
.settings-shell:not(.settings-shell--embedded) .settings-panel__header {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.settings-close-btn {
  width: 32px;
  height: 32px;
  display: inline-grid;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background 120ms,
    color 120ms;
}

.settings-close-btn:hover {
  background: rgba(128, 117, 105, 0.12);
  color: var(--app-fg);
}

.settings-close-btn svg {
  width: 18px;
  height: 18px;
}

.settings-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.settings-brand__mark {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: #a85f32;
  color: white;
  font-weight: 700;
}

.settings-brand__copy {
  min-width: 0;
}

.settings-brand h1,
.settings-brand p,
.settings-section__intro h2,
.settings-section__intro p {
  margin: 0;
}

.settings-brand h1 {
  font-size: 15px;
  font-weight: 650;
}

.settings-brand p {
  margin-top: 2px;
  font-size: 11px;
  color: #7b7067;
}

:global(.dark) .settings-brand p,
.settings-shell:not(.settings-shell--embedded) .settings-brand p {
  color: #afa59b;
}

.settings-panel__body-wrap {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.settings-sidebar {
  width: 160px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 10px;
  border-right: 1px solid rgba(128, 117, 105, 0.16);
  overflow-y: auto;
  scrollbar-width: none;
}

.settings-sidebar::-webkit-scrollbar {
  display: none;
}

:global(.dark) .settings-sidebar,
.settings-shell:not(.settings-shell--embedded) .settings-sidebar {
  border-right-color: rgba(255, 255, 255, 0.06);
}

.settings-tab {
  width: 100%;
  border: 0;
  border-radius: 8px;
  padding: 8px 10px;
  background: transparent;
  color: #695f57;
  cursor: pointer;
  text-align: left;
  transition:
    background 0.16s ease,
    color 0.16s ease;
}

.settings-tab:hover,
.settings-tab--active {
  background: rgba(168, 95, 50, 0.12);
  color: #27231f;
}

:global(.dark) .settings-tab,
.settings-shell:not(.settings-shell--embedded) .settings-tab {
  color: #c3b8ae;
}

:global(.dark) .settings-tab:hover,
:global(.dark) .settings-tab--active,
.settings-shell:not(.settings-shell--embedded) .settings-tab:hover,
.settings-shell:not(.settings-shell--embedded) .settings-tab--active {
  color: #f8f1e9;
}

.settings-tab span {
  display: block;
  font-size: 13px;
  font-weight: 650;
}

.settings-panel__body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 22px 28px 28px;
}

.settings-section {
  max-width: 760px;
}

.settings-section__intro {
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(128, 117, 105, 0.22);
}

:global(.dark) .settings-section__intro,
.settings-shell:not(.settings-shell--embedded) .settings-section__intro {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.settings-section__intro h2 {
  font-size: 18px;
  font-weight: 650;
}

.settings-section__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.settings-group {
  margin: 22px 0 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed rgba(128, 117, 105, 0.24);
  color: #8a5a38;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

:global(.dark) .settings-group,
.settings-shell:not(.settings-shell--embedded) .settings-group {
  color: var(--app-accent);
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.settings-group:first-of-type {
  margin-top: 0;
}

.settings-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  padding: 12px 0;
}

.settings-row + .settings-row {
  border-top: 1px solid rgba(128, 117, 105, 0.16);
}

:global(.dark) .settings-row + .settings-row,
.settings-shell:not(.settings-shell--embedded) .settings-row + .settings-row {
  border-top-color: rgba(255, 255, 255, 0.06);
}

.settings-row--disabled {
  opacity: 0.68;
}

.settings-row__meta {
  min-width: 0;
}

.settings-row__meta strong {
  font-size: 13.5px;
  font-weight: 650;
}

.settings-info-icon {
  width: 14px;
  height: 14px;
  margin-left: 6px;
  vertical-align: middle;
  color: #9a8e85;
  cursor: help;
  transition: color 0.16s ease;
}

.settings-info-icon:hover {
  color: #6f655d;
}

:global(.dark) .settings-info-icon,
.settings-shell:not(.settings-shell--embedded) .settings-info-icon {
  color: #8a7e74;
}

:global(.dark) .settings-info-icon:hover,
.settings-shell:not(.settings-shell--embedded) .settings-info-icon:hover {
  color: #b8aea4;
}

.settings-control {
  width: 220px;
}

.settings-shortcut-capture {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border: 1px solid var(--settings-control-border);
  border-radius: 6px;
  background: var(--settings-control-bg);
  color: var(--settings-control-fg);
  font: inherit;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.settings-shortcut-capture:hover {
  border-color: var(--settings-control-border-hover);
}

.settings-shortcut-capture:focus-visible {
  border-color: var(--settings-control-border-focus);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--settings-control-border-focus) 24%, transparent);
  outline: none;
}

.settings-shortcut-capture:disabled {
  background: var(--settings-control-bg-disabled);
  color: var(--settings-control-muted);
  cursor: not-allowed;
}

.shortcut-dialog-backdrop {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(20, 17, 14, 0.36);
  outline: none;
}

.shortcut-dialog {
  width: min(360px, 100%);
  display: grid;
  gap: 10px;
  padding: 18px;
  border: 1px solid rgba(128, 117, 105, 0.26);
  border-radius: 10px;
  background: #fbfaf8;
  color: #27231f;
  box-shadow: 0 18px 48px rgba(20, 17, 14, 0.22);
}

:global(.dark) .shortcut-dialog,
.settings-shell:not(.settings-shell--embedded) .shortcut-dialog {
  border-color: var(--app-border);
  background: var(--app-surface);
  color: var(--app-fg);
}

.shortcut-dialog h2,
.shortcut-dialog p {
  margin: 0;
}

.shortcut-dialog h2 {
  font-size: 16px;
  font-weight: 650;
}

.shortcut-dialog p,
.shortcut-dialog small {
  color: #756b63;
  font-size: 12px;
  line-height: 1.5;
}

:global(.dark) .shortcut-dialog p,
:global(.dark) .shortcut-dialog small,
.settings-shell:not(.settings-shell--embedded) .shortcut-dialog p,
.settings-shell:not(.settings-shell--embedded) .shortcut-dialog small {
  color: #b6aca2;
}

.shortcut-dialog__preview {
  min-height: 44px;
  display: grid;
  place-items: center;
  border: 1px dashed var(--settings-control-border);
  border-radius: 8px;
  background: rgba(128, 117, 105, 0.08);
  font-size: 18px;
  font-weight: 650;
}

.shortcut-dialog__actions {
  display: flex;
  justify-content: flex-end;
}

.shortcut-dialog__cancel {
  min-width: 64px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--settings-control-border);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.shortcut-dialog__cancel:hover {
  border-color: var(--settings-control-border-hover);
  color: var(--settings-control-border-hover);
}

.settings-swatches {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-swatches span {
  width: 24px;
  height: 24px;
  border: 1px solid rgba(128, 117, 105, 0.28);
  border-radius: 6px;
  background: var(--swatch);
}

:global(.dark) .settings-swatches span,
.settings-shell:not(.settings-shell--embedded) .settings-swatches span {
  border-color: rgba(255, 255, 255, 0.15);
}

.reminder-options {
  display: grid;
  gap: 10px;
}

.reminder-option-row {
  display: grid;
  grid-template-columns: minmax(132px, 1fr) auto 82px 112px auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid rgba(128, 117, 105, 0.2);
  border-radius: 8px;
  background: rgba(128, 117, 105, 0.06);
}

.reminder-option-label {
  min-width: 0;
}

.reminder-option-number,
.reminder-option-time {
  width: 82px;
}

.reminder-option-unit {
  width: 112px;
}

:global(.dark) .reminder-option-row,
.settings-shell:not(.settings-shell--embedded) .reminder-option-row {
  border-color: var(--app-border);
  background: var(--app-surface);
}

.settings-paths {
  display: grid;
  gap: 8px;
}

.settings-path-row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid rgba(128, 117, 105, 0.2);
  border-radius: 8px;
  background: rgba(128, 117, 105, 0.07);
}

:global(.dark) .settings-path-row,
.settings-shell:not(.settings-shell--embedded) .settings-path-row {
  border-color: var(--app-border);
  background: var(--app-surface);
}

.settings-path-label {
  color: #6f655d;
  font-size: 12px;
}

.settings-path-value {
  min-width: 0;
  overflow: hidden;
  color: inherit;
  font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-about-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.settings-about-card {
  display: grid;
  gap: 4px;
  padding: 14px;
  border: 1px solid rgba(128, 117, 105, 0.2);
  border-radius: 8px;
  background: rgba(128, 117, 105, 0.07);
}

:global(.dark) .settings-about-card,
.settings-shell:not(.settings-shell--embedded) .settings-about-card {
  border-color: var(--app-border);
  background: var(--app-surface);
}

.settings-about-card span,
.settings-about-card small {
  color: #756b63;
  font-size: 11px;
}

.settings-about-card strong {
  font-size: 15px;
}

.settings-panel__footer {
  padding: 0 18px;
  border-top: 1px solid rgba(128, 117, 105, 0.22);
}

:global(.dark) .settings-panel__footer,
.settings-shell:not(.settings-shell--embedded) .settings-panel__footer {
  border-top-color: rgba(255, 255, 255, 0.08);
}

.settings-save-hint {
  flex: 1;
  color: #756b63;
  font-size: 12px;
}

:global(.dark) .settings-save-hint,
:global(.dark) .settings-path-label,
:global(.dark) .settings-about-card span,
:global(.dark) .settings-about-card small,
.settings-shell:not(.settings-shell--embedded) .settings-save-hint,
.settings-shell:not(.settings-shell--embedded) .settings-path-label,
.settings-shell:not(.settings-shell--embedded) .settings-about-card span,
.settings-shell:not(.settings-shell--embedded) .settings-about-card small {
  color: #b6aca2;
}

@media (max-width: 800px) {
  .settings-panel {
    width: calc(100vw - 20px);
    height: calc(100vh - 20px);
    grid-template-rows: auto 1fr auto;
  }

  .settings-panel__header {
    flex-wrap: wrap;
    padding: 12px;
  }

  .settings-brand {
    width: calc(100% - 44px);
    border-right: 0;
  }

  .settings-row,
  .settings-path-row,
  .reminder-option-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .settings-control,
  .reminder-option-number,
  .reminder-option-time,
  .reminder-option-unit {
    width: 100%;
  }

  .settings-about-grid {
    grid-template-columns: 1fr;
  }
}

/* ===== 设置面板 naive-ui 控件对比度强化 =====
   设置页会在独立窗口、主窗口内嵌弹层以及亮/暗主题间切换。这里给面板内
   input/select/number/button 明确文字、边框和占位符颜色，避免继承到低对比度主题值。 */
.settings-panel :deep(.n-input),
.settings-panel :deep(.n-base-selection) {
  --n-color: var(--settings-control-bg);
  --n-color-focus: var(--settings-control-bg-focus);
  --n-color-active: var(--settings-control-bg-focus);
  --n-color-disabled: var(--settings-control-bg-disabled);
  --n-text-color: var(--settings-control-fg);
  --n-text-color-disabled: var(--settings-control-muted);
  --n-placeholder-color: var(--settings-control-placeholder);
  --n-placeholder-color-disabled: var(--settings-control-placeholder);
  --n-caret-color: var(--settings-control-border-focus);
  --n-border: 1px solid var(--settings-control-border);
  --n-border-hover: 1px solid var(--settings-control-border-hover);
  --n-border-active: 1px solid var(--settings-control-border-focus);
  --n-border-focus: 1px solid var(--settings-control-border-focus);
  --n-border-disabled: 1px solid var(--settings-control-border);
  --n-box-shadow-focus: 0 0 0 2px color-mix(in oklch, var(--settings-control-border-focus) 24%, transparent);
}

/* 输入框边框常显：强制 Naive UI 的 border 渲染层始终可见 */
.settings-panel :deep(.n-input .n-input__border),
.settings-panel :deep(.n-input .n-input__state-border),
.settings-panel :deep(.n-base-selection .n-base-selection__border),
.settings-panel :deep(.n-base-selection .n-base-selection__state-border) {
  border-color: var(--settings-control-border) !important;
}

.settings-panel :deep(.n-input:hover .n-input__border),
.settings-panel :deep(.n-input:hover .n-input__state-border),
.settings-panel :deep(.n-base-selection:hover .n-base-selection__border),
.settings-panel :deep(.n-base-selection:hover .n-base-selection__state-border) {
  border-color: var(--settings-control-border-hover) !important;
}

.settings-panel :deep(.n-input:focus-within .n-input__border),
.settings-panel :deep(.n-input:focus-within .n-input__state-border),
.settings-panel :deep(.n-base-selection:focus-within .n-base-selection__border),
.settings-panel :deep(.n-base-selection:focus-within .n-base-selection__state-border) {
  border-color: var(--settings-control-border-focus) !important;
}

/* 选择器箭头：提高对比度 */
.settings-panel :deep(.n-base-selection) {
  --n-arrow-color: var(--settings-control-fg);
  --n-placeholder-color: var(--settings-control-placeholder);
}

.settings-panel :deep(.n-base-selection .n-base-suffix) {
  color: var(--settings-control-fg);
}

.settings-panel :deep(.n-input__input-el),
.settings-panel :deep(.n-input__textarea-el),
.settings-panel :deep(.n-base-selection-label),
.settings-panel :deep(.n-base-selection-input),
.settings-panel :deep(.n-base-selection-input__content),
.settings-panel :deep(.n-input-number .n-input__input-el),
.settings-panel :deep(.n-input-number-suffix),
.settings-panel :deep(.n-input-number-button) {
  color: var(--settings-control-fg);
}

/* 数字输入框 +/- 按钮对比度强化 */
.settings-panel :deep(.n-input-number) {
  --n-button-color: var(--settings-control-bg);
  --n-button-icon-color: var(--settings-control-muted);
  --n-button-icon-color-hover: var(--settings-control-fg);
}

.settings-panel :deep(.n-input-number .n-input-number-suffix) {
  color: var(--settings-control-fg);
}

/* 数字输入框边框常显 */
.settings-panel :deep(.n-input-number .n-input__border),
.settings-panel :deep(.n-input-number .n-input__state-border) {
  border-color: var(--settings-control-border) !important;
}

.settings-panel :deep(.n-input-number:hover .n-input__border),
.settings-panel :deep(.n-input-number:hover .n-input__state-border) {
  border-color: var(--settings-control-border-hover) !important;
}

.settings-panel :deep(.n-input__placeholder),
.settings-panel :deep(.n-base-selection-placeholder) {
  color: var(--settings-control-placeholder);
}

.settings-panel :deep(.n-button) {
  --n-text-color: var(--settings-control-fg);
  --n-text-color-hover: var(--settings-control-border-hover);
  --n-text-color-pressed: var(--settings-control-border-hover);
  --n-text-color-focus: var(--settings-control-fg);
  --n-text-color-disabled: var(--settings-control-muted);
  --n-border: 1px solid var(--settings-control-border);
  --n-border-hover: 1px solid var(--settings-control-border-hover);
  --n-border-focus: 1px solid var(--settings-control-border-focus);
  --n-border-disabled: 1px dashed var(--settings-control-border);
  --n-color-disabled: transparent;
}

.settings-panel :deep(.n-switch) {
  --n-rail-color: var(--settings-control-border);
  --n-rail-color-disabled: var(--settings-control-bg-disabled);
  --n-button-color: var(--settings-control-fg);
  --n-button-color-disabled: var(--settings-control-muted);
  --n-loading-color: var(--settings-control-border-focus);
}
</style>
