# Sticky Note Theme Title Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让速记板完全跟随项目主题，补齐标题显式编辑、跨窗口标题同步和底部状态栏，同时保持现有正文编辑与自动保存路径。

**Architecture:** 先抽出共享主题语义和轻量应用事件，再让 `App.vue`、`SettingsView.vue`、`MainView.vue` 和 `StickyNote.vue` 共同使用。标题保存继续复用现有 `useAutosave` 状态机，但把标题草稿与已提交标题拆开，避免正文 autosave 误保存未确认的标题输入。

**Tech Stack:** Vue 3、Pinia、Naive UI、Tauri 2 事件 API、Vitest、TypeScript

---

## 文件结构

- Create: `src/composables/useAppEvents.ts`
  - 统一封装 `steno:theme-mode-changed` 和 `steno:note-saved` 的 `emit / listen`。
- Modify: `src/theme/index.ts`
  - 提供主工作台和速记板共用的浅色 / 深色主题变量映射。
- Modify: `src/App.vue`
  - 将共享主题变量挂到窗口根节点，并监听主题模式广播事件。
- Modify: `src/App.test.ts`
  - 覆盖主题模式事件驱动的明暗切换。
- Modify: `src/views/SettingsView.vue`
  - 主题保存成功后广播 `steno:theme-mode-changed`。
- Modify: `src/views/SettingsView.test.ts`
  - 断言主题保存后会广播事件。
- Modify: `src/stores/notes.ts`
  - 增加跨窗口同步入口，例如 `syncExternalNote(note)`。
- Modify: `src/views/MainView.vue`
  - 监听 `steno:note-saved`，更新当前列表缓存。
- Modify: `src/views/MainView.test.ts`
  - 覆盖跨窗口标题同步到主列表。
- Modify: `src/components/StickyNote.vue`
  - 切换到共享主题变量，移除颜色 / 透明度控件，补标题显式编辑和底部状态栏。
- Modify: `src/components/StickyNote.test.ts`
  - 覆盖标题只读、编辑、失焦保存、`Escape` 取消、状态栏和旧控件移除。

## Task 1: 共享主题变量与应用事件

**Files:**
- Create: `src/composables/useAppEvents.ts`
- Modify: `src/theme/index.ts`
- Modify: `src/App.vue`
- Modify: `src/App.test.ts`
- Modify: `src/views/SettingsView.vue`
- Test: `src/App.test.ts`
- Test: `src/views/SettingsView.test.ts`

- [ ] **Step 1: 先写会失败的主题广播测试**

在 `src/App.test.ts` 里把 `useDark` 改成共享 `ref`，并加入主题事件监听 mock：

```ts
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref, type PropType } from 'vue';

const darkRef = ref(false);
const themeModeListeners: Array<(mode: 'light' | 'dark' | 'system') => void> = [];

vi.mock('@vueuse/core', () => ({
  useDark: () => darkRef,
}));

vi.mock('@/composables/useAppEvents', () => ({
  listenThemeModeChanged: vi.fn(async handler => {
    themeModeListeners.push(handler);
    return () => {
      const index = themeModeListeners.indexOf(handler);
      if (index >= 0) themeModeListeners.splice(index, 1);
    };
  }),
  emitThemeModeChanged: vi.fn(() => Promise.resolve()),
}));

it('updates dark mode when a theme event is received from another window', async () => {
  mount(App);

  expect(darkRef.value).toBe(false);

  themeModeListeners[0]?.('dark');
  await Promise.resolve();

  expect(darkRef.value).toBe(true);
});
```

在 `src/views/SettingsView.test.ts` 里先写主题保存后广播的失败测试：

