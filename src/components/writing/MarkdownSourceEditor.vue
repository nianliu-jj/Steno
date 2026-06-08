<!--
  @file 写作表面组件 - Markdown Source Editor

  承载 Markdown Source Editor 的界面结构、响应式状态和用户交互，是 写作表面组件 模块的可视入口之一。
  注释重点标明模板结构、脚本状态、事件派发和样式隔离边界。
-->

<script setup lang="ts">
// 脚本区：组织 Markdown Source Editor 的响应式状态、计算属性、事件处理和外部模块协作。
interface Props {
  modelValue: string;
}

// 局部常量 props：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const props = defineProps<Props>();

// 局部常量 emit：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<template>
  <!-- 模板区：描述 Markdown Source Editor 的 DOM 层级、可交互区域和条件渲染边界。 -->
  <textarea
    class="writing-source-editor"
    :value="props.modelValue"
    spellcheck="false"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>

<style scoped>
/* 样式区：限定 Markdown Source Editor 的布局、主题色和响应式细节。 */
.writing-source-editor {
  width: 100%;
  min-height: 320px;
  padding: 12px 14px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1.65;
  font-family: ui-monospace, 'JetBrains Mono', 'Consolas', monospace;
}
</style>
