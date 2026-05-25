<script setup lang="ts">
/**
 * @component CanvasView
 * @description 画布视图页面 — `mode === 'canvas'` 时由 App.vue 渲染。
 *              负责预加载笔记列表（`loadNotes(500)`）并将 Canvas 组件挂载到页面。
 *
 * **为什么不在 Canvas 组件内部加载数据**：
 * Canvas 组件只负责渲染和交互；数据加载由视图层完成，遵循"容器组件 vs 展示组件"分离。
 */

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