```ts
import { emitThemeModeChanged } from '@/composables/useAppEvents';

vi.mock('@/composables/useAppEvents', () => ({
  emitThemeModeChanged: vi.fn(() => Promise.resolve()),
}));

it('broadcasts theme mode after saving the appearance setting', async () => {
  const wrapper = mountSettingsView();
  await flushPromises();

  await wrapper.get('[data-testid="settings-tab-appearance"]').trigger('click');
  await wrapper.get('input[value="dark"]').setValue(true);

  expect(updateSetting).toHaveBeenCalledWith('themeMode', 'dark');
  expect(emitThemeModeChanged).toHaveBeenCalledWith('dark');
});
```

- [ ] **Step 2: 运行测试，确认它们先失败**

Run:

```bash
pnpm vitest run src/App.test.ts src/views/SettingsView.test.ts
```

Expected:

```text
FAIL  src/App.test.ts
FAIL  src/views/SettingsView.test.ts
- Expected darkRef.value to be true
- Expected "spy" to have been called with: ["dark"]
```

- [ ] **Step 3: 写最小实现让测试转绿**

先创建 `src/composables/useAppEvents.ts`：

```ts
import { emit, listen } from '@tauri-apps/api/event';

import type { ThemeMode } from '@/stores/settings';
import type { Note } from '@/types/steno';

const THEME_MODE_CHANGED_EVENT = 'steno:theme-mode-changed';
const NOTE_SAVED_EVENT = 'steno:note-saved';

export async function emitThemeModeChanged(mode: ThemeMode) {
  try {
    await emit(THEME_MODE_CHANGED_EVENT, { mode });
  } catch {
    // 浏览器调试环境没有 Tauri 事件桥，不让 UI 因广播失败而报错
  }
}

export function listenThemeModeChanged(
  handler: (mode: ThemeMode) => void,
) {
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

export function listenNoteSaved(
  handler: (note: Note) => void,
) {
  return listen<Note>(NOTE_SAVED_EVENT, ({ payload }) => {
    handler(payload);
  });
}
```

把 `src/theme/index.ts` 改成共享主题变量导出：

```ts
export interface AppThemeVars {
  bg: string;
  surface: string;
  surface2: string;
  fg: string;
  muted: string;
  faint: string;
  border: string;
  accent: string;
  accentSoft: string;
  stickySurface: string;
  stickySurfaceAlt: string;
  stickyFg: string;
  stickyMuted: string;
  stickyBorder: string;
  stickyEditor: string;
  stickyCode: string;
  stickyQuote: string;
  stickyShadow: string;
  stickyDanger: string;
}

const lightThemeVars: AppThemeVars = {
  bg: 'oklch(97% 0.014 78)',
  surface: 'oklch(99% 0.006 78)',
  surface2: 'oklch(98% 0.008 78)',
  fg: 'oklch(20% 0.02 70)',
  muted: 'oklch(49% 0.018 70)',
  faint: 'oklch(70% 0.014 70)',
  border: 'oklch(88% 0.012 78)',
  accent: 'oklch(61% 0.13 42)',
  accentSoft: 'oklch(94% 0.034 42)',
  stickySurface: 'oklch(98% 0.016 82)',
  stickySurfaceAlt: 'oklch(96% 0.02 82)',
  stickyFg: 'oklch(20% 0.02 70)',
  stickyMuted: 'oklch(49% 0.018 70)',
  stickyBorder: 'oklch(84% 0.012 78)',
  stickyEditor: 'rgba(255, 255, 255, 0.46)',
  stickyCode: 'rgba(0, 0, 0, 0.08)',
  stickyQuote: 'rgba(168, 95, 50, 0.28)',
  stickyShadow: 'rgba(20, 17, 14, 0.16)',
  stickyDanger: '#b33d3d',
};

const darkThemeVars: AppThemeVars = {
  bg: '#15151a',
  surface: '#202025',
  surface2: '#26262c',
  fg: '#eee9e2',
  muted: '#b6aca2',
  faint: '#8f877f',
  border: 'rgba(255, 255, 255, 0.12)',
  accent: '#a85f32',
  accentSoft: 'rgba(168, 95, 50, 0.16)',
  stickySurface: '#202025',
  stickySurfaceAlt: '#2a2a31',
  stickyFg: '#f3ede6',
  stickyMuted: '#b6aca2',
  stickyBorder: 'rgba(255, 255, 255, 0.1)',
  stickyEditor: 'rgba(255, 255, 255, 0.08)',
  stickyCode: 'rgba(255, 255, 255, 0.08)',
  stickyQuote: 'rgba(168, 95, 50, 0.42)',
  stickyShadow: 'rgba(0, 0, 0, 0.32)',
  stickyDanger: '#ff8b8b',
};

export function getAppThemeVars(isDark: boolean): AppThemeVars {
  return isDark ? darkThemeVars : lightThemeVars;
}
```

