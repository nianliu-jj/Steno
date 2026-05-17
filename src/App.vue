<script setup lang="ts">
// 根组件按 ui store 解析出的 WindowMode 渲染对应顶层视图。
//
// Plan Task 8 完成后所有 mode 都接入实际视图（main / floating / sticky /
// canvas / zen / settings）。SettingsView / ZenMode / MainView 内部使用
// Naive UI 的 useMessage，因此根节点需要套 NMessageProvider。页面型 mode
// 在 main 窗口里通过 `steno:navigate` 事件切换；floating / sticky 仍由独立
// 窗口 label 初始化。
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { NConfigProvider, NMessageProvider, NModal, darkTheme } from 'naive-ui';
import { useDark } from '@vueuse/core';

import { listenThemeModeChanged } from '@/composables/useAppEvents';
import { useUiStore } from '@/stores/ui';
import { useSettingsStore } from '@/stores/settings';
import FloatingEditor from '@/components/FloatingEditor.vue';
import MainWorkbenchShell from '@/components/MainWorkbenchShell.vue';
import StickyNote from '@/components/StickyNote.vue';
import CanvasView from '@/views/CanvasView.vue';
import MainView from '@/views/MainView.vue';
import NoteEditorView from '@/views/NoteEditorView.vue';
import PlaceholderView from '@/views/PlaceholderView.vue';
import SettingsView from '@/views/SettingsView.vue';
import ZenMode from '@/views/ZenMode.vue';
import type { WindowMode } from '@/types/steno';
import { getAppThemeVars } from '@/theme';

const ui = useUiStore();
const settings = useSettingsStore();

const isDark = useDark();
const themeVars = computed(() => getAppThemeVars(isDark.value));

const naiveTheme = computed(() => (isDark.value ? darkTheme : null));
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

const shellNavItems = computed<
  { key: WindowMode; label: string; active: boolean }[]
>(() => [
  { key: 'main', label: '笔记列表', active: ui.mode === 'main' },
  { key: 'canvas', label: '画布', active: ui.mode === 'canvas' },
  { key: 'clipboard', label: '粘贴板', active: ui.mode === 'clipboard' },
  { key: 'todo', label: '待办', active: ui.mode === 'todo' },
  { key: 'screenshot', label: '截图', active: ui.mode === 'screenshot' },
  { key: 'ocr', label: 'OCR', active: ui.mode === 'ocr' },
  { key: 'translate', label: '翻译', active: ui.mode === 'translate' },
]);

const placeholderMeta = computed(() => {
  switch (ui.mode) {
    case 'clipboard':
      return { title: '粘贴板', description: '功能规划中' };
    case 'todo':
      return { title: '待办', description: '功能规划中' };
    case 'screenshot':
      return { title: '截图', description: '功能规划中' };
    case 'ocr':
      return { title: 'OCR', description: '功能规划中' };
    case 'translate':
      return { title: '翻译', description: '功能规划中' };
    default:
      return null;
  }
});

const shellModes = new Set<WindowMode>([
  'main',
  'note-editor',
  'canvas',
  'clipboard',
  'todo',
  'screenshot',
  'ocr',
  'translate',
]);

let unlistenThemeMode: (() => void) | undefined;

// 启动加载 settings（Pinia store 自行缓存）。失败不阻塞 UI，错误会进 store.error。
onMounted(() => {
  void settings.load();
  void listenThemeModeChanged((mode) => {
    settings.state.themeMode = mode;
  }).then((unlisten) => {
    unlistenThemeMode = unlisten;
  }).catch(() => {});
});

onUnmounted(() => {
  unlistenThemeMode?.();
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

<style scoped>
.app-theme-root {
  min-height: 100vh;
  background: var(--app-bg);
  color: var(--app-fg);
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
