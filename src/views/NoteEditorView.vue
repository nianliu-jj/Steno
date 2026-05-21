<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { NButton, NIcon, NInput, NText } from 'naive-ui';

import DocumentOutlineTree from '@/components/DocumentOutlineTree.vue';
import MarkdownReadSurface from '@/components/MarkdownReadSurface.vue';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { useAutosave } from '@/composables/useAutosave';
import { useDb } from '@/composables/useDb';
import { useMarkdown } from '@/composables/useMarkdown';
import { useMarkdownOutline } from '@/composables/useMarkdownOutline';
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
const editingTitle = ref(false);
const tagsDialogVisible = ref(false);
const tagsDraftRows = ref<string[]>([]);
const titleInputRef = ref<{ focus: () => void } | null>(null);
const editorRef = ref<{ focus: () => void; scrollToLine: (line: number) => void } | null>(null);
const viewMode = ref<'edit' | 'read'>('edit');
const outlineOpen = ref(false);

const wordCount = computed(() => countWords(content.value));
const displayTitle = computed(() => title.value.trim() || '无标题');
const { buildOutline } = useMarkdownOutline();
const outlineNodes = computed(() => buildOutline(content.value));

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

watch([title, content, tags], () => {
  if (!loaded.value) return;
  scheduleSave({
    id: currentNoteId.value ?? undefined,
    title: title.value || undefined,
    content: content.value,
    tags: tags.value,
  });
});