在 `src/App.vue` 接入根节点主题变量和事件监听：

```vue
<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { NConfigProvider, NMessageProvider, NModal, darkTheme } from 'naive-ui';
import { useDark } from '@vueuse/core';

import { listenThemeModeChanged } from '@/composables/useAppEvents';
import { useSettingsStore } from '@/stores/settings';
import { getAppThemeVars } from '@/theme';

const settings = useSettingsStore();
const isDark = useDark();
const themeVars = computed(() => getAppThemeVars(isDark.value));

const themeRootStyle = computed(() => ({
  '--app-bg': themeVars.value.bg,
  '--app-surface': themeVars.value.surface,
  '--app-surface-2': themeVars.value.surface2,
  '--app-fg': themeVars.value.fg,
  '--app-muted': themeVars.value.muted,
  '--app-faint': themeVars.value.faint,
  '--app-border': themeVars.value.border,
  '--app-accent': themeVars.value.accent,
  '--app-accent-soft': themeVars.value.accentSoft,
  '--sticky-surface': themeVars.value.stickySurface,
  '--sticky-surface-alt': themeVars.value.stickySurfaceAlt,
  '--sticky-fg': themeVars.value.stickyFg,
  '--sticky-muted': themeVars.value.stickyMuted,
  '--sticky-border': themeVars.value.stickyBorder,
  '--sticky-editor': themeVars.value.stickyEditor,
  '--sticky-code': themeVars.value.stickyCode,
  '--sticky-quote': themeVars.value.stickyQuote,
  '--sticky-shadow': themeVars.value.stickyShadow,
  '--sticky-danger': themeVars.value.stickyDanger,
}));

let unlistenThemeMode: (() => void) | undefined;

onMounted(() => {
  void settings.load();
  void listenThemeModeChanged(mode => {
    settings.state.themeMode = mode;
  }).then(unlisten => {
    unlistenThemeMode = unlisten;
  }).catch(() => {});
});

onUnmounted(() => {
  unlistenThemeMode?.();
});
</script>

<template>
  <div class="app-theme-root" :class="{ dark: isDark }" :style="themeRootStyle">
    <NConfigProvider :theme="naiveTheme">
      <NMessageProvider>
        <template v-if="shellModes.has(ui.mode)">
          <MainWorkbenchShell :nav-items="shellNavItems">
            <MainView v-if="ui.mode === 'main'" />
            <NoteEditorView v-else-if="ui.mode === 'note-editor'" />
            <CanvasView v-else-if="ui.mode === 'canvas'" />
            <PlaceholderView
              v-else-if="placeholderMeta"
              :title="placeholderMeta.title"
              :description="placeholderMeta.description"
            />
          </MainWorkbenchShell>
          <NModal
            :show="ui.settingsOpen"
            preset="card"
            :mask-closable="true"
            :auto-focus="false"
            @update:show="value => !value && ui.closeSettings()"
          >
            <SettingsView embedded @close="ui.closeSettings()" />
          </NModal>
        </template>
        <FloatingEditor v-else-if="ui.mode === 'floating'" />
        <StickyNote
          v-else-if="ui.mode === 'sticky' && ui.noteId"
          :note-id="ui.noteId"
        />
        <SettingsView v-else-if="ui.mode === 'settings'" />
        <ZenMode v-else-if="ui.mode === 'zen'" />
        <section v-else class="mode-fallback">
          <h1>Steno · {{ ui.mode }}</h1>
          <p>
            当前窗口模式：<code>{{ ui.mode }}</code>
            <template v-if="ui.noteId">&nbsp;· note id = <code>{{ ui.noteId }}</code></template>
          </p>
        </section>
      </NMessageProvider>
    </NConfigProvider>
  </div>
</template>
```

