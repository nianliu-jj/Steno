<script setup lang="ts">
// 画布视图（mode === 'canvas'）。由 main 窗口路由切入，负责加载 notes
//（store），把 Canvas 组件挂上去。
import { onMounted } from 'vue';
import { NButton } from 'naive-ui';

import Canvas from '@/components/Canvas.vue';
import { useNotesStore } from '@/stores/notes';
import { useUiStore } from '@/stores/ui';

const notes = useNotesStore();
const ui = useUiStore();

onMounted(() => {
  // 拉一份较大的最近笔记列表给画布；plan MVP 不分页。
  void notes.loadNotes(500);
});
</script>

<template>
  <div class="canvas-page">
    <header class="canvas-page-header">
      <strong>画布</strong>
      <NButton size="small" quaternary @click="ui.navigateToMain">
        返回
      </NButton>
    </header>
    <div class="canvas-page-body">
      <Canvas />
    </div>
  </div>
</template>

<style scoped>
.canvas-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #14141a;
  color: #e8e8ea;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.canvas-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 16px;
  background: #1a1a22;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.canvas-page-header strong {
  font-size: 14px;
  font-weight: 600;
}

.canvas-page-body {
  flex: 1;
  min-height: 0;
}

.canvas-page-body :deep(.canvas-root) {
  height: 100%;
}
</style>
