<!--
  @file 写作表面组件 - Markdown Rich Editor

  承载 Markdown Rich Editor 的界面结构、响应式状态和用户交互，是 写作表面组件 模块的可视入口之一。
  注释重点标明模板结构、脚本状态、事件派发和样式隔离边界。
-->

<script setup lang="ts">
// 脚本区：组织 Markdown Rich Editor 的响应式状态、计算属性、事件处理和外部模块协作。
import { baseKeymap } from 'prosemirror-commands';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { defaultMarkdownParser, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';

import type { WritingMode } from '@/composables/useWritingSession';

// 类型 Props：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
interface Props {
  modelValue: string;
  mode: WritingMode;
}

// 局部常量 props：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const props = defineProps<Props>();

// 局部常量 emit：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

// 局部常量 root：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const root = useTemplateRef<HTMLDivElement>('root');
// 局部常量 local：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const local = ref(props.modelValue);
let view: EditorView | null = null;

// 函数 buildState：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function buildState(markdown: string) {
  return EditorState.create({
    doc: defaultMarkdownParser.parse(markdown || ''),
    plugins: [history(), keymap(baseKeymap)]
  });
}

// 函数 currentMarkdown：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function currentMarkdown() {
  if (!view) return local.value;
  return defaultMarkdownSerializer.serialize(view.state.doc);
}

// 函数 syncEditable：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function syncEditable() {
  if (!view) return;
  view.setProps({
    editable: () => props.mode === 'rich-edit'
  });
}

watch(
  () => props.modelValue,
  value => {
    if (value !== local.value) {
      local.value = value;
    }
    if (!view) return;
    if (value === currentMarkdown()) return;
    view.updateState(buildState(value));
    syncEditable();
  }
);

watch(
  () => props.mode,
  () => {
    syncEditable();
  }
);

// 函数 scrollToHeading：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function scrollToHeading(id: string) {
  // 局部常量 index：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const index = Number.parseInt(id.replace('heading-', ''), 10);
  if (!Number.isFinite(index) || !root.value) return;
  // 局部常量 headings：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const headings = root.value.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

defineExpose({ scrollToHeading });

onMounted(() => {
  if (!root.value) return;

  view = new EditorView(root.value, {
    state: buildState(props.modelValue),
    editable: () => props.mode === 'rich-edit',
    dispatchTransaction(tr) {
      if (!view) return;
      // 局部常量 nextState：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const nextState = view.state.apply(tr);
      view.updateState(nextState);
      // 局部常量 markdown：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const markdown = defaultMarkdownSerializer.serialize(nextState.doc);
      local.value = markdown;
      emit('update:modelValue', markdown);
    }
  });
});

onUnmounted(() => {
  view?.destroy();
  view = null;
});
</script>

<template>
  <!-- 模板区：描述 Markdown Rich Editor 的 DOM 层级、可交互区域和条件渲染边界。 -->
  <div ref="root" class="writing-rich-editor" />
</template>

<style scoped>
/* 样式区：限定 Markdown Rich Editor 的布局、主题色和响应式细节。 */
.writing-rich-editor {
  width: 100%;
  min-height: 320px;
  padding: 12px 14px;
  background: transparent;
  color: inherit;
  line-height: 1.65;
}

.writing-rich-editor :deep(.ProseMirror) {
  min-height: 320px;
  outline: none;
  white-space: pre-wrap;
}

.writing-rich-editor :deep(h1) {
  margin: 0 0 10px;
  font-size: 28px;
  line-height: 1.3;
}

.writing-rich-editor :deep(h2) {
  margin: 18px 0 8px;
  font-size: 22px;
}

.writing-rich-editor :deep(h3) {
  margin: 16px 0 6px;
  font-size: 18px;
}

.writing-rich-editor :deep(p) {
  margin: 0 0 12px;
}

.writing-rich-editor :deep(ul),
.writing-rich-editor :deep(ol) {
  margin: 0 0 12px;
  padding-left: 24px;
}

.writing-rich-editor :deep(blockquote) {
  margin: 0 0 12px;
  padding-left: 12px;
  border-left: 3px solid rgba(95, 86, 77, 0.25);
  color: rgba(42, 42, 42, 0.76);
}
</style>
