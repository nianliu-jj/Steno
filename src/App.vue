<script setup lang="ts">
import { computed } from 'vue';
import { darkTheme, NButton, NCard, NConfigProvider, NSpace, NText } from 'naive-ui';
import { useDark, useToggle } from '@vueuse/core';

const isDark = useDark();
const toggleDark = useToggle(isDark);

const naiveTheme = computed(() => (isDark.value ? darkTheme : null));
const appTitle = import.meta.env.VITE_APP_TITLE;
</script>

<template>
  <NConfigProvider :theme="naiveTheme">
    <div class="h-full w-full flex-center p-8" :class="isDark ? 'bg-#0b0b0f' : 'bg-#fafafa'">
      <NCard class="max-w-md w-full" :title="`${appTitle} · 待命中`">
        <NSpace vertical>
          <NText>Phase 1 PR1 · 托盘常驻 + 全局快捷键已就位。</NText>
          <NText depth="3" style="font-size: 12px;">
            按 <code>Ctrl + Shift + N</code> 显示 / 隐藏本窗口；右键托盘菜单可"退出 Steno"。
          </NText>
          <NButton type="primary" @click="toggleDark()">
            切换{{ isDark ? '浅色' : '深色' }}主题
          </NButton>
        </NSpace>
      </NCard>
    </div>
  </NConfigProvider>
</template>
