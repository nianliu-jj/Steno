# 速记板主题同步与标题编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`（推荐）or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让速记板共享项目当前浅色/深色主题，标题改为显式编辑/保存，底部展示字数、行数与保存状态，并保证独立速记板窗口在主题切换后立即同步。

**Architecture:** 主题语义统一收敛到 `src/theme/index.ts`，由 `src/App.vue` 通过根级 CSS 变量分发到所有窗口；`src/views/SettingsView.vue` 在主题模式写库成功后广播 `steno:theme-mode-changed`。`src/components/StickyNote.vue` 改成“已保存标题 + 编辑草稿标题”的双状态模型，正文 autosave 只依赖已保存标题，标题保存前先 flush 正文 autosave，避免旧 payload 回写旧标题。

**Tech Stack:** Vue 3、Pinia、Naive UI、Vitest、Tauri 2 Event API。

---

## 文件结构

- 修改 `src/theme/index.ts`：定义应用级主题 token、CSS 变量映射、主题同步事件常量。
- 修改 `src/App.vue`：注入根级主题变量，监听主题同步事件，向所有窗口提供统一 `.app-shell` 容器。
- 修改 `src/App.test.ts`：先补失败测试，覆盖根级主题变量注入和主题事件同步。
- 修改 `src/views/SettingsView.vue`：主题模式保存成功后广播 `steno:theme-mode-changed`。
- 修改 `src/views/SettingsView.test.ts`：先补失败测试，覆盖主题模式更新后的广播。
- 修改 `src/components/MainWorkbenchShell.vue`：消费应用级主题变量，不再在组件内声明孤立主题值。
- 修改 `src/components/StickyNote.vue`：移除独立颜色/亮度控制，实现标题显式编辑/保存、底部状态栏和共享主题样式。
- 修改 `src/components/StickyNote.test.ts`：先补失败测试，覆盖标题编辑、失焦取消、显式保存、状态栏和共享主题约束。

## Task 1: 实现跨窗口主题同步与共享主题变量

**Files:**
- Modify: `src/App.test.ts`
- Modify: `src/views/SettingsView.test.ts`
- Modify: `src/theme/index.ts`
- Modify: `src/App.vue`
- Modify: `src/views/SettingsView.vue`
- Modify: `src/components/MainWorkbenchShell.vue`

- [ ] **Step 1: 在 `src/App.test.ts` 写失败测试，锁定根级主题变量和主题事件同步**

在文件顶部把 `useDark` mock 改成共享 `ref`，并增加 Tauri 事件 mock：

```ts
import { nextTick, reactive, ref, type PropType } from 'vue';

const darkRef = ref(false);
const eventListeners = new Map<string, (event: { payload: { mode: string } }) => void>();

vi.mock('@vueuse/core', () => ({
  useDark: () => darkRef,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (eventName: string, handler: (event: { payload: { mode: string } }) => void) => {
    eventListeners.set(eventName, handler);
    return () => eventListeners.delete(eventName);
  }),
}));

async function emitThemeMode(eventName: string, mode: string) {
  eventListeners.get(eventName)?.({ payload: { mode } });
  await nextTick();
}
```

在 `describe('App', ...)` 里新增测试：

```ts
it('provides shared theme css variables and reacts to theme-mode events', async () => {
  const wrapper = mount(App);
  await Promise.resolve();

  const shell = wrapper.get('[data-testid="app-shell"]');
  expect(shell.attributes('style')).toContain('--app-bg:');
  expect(shell.attributes('style')).toContain('--app-accent:');
  expect(shell.classes()).not.toContain('dark');

  await emitThemeMode('steno:theme-mode-changed', 'dark');

  expect(settingsState.themeMode).toBe('dark');
  expect(shell.classes()).toContain('dark');
});
```

- [ ] **Step 2: 在 `src/views/SettingsView.test.ts` 写失败测试，锁定主题保存后的广播**

在文件顶部增加事件发送 mock：

