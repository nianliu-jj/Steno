<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { NButton, NInput, NText } from 'naive-ui';

import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { useAutosave } from '@/composables/useAutosave';
import { useDb } from '@/composables/useDb';
import { useMarkdown } from '@/composables/useMarkdown';
import { useNotesStore } from '@/stores/notes';
import { useUiStore } from '@/stores/ui';
import type { Note, SaveNoteRequest } from '@/types/steno';

const db = useDb();
const notes = useNotesStore();
const ui = useUiStore();
const { countWords } = useMarkdown();

const currentNoteId = ref<string | null>(ui.noteId ?? null);
const title = ref('');
const content = ref('');
const tags = ref<string[]>([]);
const loaded = ref(false);

const wordCount = computed(() => countWords(content.value));

function hydrateFromNote(note: Note) {
  currentNoteId.value = note.id;
  title.value = note.title;
  content.value = note.content;
  tags.value = [...note.tags];
}

onMounted(async () => {
  if (currentNoteId.value) {
    const note = await db.getNote(currentNoteId.value);
    if (note) {
      hydrateFromNote(note);
    }
  }
  loaded.value = true;
});

const { status, savedAt, error, scheduleSave, flushSave } = useAutosave(
  async (payload: SaveNoteRequest) => {
    const saved = await notes.saveDraft(payload);
    if (saved && !currentNoteId.value) {
      currentNoteId.value = saved.id;
    }
  },
);

watch([title, content], () => {
  if (!loaded.value) return;
  scheduleSave({
    id: currentNoteId.value ?? undefined,
    title: title.value || undefined,
    content: content.value,
    tags: tags.value,
  });
});

const statusText = computed(() => {
  switch (status.value) {
    case 'idle':
      return '';
    case 'scheduled':
      return '编辑中…';
    case 'saving':
      return '保存中…';
    case 'saved':
      return savedAt.value
        ? `已保存 ${savedAt.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
        : '已保存';
    case 'error':
      return `保存失败：${String(error.value).slice(0, 40)}`;
    default:
      return '';
  }
});

async function onBack() {
  await flushSave();
  ui.navigateToMain();
}
</script>

<template>
  <div class="note-editor-root">
    <header class="note-editor-header">
      <div class="note-editor-meta">
        <NText depth="3" class="note-editor-meta-text">{{ wordCount }} 字</NText>
        <NText depth="3" class="note-editor-meta-text">{{ statusText }}</NText>
      </div>
      <NButton size="small" tertiary class="note-editor-back-button" @click="onBack">
        返回列表
      </NButton>
    </header>

    <div class="note-editor-body">
      <NInput
        v-model:value="title"
        :bordered="false"
        size="large"
        placeholder="无标题"
        class="note-editor-title"
      />
      <MarkdownEditor
        v-model="content"
        autofocus
        placeholder="开始写作…"
      />
    </div>
  </div>
</template>

<style scoped>
.note-editor-root {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  color: #2a2a2a;
}

.note-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 24px;
  border-bottom: 1px solid rgba(55, 46, 36, 0.1);
}

.note-editor-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.note-editor-meta-text {
  --n-text-color: #5f564d !important;
  color: #5f564d !important;
}

.note-editor-back-button {
  --n-text-color: #6f5c4c !important;
  --n-text-color-hover: #2f2923 !important;
  --n-text-color-pressed: #2f2923 !important;
  --n-text-color-focus: #2f2923 !important;
  --n-color-hover: rgba(132, 82, 47, 0.1) !important;
  --n-color-pressed: rgba(132, 82, 47, 0.16) !important;
  --n-color-focus: rgba(132, 82, 47, 0.1) !important;
  color: #6f5c4c !important;
}

.note-editor-back-button:hover,
.note-editor-back-button:focus-visible {
  color: #2f2923 !important;
}

.note-editor-back-button :deep(.n-button__content) {
  color: inherit;
}

.note-editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 24px;
  gap: 16px;
}

.note-editor-title :deep(input) {
  padding: 0;
  font-size: 28px;
  font-weight: 600;
  color: #2a2a2a !important;
  caret-color: #2a2a2a;
}

.note-editor-title :deep(input::placeholder),
.note-editor-title :deep(.n-input__placeholder) {
  color: #7e7469 !important;
}

.note-editor-body :deep(.md-editor) {
  flex: 1;
  min-height: 420px;
  border: 1px solid rgba(55, 46, 36, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.55);
}

.note-editor-body :deep(.md-editor__toolbar) {
  border-bottom-color: rgba(55, 46, 36, 0.1);
  background: rgba(255, 255, 255, 0.7);
}

.note-editor-body :deep(.md-editor__toolbar button) {
  color: #5f564d;
}

.note-editor-body :deep(.md-editor__textarea) {
  color: #2a2a2a;
}
</style>