把 `src/views/SettingsView.vue` 的 `onThemeChange` 改成成功写库后广播：

```ts
import { emitThemeModeChanged } from '@/composables/useAppEvents';

async function onThemeChange(value: ThemeMode) {
  try {
    await settings.update('themeMode', value);
    await emitThemeModeChanged(value);
  } catch (e) {
    message.error(`主题保存失败：${String(e)}`);
  }
}
```

最后把 `src/components/MainWorkbenchShell.vue` 里本地主题变量切到根节点注入值：

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
}
```

- [ ] **Step 4: 再跑测试，确认转绿**

Run:

```bash
pnpm vitest run src/App.test.ts src/views/SettingsView.test.ts
```

Expected:

```text
PASS  src/App.test.ts
PASS  src/views/SettingsView.test.ts
Test Files  2 passed
```

- [ ] **Step 5: 提交这一组基础设施改动**

```bash
git add src/composables/useAppEvents.ts src/theme/index.ts src/App.vue src/App.test.ts src/views/SettingsView.vue src/views/SettingsView.test.ts src/components/MainWorkbenchShell.vue
git commit -m "feat: share theme tokens and app events"
```

## Task 2: 主列表接收跨窗口标题同步

**Files:**
- Modify: `src/stores/notes.ts`
- Modify: `src/views/MainView.vue`
- Modify: `src/views/MainView.test.ts`
- Test: `src/views/MainView.test.ts`

- [ ] **Step 1: 先写主列表同步测试**

在 `src/views/MainView.test.ts` 中加入 `listenNoteSaved` mock 和一个真正会更新响应式数组的同步入口：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';

const noteSavedListeners: Array<(note: Note) => void> = [];
const syncExternalNote = vi.fn((note: Note) => {
  const index = notesState.findIndex(item => item.id === note.id);
  if (index >= 0) {
    notesState[index] = note;
  } else {
    notesState.unshift(note);
  }
});

vi.mock('@/composables/useAppEvents', () => ({
  listenNoteSaved: vi.fn(async handler => {
    noteSavedListeners.push(handler);
    return () => {
      const index = noteSavedListeners.indexOf(handler);
      if (index >= 0) noteSavedListeners.splice(index, 1);
    };
  }),
}));

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    notes: notesState,
    pinned: [],
    loading: loadingState,
    loadNotes,
    loadPinned,
    pinNote: vi.fn(() => Promise.resolve()),
    unpinNote: vi.fn(() => Promise.resolve()),
    saveDraft: notesStoreOverrides.saveDraft ?? vi.fn(() => Promise.resolve(null)),
    removeNote: notesStoreOverrides.removeNote ?? vi.fn(() => Promise.resolve()),
    syncExternalNote,
  }),
}));

it('updates the visible card title when a sticky note save event arrives', async () => {
  notesState = reactive([
    makeNote({ id: 'note-1', title: '旧标题', content: '正文' }),
  ]) as unknown as Note[];

  const wrapper = mount(WrappedMainView);
  await flushPromises();

  noteSavedListeners[0]?.(makeNote({ id: 'note-1', title: '新标题', content: '正文' }));
  await flushPromises();

  expect(syncExternalNote).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'note-1', title: '新标题' }),
  );
  expect(wrapper.get('.note-card h3').text()).toBe('新标题');
});
```

- [ ] **Step 2: 运行测试，确认先红**

Run:

```bash
pnpm vitest run src/views/MainView.test.ts
```

Expected:

