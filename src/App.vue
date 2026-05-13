<script setup lang="ts">
// 根组件按 ui store 解析出的 WindowMode 渲染对应顶层视图。
//
// Plan Task 8 完成后所有 mode 都接入实际视图（main / floating / sticky /
// canvas / zen / search / settings）。SettingsView / SearchView / ZenMode /
// MainView 内部使用 Naive UI 的 useMessage，因此根节点需要套
// NMessageProvider。页面型 mode 在 main 窗口里通过 `steno:navigate` 事件切换；
// floating / sticky 仍由独立窗口 label 初始化。
import { computed, onMounted, watch } from 'vue';
import { NConfigProvider, NMessageProvider, darkTheme } from 'naive-ui';
import { useDark } from '@vueuse/core';

import { useUiStore } from '@/stores/ui';
import { useSettingsStore } from '@/stores/settings';
import FloatingEditor from '@/components/FloatingEditor.vue';
import StickyNote from '@/components/StickyNote.vue';
import CanvasView from '@/views/CanvasView.vue';
import MainView from '@/views/MainView.vue';
import SearchView from '@/views/SearchView.vue';
import SettingsView from '@/views/SettingsView.vue';
import ZenMode from '@/views/ZenMode.vue';

const ui = useUiStore();
const settings = useSettingsStore();

const isDark = useDark();

const naiveTheme = computed(() => (isDark.value ? darkTheme : null));

// 启动加载 settings（Pinia store 自行缓存）。失败不阻塞 UI，错误会进 store.error。
onMounted(() => {
  void settings.load();
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
    <NMessageProvider>
      <MainView v-if="ui.mode === 'main'" />
      <FloatingEditor v-else-if="ui.mode === 'floating'" />
      <StickyNote
        v-else-if="ui.mode === 'sticky' && ui.noteId"
        :note-id="ui.noteId"
      />
      <CanvasView v-else-if="ui.mode === 'canvas'" />
      <ZenMode v-else-if="ui.mode === 'zen'" />
      <SearchView v-else-if="ui.mode === 'search'" />
      <SettingsView v-else-if="ui.mode === 'settings'" />
      <section v-else class="mode-fallback">
        <h1>Steno · {{ ui.mode }}</h1>
        <p>
          当前窗口模式：<code>{{ ui.mode }}</code>
          <template v-if="ui.noteId">&nbsp;· note id = <code>{{ ui.noteId }}</code></template>
        </p>
      </section>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped>
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
