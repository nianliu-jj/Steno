<script setup lang="ts">
/**
 * @component MarkdownEditor
 * @description 通用 Markdown 编辑器 — 基于 CodeMirror 6 + 自建 live-render 装饰器。
 *
 * **WYSIWYG 模式**：用户输入 Markdown 语法后原位渲染样式（标题/粗体/斜体/代码等），
 * 光标进入对应行时语法标记符号（`#`、`**`、`` ` `` 等）重新显示，便于继续编辑。
 * 这是 Obsidian Live Preview / PureMark 的同路做法。
 *
 * **设计取舍**：
 * - 不在此组件内做自动保存：上层（FloatingEditor / NoteEditorView）用 `useAutosave`
 *   监听 `v-model` 变化，保持组件单一职责
 * - 不渲染右侧预览面板：只读视图由 `MarkdownReadSurface` 单独负责
 * - 工具栏改为快捷键体系：常用绑定见 `./markdown-editor/keymap.ts`
 *
 * **双向绑定机制**：
 * 组件通过 `EditorView.updateListener` 监听文档变更 → 回调 `emit('update:modelValue', text)`。
 * 外部 `v-model` 变化时通过 `watch` 回写编辑器：先比较当前内容是否相同（避免循环更新），
 * 若不同则 `suppressNextDocSync = true` 防止双向死循环。
 *
 * @props
 * - `modelValue: string` — v-model 绑定的 Markdown 内容
 * - `autofocus?: boolean` — 是否在挂载后自动聚焦
 * - `placeholder?: string` — 占位文字
 *
 * @emits
 * - `update:modelValue(value: string)` — v-model 更新
 * - `focus` — 编辑器获得焦点
 * - `blur` — 编辑器失去焦点
 *
 * @exposed
 * - `focus()` — 程序化聚焦编辑器
 * - `scrollToLine(line: number)` — 滚动到指定行（大纲点击跳转用）
 */

import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createMarkdownExtensions } from './markdown-editor/extensions';

interface Props {
  modelValue: string;
  autofocus?: boolean;
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  autofocus: false,
  placeholder: '此刻在想什么？支持 Markdown',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  focus: [];
  blur: [];
}>();

const containerRef = useTemplateRef<HTMLDivElement>('container');
const view = ref<EditorView | null>(null);
/**
 * 防止双向绑定死循环的标志。
 *
 * 场景：外部 `v-model` 变化 → `watch` 回写编辑器 → 触发 `onDocChange` →
 * 又 emit `update:modelValue` → 外部再次变化… 死循环。
 *
 * 解决：watch 里设 `suppressNextDocSync = true`，
 * `emitDocChange` 读到后跳过本次 emit 并复位标志。
 */
let suppressNextDocSync = false;

/** 将 focus/blur 事件转发给父组件。 */
function emitFocusChange(focused: boolean) {
  if (focused) emit('focus');
  else emit('blur');
}

/**
 * 文档变更回调 — 驱动 `v-model` 双向绑定。
 *
 * 若 `suppressNextDocSync` 为 true 则跳过（由 watch 回写触发），
 * 防止外部 v-model → 编辑器 → v-model 的死循环。
 */
function emitDocChange(next: string) {
  if (suppressNextDocSync) {
    suppressNextDocSync = false;
    return;
  }
  emit('update:modelValue', next);
}

onMounted(() => {
  if (!containerRef.value) return;
  const instance = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: createMarkdownExtensions({
        placeholder: props.placeholder,
        onDocChange: emitDocChange,
        onFocusChange: emitFocusChange,
      }),
    }),
    parent: containerRef.value,
  });
  view.value = instance;
  if (props.autofocus) {
    // queueMicrotask 确保 DOM 完成渲染后再 focus，避免焦点时序问题
    queueMicrotask(() => instance.focus());
  }
});

onBeforeUnmount(() => {
  view.value?.destroy();
  view.value = null;
});

/**
 * 监听外部 `modelValue` 变化 → 回写编辑器内容。
 *
 * **防死循环机制**：
 * 1. 先比较 `current === next`，相同则跳过
 * 2. 设 `suppressNextDocSync = true`，阻止本次 dispatch 触发的 `onDocChange` 再次 emit
 */
watch(
  () => props.modelValue,
  next => {
    const instance = view.value;
    if (!instance) return;
    const current = instance.state.doc.toString();
    if (current === next) return; // 内容相同，无需更新
    suppressNextDocSync = true;
    instance.dispatch({
      changes: { from: 0, to: current.length, insert: next },
    });
  },
);