```ts
const emitThemeEvent = vi.fn(() => Promise.resolve());

vi.mock('@tauri-apps/api/event', () => ({
  emit: emitThemeEvent,
}));
```

在 `describe('SettingsView', ...)` 里新增测试：

```ts
it('broadcasts theme-mode changes after persistence succeeds', async () => {
  const wrapper = mountSettingsView();
  await flushPromises();

  await wrapper.get('[data-testid="settings-tab-appearance"]').trigger('click');
  wrapper.findComponent({ name: 'NRadioGroup' }).vm.$emit('update:value', 'dark');
  await flushPromises();

  expect(updateSetting).toHaveBeenCalledWith('themeMode', 'dark');
  expect(emitThemeEvent).toHaveBeenCalledWith('steno:theme-mode-changed', { mode: 'dark' });
});
```

- [ ] **Step 3: 运行主题同步测试，确认红灯**

Run:

```bash
pnpm vitest run src/App.test.ts src/views/SettingsView.test.ts
```

Expected: FAIL，原因应包括：

- `App.vue` 还没有 `data-testid="app-shell"` 根容器，也没有主题事件监听。
- `SettingsView.vue` 还没有在主题保存后调用 `emit('steno:theme-mode-changed', ...)`。

- [ ] **Step 4: 在 `src/theme/index.ts` 定义共享主题 token 和事件常量**

将文件替换为：

```ts
export const THEME_MODE_CHANGED_EVENT = 'steno:theme-mode-changed';

export interface AppThemeTokens {
  bg: string;
  surface: string;
  surface2: string;
  fg: string;
  muted: string;
  faint: string;
  border: string;
  accent: string;
  accentSoft: string;
}

const lightTokens: AppThemeTokens = {
  bg: 'oklch(97% 0.014 78)',
  surface: 'oklch(99% 0.006 78)',
  surface2: 'oklch(98% 0.008 78)',
  fg: 'oklch(20% 0.02 70)',
  muted: 'oklch(49% 0.018 70)',
  faint: 'oklch(70% 0.014 70)',
  border: 'oklch(88% 0.012 78)',
  accent: 'oklch(61% 0.13 42)',
  accentSoft: 'oklch(94% 0.034 42)',
};

const darkTokens: AppThemeTokens = {
  bg: 'oklch(24% 0.012 70)',
  surface: 'oklch(28% 0.012 70)',
  surface2: 'oklch(31% 0.012 70)',
  fg: 'oklch(94% 0.01 70)',
  muted: 'oklch(76% 0.012 70)',
  faint: 'oklch(58% 0.01 70)',
  border: 'oklch(38% 0.012 70)',
  accent: 'oklch(72% 0.11 42)',
  accentSoft: 'oklch(36% 0.04 42)',
};

export function getAppThemeTokens(isDark: boolean): AppThemeTokens {
  return isDark ? darkTokens : lightTokens;
}

export function toAppThemeVars(tokens: AppThemeTokens): Record<string, string> {
  return {
    '--app-bg': tokens.bg,
    '--app-surface': tokens.surface,
    '--app-surface-2': tokens.surface2,
    '--app-fg': tokens.fg,
    '--app-muted': tokens.muted,
    '--app-faint': tokens.faint,
    '--app-border': tokens.border,
    '--app-accent': tokens.accent,
    '--app-accent-soft': tokens.accentSoft,
  };
}

export const themeVars = {
  colors: {
    primary: lightTokens.accent,
    primaryHover: '#8f4f29',
    primaryPressed: '#7b4523',
    primarySuppl: lightTokens.accentSoft,
  },
};
```

- [ ] **Step 5: 在 `src/App.vue` 注入根级主题变量并监听主题同步事件**

把 `App.vue` 的脚本和模板按下面方式改：