```text
FAIL  src/views/MainView.test.ts
- Expected "spy" to have been called
- Expected "旧标题" to be "新标题"
```

- [ ] **Step 3: 写最小实现**

先给 `src/stores/notes.ts` 增加跨窗口同步入口：

```ts
function syncExternalNote(note: Note) {
  upsertLocal(note);
  if (note.isPinned) {
    upsertPinned(note);
  } else {
    pinned.value = pinned.value.filter(n => n.id !== note.id);
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
};
```

再让 `src/views/MainView.vue` 在挂载时注册监听：

```ts
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { listenNoteSaved } from '@/composables/useAppEvents';

let unlistenNoteSaved: (() => void) | undefined;

onMounted(() => {
  void notes.loadNotes(50);
  void listenNoteSaved(note => {
    notes.syncExternalNote(note);
  }).then(unlisten => {
    unlistenNoteSaved = unlisten;
  }).catch(() => {});
});

onUnmounted(() => {
  unlistenNoteSaved?.();
});
```

- [ ] **Step 4: 再跑测试，确认主列表会同步**

Run:

```bash
pnpm vitest run src/views/MainView.test.ts
```

Expected:

```text
PASS  src/views/MainView.test.ts
Test Files  1 passed
```

- [ ] **Step 5: 提交主列表同步改动**

```bash
git add src/stores/notes.ts src/views/MainView.vue src/views/MainView.test.ts
git commit -m "feat: sync main list from sticky note save events"
```

## Task 3: 重构速记板标题交互、主题和底部状态栏

**Files:**
- Modify: `src/components/StickyNote.vue`
- Modify: `src/components/StickyNote.test.ts`
- Test: `src/components/StickyNote.test.ts`

- [ ] **Step 1: 先写速记板行为测试**

把 `src/components/StickyNote.test.ts` 扩成下面这组覆盖：

```ts
// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import StickyNote from './StickyNote.vue';
import StickyNoteSource from './StickyNote.vue?raw';
import type { Note } from '@/types/steno';

const emitNoteSaved = vi.fn(() => Promise.resolve());

vi.mock('@/composables/useAppEvents', () => ({
  emitNoteSaved,
}));

it('renders a read-only title view, removes legacy color controls, and shows footer stats', async () => {
  const wrapper = mount(WrappedStickyNote);
  await flushPromises();

  expect(wrapper.get('[data-testid="sticky-title-text"]').text()).toBe('置顶便签');
  expect(wrapper.find('[data-testid="sticky-title-input"]').exists()).toBe(false);
  expect(wrapper.find('.sticky-color-picker').exists()).toBe(false);
  expect(wrapper.find('.sticky-opacity').exists()).toBe(false);
  expect(wrapper.get('[data-testid="sticky-footer-status"]').text()).toContain('9 字 · 2 行');
  expect(StickyNoteSource).toContain('var(--sticky-surface)');
  expect(StickyNoteSource).not.toContain("'#fff7cc'");
});

it('saves the edited title on blur and broadcasts the saved note', async () => {
  saveDraft.mockResolvedValueOnce({
    ...baseNote,
    title: '新的速记标题',
  });

  const wrapper = mount(WrappedStickyNote);
  await flushPromises();

  await wrapper.get('[data-testid="sticky-title-edit"]').trigger('click');
  await wrapper.get('[data-testid="sticky-title-input"] input').setValue('新的速记标题');
  await wrapper.get('[data-testid="sticky-title-input"] input').trigger('blur');
  await flushPromises();

  expect(saveDraft).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'sticky-note-1', title: '新的速记标题' }),
  );
  expect(emitNoteSaved).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'sticky-note-1', title: '新的速记标题' }),
  );
  expect(wrapper.get('[data-testid="sticky-footer-status"]').text()).toContain('已保存');
});

it('restores the saved title when escape cancels title editing', async () => {
  const wrapper = mount(WrappedStickyNote);
  await flushPromises();

  await wrapper.get('[data-testid="sticky-title-edit"]').trigger('click');
  const input = wrapper.get('[data-testid="sticky-title-input"] input');
  await input.setValue('不会保存的标题');
  await input.trigger('keydown', { key: 'Escape' });
  await flushPromises();

  expect(saveDraft).not.toHaveBeenCalled();
  expect(wrapper.get('[data-testid="sticky-title-text"]').text()).toBe('置顶便签');
});
```

