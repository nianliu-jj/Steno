<!--
  @file 前端通用组件 - Entry Type Badge

  承载 Entry Type Badge 的界面结构、响应式状态和用户交互，是 前端通用组件 模块的可视入口之一。
  注释重点标明模板结构、脚本状态、事件派发和样式隔离边界。
-->

<script setup lang="ts">
// 脚本区：组织 Entry Type Badge 的响应式状态、计算属性、事件处理和外部模块协作。
defineProps<{ kind: 'folder' | 'group' | 'document' | 'text' }>();
</script>

<template>
  <!-- 模板区：描述 Entry Type Badge 的 DOM 层级、可交互区域和条件渲染边界。 -->
  <span class="entry-type-badge" :data-kind="kind">
    {{ kind === 'folder' ? '文件夹' : kind === 'group' ? '分组' : kind === 'document' ? '文档' : '文本' }}
  </span>
</template>

<style scoped>
/* 样式区：限定 Entry Type Badge 的布局、主题色和响应式细节。 */
.entry-type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  height: 20px;
  padding: 0 7px;
  border: 1px solid color-mix(in oklch, var(--app-accent) 36%, var(--app-border));
  border-radius: 6px;
  background: var(--app-accent-soft);
  color: var(--app-accent);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
</style>