```ts
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { listen } from '@tauri-apps/api/event';
import { NConfigProvider, NMessageProvider, NModal, darkTheme } from 'naive-ui';
import { useDark } from '@vueuse/core';

import { THEME_MODE_CHANGED_EVENT, getAppThemeTokens, toAppThemeVars } from '@/theme';
import { useUiStore } from '@/stores/ui';
import { useSettingsStore, type ThemeMode } from '@/stores/settings';

const appThemeStyle = computed(() => toAppThemeVars(getAppThemeTokens(isDark.value)));

let stopThemeSync: (() => void) | null = null;

onMounted(() => {
  void settings.load();
  void listen<{ mode: ThemeMode }>(THEME_MODE_CHANGED_EVENT, ({ payload }) => {
    if (!payload) return;
    settings.state.themeMode = payload.mode;
  }).then(unlisten => {
    stopThemeSync = unlisten;
  }).catch(() => {
    stopThemeSync = null;
  });
});

onBeforeUnmount(() => {
  stopThemeSync?.();
  stopThemeSync = null;
});
```

模板用根级容器包住现有内容：

```vue
<template>
  <div class="app-shell" data-testid="app-shell" :class="{ dark: isDark }" :style="appThemeStyle">
    <NConfigProvider :theme="naiveTheme">
      <NMessageProvider>
        <!-- 保留现有视图切换结构 -->
      </NMessageProvider>
    </NConfigProvider>
  </div>
</template>
```

- [ ] **Step 6: 在 `src/views/SettingsView.vue` 广播主题模式变化**

增加导入并修改 `onThemeChange`：

```ts
import { emit as emitEvent } from '@tauri-apps/api/event';

import { THEME_MODE_CHANGED_EVENT } from '@/theme';
import { useSettingsStore, type EditorMode, type ThemeMode } from '@/stores/settings';

async function onThemeChange(value: ThemeMode) {
  try {
    await settings.update('themeMode', value);
    await emitEvent(THEME_MODE_CHANGED_EVENT, { mode: value });
  } catch (e) {
    message.error(`主题保存失败：${String(e)}`);
  }
}
```

- [ ] **Step 7: 在 `src/components/MainWorkbenchShell.vue` 改为消费应用级主题变量**

把组件顶部的局部变量声明改成读取应用级 CSS 变量：

```css
.workbench-root {
  --bg: var(--app-bg);
  --surface: var(--app-surface);
  --surface-2: var(--app-surface-2);
  --fg: var(--app-fg);
  --muted: var(--app-muted);
  --faint: var(--app-faint);
  --border: var(--app-border);
  --accent: var(--app-accent);
  --accent-soft: var(--app-accent-soft);
  --rail-w: 220px;
  --rail-w-collapsed: 58px;
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--bg);
  color: var(--fg);
}
```

不要再保留原先写死的 `oklch(...)` 主题值。

- [ ] **Step 8: 重新运行主题同步测试，确认绿灯**

Run:

```bash
pnpm vitest run src/App.test.ts src/views/SettingsView.test.ts
```

Expected: PASS。

- [ ] **Step 9: 提交主题同步实现**

Run:

```bash
git add src/theme/index.ts src/App.vue src/App.test.ts src/views/SettingsView.vue src/views/SettingsView.test.ts src/components/MainWorkbenchShell.vue
git commit -m "feat: sync theme across app windows"
```

Expected: commit succeeds with only the files above staged for this task.

## Task 2: 实现速记板标题显式编辑、共享主题样式和底部状态栏

**Files:**
- Modify: `src/components/StickyNote.test.ts`
- Modify: `src/components/StickyNote.vue`

- [ ] **Step 1: 在 `src/components/StickyNote.test.ts` 写失败测试，锁定新交互和共享主题约束**

先补齐 imports、mock 和新测试。把文件顶部补成这样：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import StickyNote from './StickyNote.vue';
import StickyNoteSource from './StickyNote.vue?raw';
import type { Note } from '@/types/steno';

const autosaveStatus = ref<'idle' | 'scheduled' | 'saving' | 'saved' | 'error'>('idle');
const autosaveSavedAt = ref<Date | null>(null);
const flushAutosave = vi.fn(() => Promise.resolve());