同时把默认内容调整成 2 行、9 字，确保统计断言稳定：

```ts
const baseNote: Note = {
  id: 'sticky-note-1',
  title: '置顶便签',
  content: '你好啊啊\n第二行',
  htmlContent: '<p>你好啊啊</p><p>第二行</p>',
  tags: ['sticky'],
  isPinned: true,
  pinnedWindowConfig: {
    width: 280,
    height: 220,
    opacity: 1,
    color: '#fff7cc',
    fontSize: 14,
  },
  canvasPosition: null,
  createdAt: '2026-05-15T07:00:00.000Z',
  updatedAt: '2026-05-15T07:05:00.000Z',
  wordCount: 9,
};
```

- [ ] **Step 2: 运行测试，确认先红**

Run:

```bash
pnpm vitest run src/components/StickyNote.test.ts
```

Expected:

```text
FAIL  src/components/StickyNote.test.ts
- Unable to find [data-testid="sticky-title-text"]
- Expected false to be true
- Expected "spy" to have been called with title "新的速记标题"
```

- [ ] **Step 3: 写最小实现**

把 `src/components/StickyNote.vue` 调整成标题显示态 / 编辑态双状态，并复用现有 autosave 保存状态：

```ts
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { NButton, NIcon, NInput, NPopselect } from 'naive-ui';

import { emitNoteSaved } from '@/composables/useAppEvents';
import { useMarkdown } from '@/composables/useMarkdown';
import type { Note, PinnedWindowConfig, SaveNoteRequest } from '@/types/steno';

const { renderHtml, countWords } = useMarkdown();

const title = ref('');
const titleDraft = ref('');
const isTitleEditing = ref(false);
const titleCommitInFlight = ref(false);
const titleInputRef = ref<{ focus: () => void } | null>(null);
const lastSavedNote = ref<Note | null>(null);

const wordCount = computed(() => countWords(content.value));
const lineCount = computed(() => (content.value ? content.value.split(/\r?\n/).length : 0));

const {
  status,
  savedAt,
  error,
  scheduleSave,
  flushSave,
} = useAutosave(async (payload: SaveNoteRequest) => {
  lastSavedNote.value = await notes.saveDraft(payload);
});

const saveStatusText = computed(() => {
  switch (status.value) {
    case 'scheduled':
      return '编辑中…';
    case 'saving':
      return '保存中…';
    case 'saved':
      return savedAt.value
        ? `已保存 ${savedAt.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
        : '已保存';
    case 'error':
      return `保存失败：${String(error.value).slice(0, 40)}`;
    default:
      return '';
  }
});

const footerStatusText = computed(() => {
  const prefix = `${wordCount.value} 字 · ${lineCount.value} 行`;
  return saveStatusText.value ? `${prefix} · ${saveStatusText.value}` : prefix;
});

function buildSavePayload(): SaveNoteRequest {
  return {
    id: props.noteId,
    title: title.value || undefined,
    content: content.value,
    tags: tags.value,
    isPinned: true,
    pinnedWindowConfig: config.value,
  };
}

watch([title, content], () => {
  if (!loaded.value) return;
  scheduleSave(buildSavePayload());
});

async function enterTitleEdit() {
  titleDraft.value = title.value;
  isTitleEditing.value = true;
  await nextTick();
  titleInputRef.value?.focus();
}

function cancelTitleEdit() {
  titleDraft.value = title.value;
  isTitleEditing.value = false;
}

