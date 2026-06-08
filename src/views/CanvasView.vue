<!--
  @file 前端视图 - Canvas View

  承载 Canvas View 的界面结构、响应式状态和用户交互，是 前端视图 模块的可视入口之一。
  注释重点标明模板结构、脚本状态、事件派发和样式隔离边界。
-->

<script setup lang="ts">
// 脚本区：组织 Canvas View 的响应式状态、计算属性、事件处理和外部模块协作。
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

// 局部常量 notes：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const notes = useNotesStore();

onMounted(() => {
  // 拉一份较大的最近笔记列表给画布；plan MVP 不分页。
  void notes.loadNotes(500);
});
</script>

<template>
  <!-- 模板区：描述 Canvas View 的 DOM 层级、可交互区域和条件渲染边界。 -->
  <div class="canvas-page-body">
    <Canvas />
  </div>
</template>

<style scoped>
/* 样式区：限定 Canvas View 的布局、主题色和响应式细节。 */
.canvas-page-body {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.canvas-page-body :deep(.canvas-root) {
  height: 100%;
}
</style>