vi.mock('@/composables/useAutosave', () => ({
  useAutosave: (saver: (payload: unknown) => Promise<unknown>) => ({
    status: autosaveStatus,
    savedAt: autosaveSavedAt,
    error: { value: null },
    scheduleSave: (payload: unknown) => void saver(payload),
    flushSave: flushAutosave,
  }),
}));

vi.mock('@/composables/useMarkdown', () => ({
  useMarkdown: () => ({
    renderHtml: (value: string) => `<p>${value}</p>`,
    countWords: () => 11,
  }),
}));
```

新增三条测试：

```ts
it('enters title edit mode only from the edit button and restores the saved title on blur', async () => {
  const wrapper = mount(WrappedStickyNote);
  await flushPromises();

  expect(wrapper.get('[data-testid="sticky-title-text"]').text()).toBe('置顶便签');
  expect(wrapper.find('[data-testid="sticky-title-input"] input').exists()).toBe(false);

  await wrapper.get('[data-testid="sticky-title-edit"]').trigger('click');
  const input = wrapper.get('[data-testid="sticky-title-input"] input');
  await input.setValue('临时标题');
  await input.trigger('blur');

  expect(saveDraft).not.toHaveBeenCalledWith(expect.objectContaining({ title: '临时标题' }));
  expect(wrapper.get('[data-testid="sticky-title-text"]').text()).toBe('置顶便签');
});

it('saves title changes explicitly and shows footer stats on the right side', async () => {
  autosaveStatus.value = 'saved';
  autosaveSavedAt.value = new Date('2026-05-16T10:00:00.000Z');

  const wrapper = mount(WrappedStickyNote);
  await flushPromises();

  await wrapper.get('[data-testid="sticky-title-edit"]').trigger('click');
  await wrapper.get('[data-testid="sticky-title-input"] input').setValue('新的置顶标题');
  await wrapper.get('[data-testid="sticky-title-save"]').trigger('click');

  expect(flushAutosave).toHaveBeenCalled();
  expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
    id: 'sticky-note-1',
    title: '新的置顶标题',
  }));
  expect(wrapper.get('[data-testid="sticky-status-bar"]').text()).toContain('11 字');
  expect(wrapper.get('[data-testid="sticky-status-bar"]').text()).toContain('1 行');
  expect(wrapper.get('[data-testid="sticky-status-bar"]').text()).toContain('已保存');
});

it('uses app theme tokens and removes per-note color and opacity controls', async () => {
  const wrapper = mount(WrappedStickyNote);
  await flushPromises();

  expect(wrapper.find('.sticky-color-picker').exists()).toBe(false);
  expect(wrapper.find('.sticky-opacity').exists()).toBe(false);
  expect(StickyNoteSource).toContain('var(--app-surface)');
  expect(StickyNoteSource).toContain('var(--app-fg)');
  expect(StickyNoteSource).not.toContain('NColorPicker');
  expect(StickyNoteSource).not.toContain('NSlider');
});
```

- [ ] **Step 2: 运行速记板测试，确认红灯**

Run:

```bash
pnpm vitest run src/components/StickyNote.test.ts
```

Expected: FAIL，原因应包括：

- 当前标题仍是常驻输入框，没有只读文本和编辑/保存按钮。
- 当前底部仍然渲染颜色选择器和亮度滑块。
- 当前组件源码还没有使用 `var(--app-surface)` / `var(--app-fg)`。

- [ ] **Step 3: 在 `src/components/StickyNote.vue` 重构脚本状态，分离已保存标题和编辑草稿**

把 script setup 的标题、统计和状态逻辑改成：

```ts
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { NButton, NIcon, NInput, NPopselect } from 'naive-ui';

const { renderHtml, countWords } = useMarkdown();

const savedTitle = ref('');
const titleDraft = ref('');
const titleEditing = ref(false);
const titleInputRef = ref<{ focus: () => void } | null>(null);
const titleSaveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');

const wordCount = computed(() => countWords(content.value));
const lineCount = computed(() => Math.max(1, content.value.split(/\r?\n/).length));
const displayTitle = computed(() => savedTitle.value.trim() || '无标题');

