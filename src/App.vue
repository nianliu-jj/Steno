<script setup lang="ts">
// 根组件按 ui store 解析出的 WindowMode 渲染对应顶层视图。
//
// Task 4 阶段所有非 main 的视图都是 placeholder <section>；Task 5-8 会
// 逐步把它们换成真实组件，并相应把 window_manager.rs 里 open_*_window 的
// URL 从独立 *.html 切到 index.html#mode（保留 hash 解析约定）。
import { computed, onMounted, watch } from 'vue';
import { darkTheme, NButton, NCard, NConfigProvider, NSpace, NText } from 'naive-ui';
import { useDark, useToggle } from '@vueuse/core';

import { useUiStore } from '@/stores/ui';
import { useSettingsStore } from '@/stores/settings';

const ui = useUiStore();
const settings = useSettingsStore();

const isDark = useDark();
const toggleDark = useToggle(isDark);

const naiveTheme = computed(() => (isDark.value ? darkTheme : null));
const appTitle = import.meta.env.VITE_APP_TITLE;

// 启动加载 settings（Pinia store 自行缓存）。失败不阻塞 UI，错误会进 store.error。
onMounted(() => {
  void settings.load();
});

// themeMode 优先级：用户在 SettingsView 显式切换 → 覆盖 system；'system' 时
// 跟随 useDark 默认（matchMedia）。Task 8 SettingsView 实装后再补三选一 UI。
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

function placeholderTaskNum(mode: string): number {
  if (mode === 'floating') return 5;
  if (mode === 'sticky') return 6;
  if (mode === 'canvas') return 7;
  return 8;
}
</script>

<template>
  <NConfigProvider :theme="naiveTheme">
    <!-- main：临时落地页（Task 8 用 MainView.vue 替换） -->
    <div
      v-if="ui.mode === 'main'"
      class="h-full w-full flex-center p-8"
      :class="isDark ? 'bg-#0b0b0f' : 'bg-#fafafa'"
    >
      <NCard class="max-w-md w-full" :title="`${appTitle} · 待命中`">
        <NSpace vertical>
          <NText>Phase 1 PR3 · 前端基础就位（stores / composables / types）。</NText>
          <NText depth="3" style="font-size: 12px;">
            按 <code>{{ settings.state.mainWindowShortcut }}</code> 显示 / 隐藏本窗口；
            <code>{{ settings.state.quicknoteShortcut }}</code> 呼出浮窗速记。
          </NText>
          <NButton type="primary" @click="toggleDark()">
            切换{{ isDark ? '浅色' : '深色' }}主题
          </NButton>
        </NSpace>
      </NCard>
    </div>

    <!-- 非 main 模式：placeholder。Task 5-8 各自替换。 -->
    <section v-else class="mode-placeholder">
      <h1>Steno · {{ ui.mode }}</h1>
      <p>
        当前窗口模式：<code>{{ ui.mode }}</code>
        <template v-if="ui.noteId">&nbsp;· note id = <code>{{ ui.noteId }}</code></template>
      </p>
      <p class="hint">
        视图占位中（plan Task {{ placeholderTaskNum(ui.mode) }}）。
      </p>
    </section>
  </NConfigProvider>
</template>

<style scoped>
.mode-placeholder {
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
.mode-placeholder h1 {
  font-size: 18px;
  margin: 0;
}
.mode-placeholder p {
  font-size: 12px;
  color: #9a9aa3;
  margin: 0;
}
.mode-placeholder .hint {
  color: #6f6f78;
}
.mode-placeholder code {
  background: #2c2c34;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}
</style>