function parseTagRows(rows: string[]): string[] {
  return Array.from(
    new Set(
      rows
        .map(tag => tag.replace(/^#+/, '').trim())
        .filter(Boolean),
    ),
  );
}

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

async function onStartTitleEdit() {
  editingTitle.value = true;
  await nextTick();
  titleInputRef.value?.focus();
}

function onFinishTitleEdit() {
  editingTitle.value = false;
}

async function onOpenTagsDialog() {
  tagsDraftRows.value = tags.value.length ? [...tags.value] : [''];
  tagsDialogVisible.value = true;
}

function onCloseTagsDialog() {
  tagsDialogVisible.value = false;
}

function onAddTagRow() {
  tagsDraftRows.value.push('');
}

function onDeleteTagRow(index: number) {
  tagsDraftRows.value.splice(index, 1);
  if (tagsDraftRows.value.length === 0) {
    tagsDraftRows.value.push('');
  }
}

function onConfirmTagsDialog() {
  tags.value = parseTagRows(tagsDraftRows.value);
  tagsDialogVisible.value = false;
}

function onToggleReadMode() {
  viewMode.value = 'read';
}

function onToggleEditMode() {
  viewMode.value = 'edit';
  nextTick(() => editorRef.value?.focus());
}

async function onOpenZen() {
  await flushSave();
  ui.navigateTo('zen', currentNoteId.value, 'note-editor');
}

function onSelectOutline(node: { line: number; id: string }) {
  if (viewMode.value === 'edit') {
    editorRef.value?.scrollToLine(node.line);
    return;
  }

  document.getElementById(node.id)?.scrollIntoView({
    block: 'center',
    behavior: 'smooth',
  });
}
</script>

<template>
  <div class="note-editor-root">
    <header class="note-editor-header">
      <div class="note-editor-header-spacer" aria-hidden="true" />
      <div class="note-editor-title">
        <NInput
          v-if="editingTitle"
          ref="titleInputRef"
          v-model:value="title"
          :bordered="false"
          size="large"
          placeholder="无标题"
          aria-label="文档标题"
          class="note-editor-title-input"
          @blur="onFinishTitleEdit"
          @keydown.enter="onFinishTitleEdit"
        />
        <div v-else class="note-editor-title-display">
          <span class="note-editor-title-text">{{ displayTitle }}</span>
          <NButton
            quaternary
            circle
            size="small"
            title="编辑标题"
            aria-label="编辑标题"
            class="note-editor-icon-button"
            data-testid="note-title-edit"
            @click="onStartTitleEdit"
          >
            <template #icon>
              <NIcon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </NIcon>
            </template>
          </NButton>
        </div>
      </div>
      <div class="note-editor-actions">
        <NButton
          quaternary
          circle
          size="small"
          title="编辑标签"
          aria-label="编辑标签"
          class="note-editor-icon-button"
          data-testid="note-tags-edit"
          @click="onOpenTagsDialog"
        >
          <template #icon>
            <NIcon>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.6 13.1 13.1 20.6a2 2 0 0 1-2.8 0l-7-7V3h10.6l6.7 6.7a2 2 0 0 1 0 2.8z" />
                <path d="M7.5 7.5h.01" />
              </svg>
            </NIcon>
          </template>
        </NButton>
        <NButton size="small" tertiary class="note-editor-back-button" @click="onBack">
          返回列表
        </NButton>
      </div>
    </header>

    <div class="note-editor-body">
      <button
        class="note-editor-outline-fab"
        data-testid="note-outline-toggle"
        type="button"
        @click="outlineOpen = !outlineOpen"
      >
        大纲
      </button>
      <aside
        v-if="outlineOpen"
        class="note-editor-outline-panel"
        data-testid="note-outline-panel"
      >
        <DocumentOutlineTree :nodes="outlineNodes" @select="onSelectOutline" />
      </aside>
      <MarkdownEditor
        v-if="viewMode === 'edit'"
        ref="editorRef"
        v-model="content"
        autofocus
        placeholder="开始写作…"
      />
      <MarkdownReadSurface
        v-else
        data-testid="note-read-surface"
        :title="displayTitle"
        :content="content"
      />
    </div>

    <footer class="note-editor-footer">
      <div class="note-editor-footer-tags" aria-label="文档标签">
        <span v-if="tags.length === 0" class="note-editor-tag-empty">无标签</span>
        <template v-else>
          <span
            v-for="tag in tags"
            :key="tag"
            class="note-editor-tag"
          >
            #{{ tag }}
          </span>
        </template>
      </div>
      <div class="note-editor-footer-actions">
        <NButton
          size="small"
          tertiary
          data-testid="note-mode-read"
          @click="onToggleReadMode"
        >
          只读模式
        </NButton>
        <NButton
          size="small"
          tertiary
          data-testid="note-mode-edit"
          @click="onToggleEditMode"
        >
          编辑模式
        </NButton>
        <NButton
          size="small"
          type="primary"
          data-testid="note-open-zen"
          @click="onOpenZen"
        >
          Zen 模式
        </NButton>
      </div>
      <div class="note-editor-footer-meta">
        <NText depth="3" class="note-editor-meta-text">{{ wordCount }} 字</NText>
        <NText depth="3" class="note-editor-meta-text">{{ statusText }}</NText>
      </div>
    </footer>

    <div
      v-if="tagsDialogVisible"
      class="note-editor-dialog-backdrop"
      @click.self="onCloseTagsDialog"
      @keydown.esc="onCloseTagsDialog"
    >
      <section
        class="note-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-editor-tags-title"
      >
        <h2 id="note-editor-tags-title" class="note-editor-dialog-title">编辑标签</h2>
        <div class="note-editor-tag-editor">
          <div
            v-for="(_, index) in tagsDraftRows"
            :key="index"
            class="note-editor-tag-row"
          >
            <NInput
              v-model:value="tagsDraftRows[index]"
              size="small"
              placeholder="输入标签"
              :aria-label="`标签 ${index + 1}`"
              class="note-editor-tags-input"
              :data-testid="`note-tag-input-${index}`"
            />
            <NButton
              quaternary
              circle
              size="small"
              title="删除标签"
              :aria-label="`删除标签 ${index + 1}`"
              :data-testid="`note-tag-delete-${index}`"
              @click="onDeleteTagRow(index)"
            >
              <template #icon>
                <NIcon>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </NIcon>
              </template>
            </NButton>
          </div>
          <NButton
            size="small"
            tertiary
            class="note-editor-tag-add"
            data-testid="note-tag-add"
            @click="onAddTagRow"
          >
            <template #icon>
              <NIcon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </NIcon>
            </template>
            添加标签
          </NButton>
        </div>
        <div class="note-editor-dialog-actions">
          <NButton size="small" class="note-editor-dialog-cancel" @click="onCloseTagsDialog">
            取消
          </NButton>
          <NButton
            size="small"
            type="primary"
            data-testid="note-tags-confirm"
            @click="onConfirmTagsDialog"
          >
            保存
          </NButton>
        </div>
      </section>
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
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(180px, 420px) minmax(160px, 1fr);
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  border-bottom: 1px solid rgba(55, 46, 36, 0.1);
}

.note-editor-header-spacer {
  min-width: 0;
}

.note-editor-meta-text {
  --n-text-color: #5f564d !important;
  color: #5f564d !important;
}

.note-editor-actions {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.note-editor-icon-button {
  flex-shrink: 0;
  color: #6f5c4c;
}

.note-editor-icon-button:hover,
.note-editor-icon-button:focus-visible {
  color: #2f2923;
}

.note-editor-icon-button :deep(svg) {
  width: 16px;
  height: 16px;
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
  padding: 14px 24px 8px;
  position: relative;
}

.note-editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 24px 14px;
  border-top: 1px solid rgba(55, 46, 36, 0.08);
}

.note-editor-footer-tags {
  min-width: 0;
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  color: #6f5c4c;
  font-size: 12px;
}

.note-editor-tag,
.note-editor-tag-empty {
  flex-shrink: 0;
  line-height: 24px;
}

.note-editor-tag {
  max-width: 160px;
  overflow: hidden;
  padding: 0 7px;
  border: 1px solid rgba(132, 82, 47, 0.16);
  border-radius: 6px;
  background: rgba(132, 82, 47, 0.06);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-editor-tag-empty {
  color: #8a8178;
}

.note-editor-footer-meta {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  font-size: 12px;
  white-space: nowrap;
}

.note-editor-footer-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}

.note-editor-title {
  width: 100%;
  min-width: 0;
  justify-self: center;
}

.note-editor-title-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
}