function hydrateFromNote(note: Note) {
  savedTitle.value = note.title;
  titleDraft.value = note.title;
  content.value = note.content;
  tags.value = [...note.tags];
  config.value = { ...DEFAULT_CONFIG, ...note.pinnedWindowConfig };
}

watch([savedTitle, content], () => {
  if (!loaded.value) return;
  contentSave.scheduleSave({
    id: props.noteId,
    title: savedTitle.value || undefined,
    content: content.value,
    tags: tags.value,
    isPinned: true,
    pinnedWindowConfig: config.value,
  });
});

async function onStartTitleEdit() {
  titleDraft.value = savedTitle.value;
  titleEditing.value = true;
  await nextTick();
  titleInputRef.value?.focus();
}

function onCancelTitleEdit() {
  titleDraft.value = savedTitle.value;
  titleEditing.value = false;
  titleSaveStatus.value = 'idle';
}

async function onSaveTitle() {
  const nextTitle = titleDraft.value.trim();
  titleSaveStatus.value = 'saving';
  try {
    await contentSave.flushSave();
    await notes.saveDraft({
      id: props.noteId,
      title: nextTitle || undefined,
      content: content.value,
      tags: tags.value,
      isPinned: true,
      pinnedWindowConfig: config.value,
    });
    savedTitle.value = nextTitle;
    titleDraft.value = nextTitle;
    titleEditing.value = false;
    titleSaveStatus.value = 'saved';
  } catch (e) {
    console.error('[sticky] save title failed:', e);
    titleSaveStatus.value = 'error';
  }
}

const statusText = computed(() => {
  if (titleEditing.value) return '编辑中';
  if (titleSaveStatus.value === 'saving' || contentSave.status.value === 'saving') return '保存中';
  if (titleSaveStatus.value === 'error' || contentSave.status.value === 'error') return '保存失败';
  if (titleSaveStatus.value === 'saved' || contentSave.status.value === 'saved') return '已保存';
  if (contentSave.status.value === 'scheduled') return '编辑中';
  return '未修改';
});

const rootStyle = computed(() => ({
  '--sticky-font-size': `${config.value.fontSize}px`,
}));
```

这一步不要再保留 `title` 作为唯一标题源，也不要再保留 `NColorPicker` / `NSlider` imports。

- [ ] **Step 4: 在 `src/components/StickyNote.vue` 改写头部标题区和底部模板**

用下面的模板片段替换当前标题区与底部内容：

```vue
<header class="sticky-header" @pointerdown="onHeaderPointerdown">
  <div class="sticky-title-wrap" @pointerdown.stop>
    <NInput
      v-if="titleEditing"
      ref="titleInputRef"
      v-model:value="titleDraft"
      size="tiny"
      placeholder="无标题"
      :bordered="false"
      data-testid="sticky-title-input"
      class="sticky-title-input"
      @blur="onCancelTitleEdit"
      @keydown.enter.prevent="onSaveTitle"
      @keydown.esc.prevent="onCancelTitleEdit"
    />
    <span
      v-else
      data-testid="sticky-title-text"
      class="sticky-title-text"
    >
      {{ displayTitle }}
    </span>
    <NButton
      quaternary
      circle
      size="tiny"
      :data-testid="titleEditing ? 'sticky-title-save' : 'sticky-title-edit'"
      :title="titleEditing ? '保存标题' : '编辑标题'"
      class="sticky-title-action"
      @pointerdown.prevent
      @click="titleEditing ? onSaveTitle() : onStartTitleEdit()"
    >
      <template #icon>
        <NIcon>
          <svg v-if="titleEditing" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m5 12 5 5L20 7" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
        </NIcon>
      </template>
    </NButton>
  </div>
  <div class="sticky-actions">
    <!-- 保留取消置顶和隐藏按钮 -->
  </div>
</header>