/** 程序化聚焦编辑器。 */
function focus() {
  view.value?.focus();
}

/**
 * 滚动编辑器到指定行（大纲点击跳转）。
 *
 * @param line - 1-indexed 行号；超出范围自动 clamp
 */
function scrollToLine(line: number) {
  const instance = view.value;
  if (!instance) return;
  const total = instance.state.doc.lines;
  const target = Math.max(1, Math.min(line, total)); // clamp 到有效范围
  const lineInfo = instance.state.doc.line(target);
  instance.dispatch({
    selection: { anchor: lineInfo.from },
    effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start', yMargin: 12 }),
  });
  instance.focus();
}

defineExpose({ focus, scrollToLine });
</script>

<template>
  <div ref="container" class="md-editor" data-testid="md-editor" />
</template>

<style scoped>
.md-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.md-editor :deep(.cm-editor) {
  flex: 1;
  min-height: 0;
  height: 100%;
  background: transparent;
  color: inherit;
  font-size: 14px;
  line-height: 1.65;
}

.md-editor :deep(.cm-editor.cm-focused) {
  outline: none;
}

.md-editor :deep(.cm-scroller) {
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  padding: 12px 16px;
}

.md-editor :deep(.cm-content) {
  caret-color: currentColor;
  padding: 0;
}

.md-editor :deep(.cm-cursor),
.md-editor :deep(.cm-dropCursor) {
  border-left-width: 1.5px;
  border-left-color: currentColor;
}

.md-editor :deep(.cm-cursor-primary) {
  border-left-color: currentColor;
}

.md-editor :deep(.cm-line) {
  padding: 0;
}

.md-editor :deep(.cm-placeholder) {
  color: rgba(127, 127, 127, 0.6);
  font-style: italic;
}

/* 标题 */
.md-editor :deep(.cm-md-h1) {
  font-size: 1.85em;
  font-weight: 700;
  line-height: 1.3;
  margin-top: 0.4em;
}
.md-editor :deep(.cm-md-h2) {
  font-size: 1.55em;
  font-weight: 700;
  line-height: 1.32;
  margin-top: 0.35em;
}
.md-editor :deep(.cm-md-h3) {
  font-size: 1.3em;
  font-weight: 600;
  line-height: 1.36;
}
.md-editor :deep(.cm-md-h4) {
  font-size: 1.15em;
  font-weight: 600;
}
.md-editor :deep(.cm-md-h5) {
  font-size: 1.05em;
  font-weight: 600;
}
.md-editor :deep(.cm-md-h6) {
  font-size: 1em;
  font-weight: 600;
  color: rgba(127, 127, 127, 0.85);
}

/* 内联强调 */
.md-editor :deep(.cm-md-strong) {
  font-weight: 700;
}
.md-editor :deep(.cm-md-em) {
  font-style: italic;
}
.md-editor :deep(.cm-md-strike) {
  text-decoration: line-through;
  opacity: 0.75;
}
.md-editor :deep(.cm-md-inline-code) {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(127, 127, 127, 0.14);
  font-family: ui-monospace, "Consolas", "Cascadia Code", monospace;
  font-size: 0.92em;
}
.md-editor :deep(.cm-md-link) {
  color: #3b82f6;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* 引用 / 列表 */
.md-editor :deep(.cm-md-quote) {
  border-left: 3px solid rgba(132, 82, 47, 0.4);
  padding-left: 10px;
  color: rgba(95, 86, 77, 0.85);
  background: rgba(132, 82, 47, 0.04);
}
.md-editor :deep(.cm-md-list-item) {
  padding-left: 4px;
}

/* 暗色主题适配（与 useDark 联动；app-theme-root.dark 在 App.vue 根节点） */
:global(.app-theme-root.dark) .md-editor :deep(.cm-md-inline-code) {
  background: rgba(255, 255, 255, 0.12);
}
:global(.app-theme-root.dark) .md-editor :deep(.cm-md-quote) {
  border-left-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(220, 220, 224, 0.86);
}
:global(.app-theme-root.dark) .md-editor :deep(.cm-placeholder) {
  color: rgba(180, 180, 184, 0.55);
}
:global(.app-theme-root.dark) .md-editor :deep(.cm-md-link) {
  color: #60a5fa;
}
</style>