.note-editor-title-text {
  min-width: 0;
  overflow: hidden;
  color: #2a2a2a;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-editor-title-input {
  width: 100%;
}

.note-editor-title-input :deep(input) {
  padding: 0;
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  color: #2a2a2a !important;
  caret-color: #2a2a2a;
}

.note-editor-title-input :deep(input::placeholder),
.note-editor-title-input :deep(.n-input__placeholder) {
  color: #7e7469 !important;
}

.note-editor-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(38, 31, 25, 0.22);
}

.note-editor-dialog {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  border: 1px solid rgba(55, 46, 36, 0.14);
  border-radius: 8px;
  background: #fffaf4;
  color: #2a2a2a;
  box-shadow: 0 18px 48px rgba(38, 31, 25, 0.16);
}

.note-editor-dialog-title {
  margin: 0;
  color: #2a2a2a;
  font-size: 16px;
  font-weight: 600;
}

.note-editor-tag-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.note-editor-tag-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  align-items: center;
  gap: 8px;
}

.note-editor-tags-input {
  --n-text-color: #2a2a2a !important;
  --n-placeholder-color: #8a7c70 !important;
  --n-color: #fffdf9 !important;
  --n-color-focus: #fffdf9 !important;
  --n-caret-color: #2a2a2a !important;
  --n-border: 1px solid rgba(55, 46, 36, 0.22) !important;
  --n-border-hover: 1px solid rgba(55, 46, 36, 0.38) !important;
  --n-border-focus: 1px solid #18a058 !important;
}

.note-editor-tags-input :deep(.n-input__placeholder),
.note-editor-tags-input :deep(input::placeholder) {
  color: #8a7c70 !important;
}

.note-editor-tags-input :deep(.n-input__input-el),
.note-editor-tags-input :deep(input) {
  color: #2a2a2a !important;
  -webkit-text-fill-color: #2a2a2a;
  caret-color: #2a2a2a;
}

.note-editor-tag-row :deep(.n-button),
.note-editor-tag-add,
.note-editor-dialog-cancel {
  --n-text-color: #6f5c4c !important;
  --n-text-color-hover: #2f2923 !important;
  --n-text-color-pressed: #2f2923 !important;
  --n-text-color-focus: #2f2923 !important;
  --n-color-hover: rgba(55, 46, 36, 0.08) !important;
  --n-color-pressed: rgba(55, 46, 36, 0.12) !important;
  --n-color-focus: rgba(55, 46, 36, 0.08) !important;
  color: #6f5c4c !important;
}

.note-editor-tag-row :deep(.n-button__content),
.note-editor-tag-add :deep(.n-button__content),
.note-editor-dialog-cancel :deep(.n-button__content) {
  color: inherit;
}

.note-editor-tag-row :deep(svg),
.note-editor-tag-add :deep(svg) {
  width: 16px;
  height: 16px;
  color: currentColor;
}

.note-editor-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.note-editor-outline-fab {
  position: absolute;
  right: 40px;
  bottom: 32px;
  z-index: 2;
  min-width: 64px;
  height: 32px;
  border: 1px solid rgba(132, 82, 47, 0.18);
  border-radius: 999px;
  background: rgba(255, 250, 244, 0.96);
  color: #6f5c4c;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(38, 31, 25, 0.12);
}

.note-editor-outline-panel {
  position: absolute;
  right: 24px;
  top: 18px;
  z-index: 3;
  width: 220px;
  max-height: calc(100% - 36px);
  overflow: auto;
  padding: 14px;
  border: 1px solid rgba(55, 46, 36, 0.12);
  border-radius: 12px;
  background: rgba(255, 250, 244, 0.98);
  box-shadow: 0 18px 36px rgba(38, 31, 25, 0.16);
}

.note-editor-body :deep(.md-editor) {
  flex: 1;
  min-height: 420px;
  border: 1px solid rgba(55, 46, 36, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.55);
}

.note-editor-body :deep(.markdown-read-surface) {
  flex: 1;
  min-height: 420px;
  border: 1px solid rgba(55, 46, 36, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
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
