<script setup lang="ts">
// 根组件按 ui store 解析出的 WindowMode 渲染对应顶层视图。
//
// Plan Task 8 完成后所有 mode 都接入实际视图（main / floating / sticky /
// canvas / zen / settings）。SettingsView / ZenMode / MainView 内部使用
// Naive UI 的 useMessage，因此根节点需要套 NMessageProvider。页面型 mode
// 在 main 窗口里通过 `steno:navigate` 事件切换；floating / sticky 仍由独立
// 窗口 label 初始化。
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, provide, watch } from 'vue';
import { NConfigProvider, NMessageProvider, NModal, darkTheme } from 'naive-ui';
import { useDark } from '@vueuse/core';

import { useAppEvents } from '@/composables/useAppEvents';
import { useUiStore } from '@/stores/ui';
import { useSettingsStore } from '@/stores/settings';
import { useTodosStore } from '@/stores/todos';
import { getAppThemeVars } from '@/theme';
import { createI18n, I18N_KEY } from '@/i18n';
import FloatingEditor from '@/components/FloatingEditor.vue';
import MainWorkbenchShell from '@/components/MainWorkbenchShell.vue';
import CanvasView from '@/views/CanvasView.vue';
import ClipboardView from '@/views/ClipboardView.vue';
import MainView from '@/views/MainView.vue';
import NoteEditorView from '@/views/NoteEditorView.vue';
import SettingsView from '@/views/SettingsView.vue';
import TodoQuickPanel from '@/views/TodoQuickPanel.vue';
import TodoView from '@/views/TodoView.vue';
import ZenMode from '@/views/ZenMode.vue';
import type { WindowMode } from '@/types/steno';
import type { ThemeMode } from '@/stores/settings';

const ui = useUiStore();
const settings = useSettingsStore();
const todos = useTodosStore();
const { listenThemeModeChanged } = useAppEvents();
const StatsView = defineAsyncComponent(() =>
  import('@/views/StatsView.vue').then(module => module.default),
);

// i18n
const i18n = createI18n('zh-CN');
const { t, state: i18nState } = i18n;
provide(I18N_KEY, i18n);

const isDark = useDark();

const naiveTheme = computed(() => (isDark.value ? darkTheme : null));
const appThemeVars = computed(() => ({
  ...getAppThemeVars(isDark.value),
  '--app-window-radius': `${settings.state.windowBorderRadius}px`,
}));
let unlistenThemeModeChanged: (() => void) | null = null;
let disposed = false;
let settingsLoadPending = true;
let themeModeDuringLoad: ThemeMode | null = null;

const shellNavItems = computed<
  { key: WindowMode; label: string; active: boolean }[]
>(() => [
  { key: 'main', label: t('nav.notes'), active: ui.mode === 'main' },
  { key: 'canvas', label: t('nav.canvas'), active: ui.mode === 'canvas' },
  { key: 'clipboard', label: t('nav.clipboard'), active: ui.mode === 'clipboard' },
  { key: 'todo', label: t('nav.todo'), active: ui.mode === 'todo' },
]);

const shellModes = new Set<WindowMode>([
  'main',
  'note-editor',
  'canvas',
  'clipboard',
  'todo',
  'stats',
]);

// 启动加载 settings（Pinia store 自行缓存）。失败不阻塞 UI，错误会进 store.error。
onMounted(() => {
  void listenThemeModeChanged(mode => {
    if (settingsLoadPending) {
      themeModeDuringLoad = mode;
    }
    settings.state.themeMode = mode;
  })
    .then(unlisten => {
      if (disposed) {
        unlisten();
        return;
      }
      unlistenThemeModeChanged = unlisten;
    })
    .catch(error => {
      console.error('[app] failed to listen for theme mode changes:', error);
    });

  void settings.load().finally(() => {
    settingsLoadPending = false;
    if (themeModeDuringLoad !== null) {
      settings.state.themeMode = themeModeDuringLoad;
      themeModeDuringLoad = null;
    }
    // 同步语言设置到 i18n
    i18nState.locale = settings.state.locale;
  });

  void todos.startEventListeners();
});

onBeforeUnmount(() => {
  disposed = true;
  unlistenThemeModeChanged?.();
  unlistenThemeModeChanged = null;
  todos.stopEventListeners();
});

// themeMode 优先级：用户在 SettingsView 显式切换 → 覆盖 system；'system' 时
// 跟随 useDark 默认（matchMedia）。
watch(
  () => settings.state.themeMode,
  mode => {
    if (mode === 'light') {
      isDark.value = false;
    } else if (mode === 'dark') {
      isDark.value = true;
    }
    // system 留给 useDark 自己跟随系统
  },
);
</script>

<template>
  <NConfigProvider :theme="naiveTheme">
    <div class="app-theme-root" :class="{ dark: isDark }" :style="appThemeVars">
      <NMessageProvider>
        <template v-if="shellModes.has(ui.mode)">
          <MainWorkbenchShell :nav-items="shellNavItems">
            <MainView v-if="ui.mode === 'main'" />
            <NoteEditorView v-else-if="ui.mode === 'note-editor'" />
            <CanvasView v-else-if="ui.mode === 'canvas'" />
            <ClipboardView v-else-if="ui.mode === 'clipboard'" />
            <TodoView v-else-if="ui.mode === 'todo'" />
            <StatsView v-else-if="ui.mode === 'stats'" />
          </MainWorkbenchShell>
          <NModal
            :show="ui.settingsOpen"
            to=".app-theme-root"
            :mask-closable="true"
            :auto-focus="false"
            @update:show="value => !value && ui.closeSettings()"
          >
            <SettingsView embedded @close="ui.closeSettings()" />
          </NModal>
        </template>
        <FloatingEditor v-else-if="ui.mode === 'floating'" />
        <TodoQuickPanel v-else-if="ui.mode === 'todo-panel'" />
        <FloatingEditor
          v-else-if="ui.mode === 'sticky' && ui.noteId"
          :key="ui.noteId"
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
    </div>
  </NConfigProvider>
</template>

<style scoped>
.app-theme-root {
  min-height: 100vh;
  min-width: 100vw;
  border-radius: var(--app-window-radius, 12px);
  overflow: hidden;
}

.mode-fallback {
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 32px;
  background: #1f1f24;
  color: #e8e8ea;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
.mode-fallback h1 {
  font-size: 18px;
  margin: 0;
}
.mode-fallback p {
  font-size: 12px;
  color: #9a9aa3;
  margin: 0;
}
.mode-fallback code {
  background: #2c2c34;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}
</style>
