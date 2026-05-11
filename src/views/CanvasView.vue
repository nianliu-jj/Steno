<script setup lang="ts">
// 画布窗口入口（mode === 'canvas'）。负责加载 notes（store），把 Canvas
// 组件挂上去。窗口本身由 window_manager::open_canvas 创建（label='canvas'，
// 1024x720 居中），URL 已切到 index.html。
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
  <Canvas />
</template>

<style scoped>
/* CanvasView 是纯透传容器，所有布局都在 Canvas 内部。 */
</style>