async function commitTitleEdit() {
  if (!isTitleEditing.value || titleCommitInFlight.value) return;
  titleCommitInFlight.value = true;
  try {
    const nextTitle = titleDraft.value.trim();
    const changed = nextTitle !== title.value;
    title.value = nextTitle;
    titleDraft.value = nextTitle;
    if (changed) {
      await nextTick();
    }
    await flushSave();
    if (status.value === 'error') return;
    isTitleEditing.value = false;
    if (changed && lastSavedNote.value) {
      await emitNoteSaved(lastSavedNote.value);
    }
  } finally {
    titleCommitInFlight.value = false;
  }
}

function onTitleInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    void commitTitleEdit();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelTitleEdit();
  }
}
```

把模板改成标题文本 + 图标按钮，并移除颜色 / 透明度控件：

```vue
<header class="sticky-header" @pointerdown="onHeaderPointerdown">
  <div class="sticky-title-wrap" @pointerdown.stop>
    <NInput
      v-if="isTitleEditing"
      ref="titleInputRef"
      v-model:value="titleDraft"
      size="tiny"
      placeholder="无标题"
      :bordered="false"
      class="sticky-title"
      data-testid="sticky-title-input"
      @blur="commitTitleEdit"
      @keydown="onTitleInputKeydown"
    />
    <span
      v-else
      class="sticky-title-text"
      data-testid="sticky-title-text"
    >
      {{ title || '无标题' }}
    </span>
    <NButton
      v-if="!isTitleEditing"
      quaternary
      circle
      size="tiny"
      class="sticky-icon-btn"
      title="编辑标题"
      data-testid="sticky-title-edit"
      @click="enterTitleEdit"
    >
      <template #icon>
        <NIcon>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
        </NIcon>
      </template>
    </NButton>
    <NButton
      v-else
      quaternary
      circle
      size="tiny"
      class="sticky-icon-btn"
      title="保存标题"
      data-testid="sticky-title-save"
      @click="commitTitleEdit"
    >
      <template #icon>
        <NIcon>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </NIcon>
      </template>
    </NButton>
  </div>

  <div class="sticky-actions">
    <NButton
      quaternary
      circle
      size="tiny"
      class="sticky-icon-btn"
      title="取消置顶并关闭"
      @click="onUnpinClick"
    >
      <template #icon>
        <NIcon>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
            <path d="M14.4 6 14 4H7.7L7 5.2l3 5.3L7.3 13 4 16.3V17h6.7L12 22l1.3-5h6.7v-.7L16.7 13 14 10.5 17 5.2 16.3 4H14.4zM6.4 15 9 12.4 6.1 7.3l-.4-.8L8 6h4l2.3-.5-.4.8L11 12.4 13.6 15H6.4z" />
          </svg>
        </NIcon>
      </template>
    </NButton>
    <NButton
      quaternary
      circle
      size="tiny"
      class="sticky-icon-btn"
      title="隐藏便签"
      @click="onCloseClick"
    >
      <template #icon>
        <NIcon>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
            <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L12 14.83l-4.89 4.88-1.42-1.42L10.59 12 5.69 7.12 7.11 5.71 12 10.59z" />
          </svg>
        </NIcon>
      </template>
    </NButton>
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
  <button
    v-if="editing"
    class="sticky-done-btn"
    title="完成编辑"
    @click="exitEdit"
  >
    完成
  </button>
  <span class="sticky-status" data-testid="sticky-footer-status">
    {{ footerStatusText }}
  </span>
</footer>
```

再把样式切换到共享主题变量：

```css
.sticky-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--sticky-surface);
  color: var(--sticky-fg);
  border: 1px solid var(--sticky-border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 14px 30px var(--sticky-shadow);
}

.sticky-header,
.sticky-footer {
  background: color-mix(in srgb, var(--sticky-surface) 86%, var(--app-surface-2));
}

.sticky-title-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--sticky-muted);
  font-size: 12px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sticky-icon-btn,
.sticky-styler-btn,
.sticky-done-btn {
  color: var(--sticky-fg);
}

