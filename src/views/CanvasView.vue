<script setup lang="ts">
// 画布视图（mode === 'canvas'）。由 main 窗口路由切入，负责加载 notes
//（store），把 Canvas 组件挂上去。
import { onMounted } from 'vue';

import Canvas from '@/components/Canvas.vue';
import { useNotesStore } from '@/stores/notes';

const notes = useNotesStore();

onMounted(() => {
  // 拉一份较大的最近笔记列表给画布；plan MVP 不分页。
  void notes.loadNotes(500);
});
</script>

<template>
  <div class="canvas-page-body">
    <Canvas />
  </div>
</template>

<style scoped>
.canvas-page-body {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.canvas-page-body :deep(.canvas-root) {
  height: 100%;
}
</style>