<footer class="sticky-footer" @pointerdown.stop>
  <div class="sticky-styler">
    <NPopselect
      v-model:value="config.fontSize"
      :options="FONT_OPTIONS"
      size="small"
      trigger="click"
    >
      <button class="sticky-styler-btn" title="字号">A</button>
    </NPopselect>
  </div>
  <div class="sticky-status" data-testid="sticky-status-bar">
    <span>{{ wordCount }} 字</span>
    <span>{{ lineCount }} 行</span>
    <span>{{ statusText }}</span>
  </div>
</footer>
```

注意：保存按钮必须保留 `@pointerdown.prevent`，否则 input 会先 blur 再触发 click，导致“点击保存时先走取消逻辑”。

- [ ] **Step 5: 在 `src/components/StickyNote.vue` 更新样式，切换到共享主题 token**

把样式改成下面的方向，重点是移除整窗透明度和独立颜色控制：

```css
.sticky-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--app-surface);
  color: var(--app-fg);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 10px 28px color-mix(in oklch, var(--app-fg) 18%, transparent);
}

.sticky-header,
.sticky-footer {
  border-color: color-mix(in oklch, var(--app-border) 85%, transparent);
}

.sticky-title-wrap,
.sticky-actions,
.sticky-styler-btn,
.sticky-title-action {
  color: var(--app-muted);
}

.sticky-title-text,
.sticky-preview {
  color: var(--app-fg);
}

.sticky-status {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  color: var(--app-muted);
  font-size: 11px;
  white-space: nowrap;
}

.sticky-content--editing {
  background: color-mix(in oklch, var(--app-surface-2) 78%, transparent);
}

.sticky-preview :deep(code),
.sticky-preview :deep(pre) {
  background: color-mix(in oklch, var(--app-border) 55%, transparent);
}
```

同时删除：

- `.sticky-color-picker` 样式块
- `.sticky-opacity` 样式块
- `opacity: var(--sticky-opacity);`
- 一切 `var(--sticky-bg)` / `config.color` / `config.opacity` 的视觉绑定

- [ ] **Step 6: 重新运行速记板测试，确认绿灯**

Run:

```bash
pnpm vitest run src/components/StickyNote.test.ts
```

Expected: PASS。

- [ ] **Step 7: 提交速记板实现**

Run:

```bash
git add src/components/StickyNote.vue src/components/StickyNote.test.ts
git commit -m "feat: refresh sticky note title flow and status bar"
```

Expected: commit succeeds with only the files above staged for this task.

## Task 3: 全量验证与收尾检查

**Files:**
- Verify only

- [ ] **Step 1: 运行本次相关单测**

Run:

```bash
pnpm vitest run src/App.test.ts src/views/SettingsView.test.ts src/components/StickyNote.test.ts
```

Expected: PASS。

- [ ] **Step 2: 运行类型检查**

Run:

```bash
pnpm typecheck
```

Expected: PASS。

- [ ] **Step 3: 运行 lint**

Run:

```bash
pnpm lint
```

Expected: PASS。

- [ ] **Step 4: 检查工作区**

Run:

```bash
git status --short
```

Expected: 只剩进入本轮前已经存在的无关改动，或本次实现尚未提交的相关文件；不应出现意外新增文件。

## 计划自检

- 规格覆盖：
  - 头部图标对比度：Task 1 的共享主题变量 + Task 2 的共享主题样式覆盖。
  - 标题显式编辑/保存与失焦取消：Task 2 覆盖。
  - 与项目主题和亮度一致：Task 1 的应用级主题变量与主题事件同步覆盖。
  - 移除独立颜色/亮度控制：Task 2 覆盖。
  - 底部右侧显示字数、行数、保存状态：Task 2 覆盖。
  - 已打开速记板跟随主题变化：Task 1 覆盖。
- 占位项扫描：没有 `TODO`、`TBD`、`later`、`similar to` 一类占位描述。
- 类型一致性：
  - 统一使用 `THEME_MODE_CHANGED_EVENT` 作为主题同步事件名。
  - 统一使用 `savedTitle`、`titleDraft`、`titleEditing` 作为速记板标题状态命名。
  - 统一使用 `statusText` 作为底部状态展示字段。