.sticky-icon-btn:hover,
.sticky-styler-btn:hover,
.sticky-done-btn:hover {
  background: var(--app-accent-soft);
}

.sticky-preview {
  color: var(--sticky-fg);
}

.sticky-content--editing {
  background: var(--sticky-editor);
}

.sticky-preview :deep(code),
.sticky-preview :deep(pre) {
  background: var(--sticky-code);
}

.sticky-preview :deep(blockquote) {
  border-left-color: var(--sticky-quote);
  color: var(--sticky-muted);
}

.sticky-status {
  color: var(--sticky-muted);
  font-size: 11px;
  white-space: nowrap;
}
```

- [ ] **Step 4: 再跑测试，确认速记板行为转绿**

Run:

```bash
pnpm vitest run src/components/StickyNote.test.ts
```

Expected:

```text
PASS  src/components/StickyNote.test.ts
Test Files  1 passed
```

- [ ] **Step 5: 提交速记板改动**

```bash
git add src/components/StickyNote.vue src/components/StickyNote.test.ts
git commit -m "feat: update sticky note theme title and status bar"
```

## Task 4: 整体验证与收尾

**Files:**
- Modify: `src/App.vue`（如验证时发现类名或根节点样式需要微调）
- Modify: `src/components/StickyNote.vue`（仅在验证发现遗漏时微调）
- Test: `src/App.test.ts`
- Test: `src/views/SettingsView.test.ts`
- Test: `src/views/MainView.test.ts`
- Test: `src/components/StickyNote.test.ts`

- [ ] **Step 1: 跑全部相关单测**

Run:

```bash
pnpm vitest run src/App.test.ts src/views/SettingsView.test.ts src/views/MainView.test.ts src/components/StickyNote.test.ts
```

Expected:

```text
PASS  src/App.test.ts
PASS  src/views/SettingsView.test.ts
PASS  src/views/MainView.test.ts
PASS  src/components/StickyNote.test.ts
Test Files  4 passed
```

- [ ] **Step 2: 跑类型检查**

Run:

```bash
pnpm typecheck
```

Expected:

```text
exit code 0
```

- [ ] **Step 3: 做一次人工回归清单**

Run:

```bash
git diff --stat HEAD~3..HEAD
```

核对以下四项都能从代码与测试映射到：

```text
1. 速记板图标在浅色 / 深色下具备明显对比
2. 标题只能通过图标进入编辑，失焦 / Enter / 保存图标都会提交
3. 速记板不再显示颜色选择器和透明度滑块
4. 底部右侧显示“字数 · 行数 · 保存状态 / 时间”
```

- [ ] **Step 4: 提交最后的验证 / 微调**

```bash
git add src/App.vue src/App.test.ts src/views/SettingsView.vue src/views/SettingsView.test.ts src/views/MainView.vue src/views/MainView.test.ts src/stores/notes.ts src/components/StickyNote.vue src/components/StickyNote.test.ts src/theme/index.ts src/composables/useAppEvents.ts
git commit -m "chore: verify sticky note theme title status flow"
```

## Self-Review

### Spec coverage

- 图标对比度：Task 1 的共享主题变量 + Task 3 的速记板按钮样式。
- 标题显式编辑：Task 3 的标题双状态与测试。
- 标题保存后主列表同步：Task 2 的 `note-saved` 监听与 `syncExternalNote`。
- 跟随项目主题：Task 1 的共享主题变量和主题广播。
- 底部右侧状态：Task 3 的 `footerStatusText` 和测试。

没有遗漏的规格项。

### Placeholder scan

- 没有 `TODO`、`TBD`、`类似 Task N` 这类占位描述。
- 每个改动步骤都给了具体文件、代码和命令。

### Type consistency

- 主题事件统一使用 `ThemeMode`。
- 笔记同步事件统一传 `Note`。
- 主列表同步入口统一命名为 `syncExternalNote(note)`。
