<script setup lang="ts">
import { baseKeymap } from 'prosemirror-commands';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { defaultMarkdownParser, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';

import type { WritingMode } from '@/composables/useWritingSession';

interface Props {
  modelValue: string;
  mode: WritingMode;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const root = useTemplateRef<HTMLDivElement>('root');
const local = ref(props.modelValue);
let view: EditorView | null = null;

function buildState(markdown: string) {
  return EditorState.create({
    doc: defaultMarkdownParser.parse(markdown || ''),
    plugins: [history(), keymap(baseKeymap)],
  });
}

function currentMarkdown() {
  if (!view) return local.value;
  return defaultMarkdownSerializer.serialize(view.state.doc);
}

function syncEditable() {
  if (!view) return;
  view.setProps({
    editable: () => props.mode === 'rich-edit',
  });
}

watch(() => props.modelValue, value => {
  if (value !== local.value) {
    local.value = value;
  }
  if (!view) return;
  if (value === currentMarkdown()) return;
  view.updateState(buildState(value));
  syncEditable();
});

watch(() => props.mode, () => {
  syncEditable();
});

function scrollToHeading(id: string) {
  const index = Number.parseInt(id.replace('heading-', ''), 10);
  if (!Number.isFinite(index) || !root.value) return;
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
      const nextState = view.state.apply(tr);
      view.updateState(nextState);
      const markdown = defaultMarkdownSerializer.serialize(nextState.doc);
      local.value = markdown;
      emit('update:modelValue', markdown);
    },
  });
});

onUnmounted(() => {
  view?.destroy();
  view = null;
});
</script>

<template>
  <div ref="root" class="writing-rich-editor" />
</template>

<style scoped>
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
