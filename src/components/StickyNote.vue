<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { NButton, NIcon, NPopselect } from 'naive-ui';

import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { useAutosave, type AutosaveStatus } from '@/composables/useAutosave';
import { useDb } from '@/composables/useDb';
import { useMarkdown } from '@/composables/useMarkdown';
import { useWindow } from '@/composables/useWindow';
import { useNotesStore } from '@/stores/notes';
import type { Note, PinnedWindowConfig, SaveNoteRequest } from '@/types/steno';

interface Props {
  noteId: string;
}

const props = defineProps<Props>();

const DEFAULT_CONFIG: PinnedWindowConfig = {
  width: 280,
  height: 220,
  opacity: 1.0,
  color: '#fff7cc',
  fontSize: 14,
};

const FONT_OPTIONS = [
  { label: '小', value: 12 },
  { label: '中', value: 14 },
  { label: '大', value: 16 },
  { label: '特大', value: 18 },
];

const db = useDb();
const notes = useNotesStore();
const win = useWindow();
const { renderHtml, countWords } = useMarkdown();

let noteSaveQueue: Promise<unknown> = Promise.resolve();

function enqueueNoteSave(payload: SaveNoteRequest) {
  const run = noteSaveQueue.then(() => notes.saveDraft(payload));
  noteSaveQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

const loaded = ref(false);
const editing = ref(false);
const savedTitle = ref('');
const titleDraft = ref('');
const titleEditing = ref(false);
const pendingSavedTitle = ref<string | null>(null);
const content = ref('');
const tags = ref<string[]>([]);
const config = ref<PinnedWindowConfig>({ ...DEFAULT_CONFIG });
const titleSaveStatus = ref<AutosaveStatus | null>(null);

function syncSavedTitle(nextTitle: string) {
  savedTitle.value = nextTitle;
  if (!titleEditing.value) {
    titleDraft.value = nextTitle;
  }
}

const renderedHtml = computed(() => renderHtml(content.value));
const lineCount = computed(() => Math.max(1, content.value.split(/\r?\n/).length));
const wordCount = computed(() => countWords(content.value));
const titleForContentSave = computed(() => pendingSavedTitle.value ?? savedTitle.value);
const rootStyle = computed(() => ({
  '--sticky-font-size': `${config.value.fontSize}px`,
}));

const contentSave = useAutosave(async (payload: SaveNoteRequest) => {
  const saved = await enqueueNoteSave(payload);
  if (!saved) return;

  const nextTitle = saved.title;
  if (nextTitle !== savedTitle.value) {
    syncSavedTitle(nextTitle);
  }

  if (
    (pendingSavedTitle.value && nextTitle === pendingSavedTitle.value)
    || (titleSaveStatus.value === 'error' && payload.title && nextTitle === payload.title)
  ) {
    pendingSavedTitle.value = null;
    titleSaveStatus.value = 'saved';
  }
});

const configSave = useAutosave<PinnedWindowConfig>(
  async cfg => {
    await notes.updatePinnedConfig(props.noteId, cfg);
  },
  { delayMs: 300 },
);

const visibleSaveStatus = computed<AutosaveStatus | 'editing'>(() => {
  if (titleSaveStatus.value === 'saving') {
    return 'saving';
  }
  if (titleSaveStatus.value === 'error') {
    return 'error';
  }
  if (titleEditing.value) {
    return 'editing';
  }
  if (contentSave.status.value !== 'idle') {
    return contentSave.status.value;
  }
  if (titleSaveStatus.value === 'saved') {
    return 'saved';
  }
  return 'idle';
});
const saveStatusLabel = computed(() => {
  switch (visibleSaveStatus.value) {
    case 'editing':
    case 'scheduled':
      return '编辑中';
    case 'saving':
      return '保存中';
    case 'saved':
      return '已保存';
    case 'error':
      return '保存失败';
    default:
      return '未修改';
  }
});

watch(content, () => {
  if (!loaded.value) return;
  titleSaveStatus.value = null;
  contentSave.scheduleSave({
    id: props.noteId,
    title: titleForContentSave.value || undefined,
    content: content.value,
    tags: tags.value,
    isPinned: true,
    pinnedWindowConfig: config.value,
  });
});

watch(
  () => config.value.fontSize,
  () => {
    if (!loaded.value) return;
    configSave.scheduleSave({ ...config.value });
  },
);

watch(
  () => [config.value.width, config.value.height] as const,
  (next, prev) => {
    if (!loaded.value) return;
    const [w, h] = next;
    const [prevW, prevH] = prev ?? [0, 0];
    if (w === prevW && h === prevH) return;
    void win.setCurrentSize(w, h);
  },
);

onMounted(async () => {
  try {
    const note = await db.getNote(props.noteId);
    if (!note) {
      console.warn('[sticky] note not found:', props.noteId);
      return;
    }
    hydrateFromNote(note);
    await applyConfig(config.value);
  } catch (error) {
    console.error('[sticky] load failed:', error);
  } finally {
    loaded.value = true;
  }
});

function hydrateFromNote(note: Note) {
  savedTitle.value = note.title;
  titleDraft.value = note.title;
  content.value = note.content;
  tags.value = [...note.tags];
  config.value = { ...DEFAULT_CONFIG, ...note.pinnedWindowConfig };
}

async function applyConfig(cfg: PinnedWindowConfig) {
  try {
    await win.setCurrentSize(cfg.width, cfg.height);
    if (cfg.x != null && cfg.y != null) {
      await win.setCurrentPosition(cfg.x, cfg.y);
    }
  } catch (error) {
    console.error('[sticky] applyConfig failed:', error);
  }
}

function enterEdit() {
  editing.value = true;
}

async function exitEdit() {
  editing.value = false;
  await contentSave.flushSave();
}

function onBackgroundDblclick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('.md-editor__textarea')) return;
  if (target?.closest('button, input, [contenteditable]')) return;
  if (editing.value) {
    void exitEdit();
  } else {
    enterEdit();
  }
}

function startTitleEdit() {
  titleDraft.value = savedTitle.value;
  titleEditing.value = true;
}

function cancelTitleEdit() {
  titleDraft.value = savedTitle.value;
  titleEditing.value = false;
}

async function saveTitle() {
  const nextTitle = titleDraft.value.trim();
  const hasTitleChange = nextTitle !== savedTitle.value;
  pendingSavedTitle.value = hasTitleChange ? nextTitle : null;
  try {
    await contentSave.flushSave();
    if (!hasTitleChange) {
      titleEditing.value = false;
      titleDraft.value = savedTitle.value;
      pendingSavedTitle.value = null;
      titleSaveStatus.value = null;
      return;
    }

    pendingSavedTitle.value = nextTitle;
    titleSaveStatus.value = 'saving';
    const saved = await enqueueNoteSave({
      id: props.noteId,
      title: nextTitle || undefined,
      content: content.value,
      tags: tags.value,
      isPinned: true,
      pinnedWindowConfig: config.value,
    });
    syncSavedTitle(saved?.title ?? nextTitle);
    pendingSavedTitle.value = null;
    titleEditing.value = false;
    titleSaveStatus.value = 'saved';
  } catch (error) {
    if (savedTitle.value === nextTitle) {
      titleDraft.value = nextTitle;
      pendingSavedTitle.value = null;
      titleEditing.value = false;
      titleSaveStatus.value = 'saved';
      return;
    }
    pendingSavedTitle.value = null;
    titleSaveStatus.value = 'error';
    console.error('[sticky] save title failed:', error);
  }
}

function onTitleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    void saveTitle();
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    cancelTitleEdit();
  }
}

function onTitleBlur() {
  cancelTitleEdit();
}

function onTitleInput(event: Event) {
  titleDraft.value = (event.target as HTMLInputElement).value;
}

async function onHeaderPointerdown(event: PointerEvent) {
  if (event.button !== 0) return;
  if ((event.target as HTMLElement | null)?.closest('button, input')) return;
  if (titleEditing.value) {
    cancelTitleEdit();
  }
  event.preventDefault();
  try {
    await win.startDragCurrent();
  } catch (error) {
    console.error('[sticky] drag failed:', error);
  }
}

async function onUnpinClick() {
  try {
    await contentSave.flushSave();
    await notes.unpinNote(props.noteId);
  } catch (error) {
    console.error('[sticky] unpin failed:', error);
  }
  try {
    await win.closeStickyNote(props.noteId);
  } catch {
    await win.closeCurrent();
  }
}

async function onCloseClick() {
  await contentSave.flushSave();
  await win.hideCurrent();
}
</script>

<template>
  <div class="sticky-root" :style="rootStyle">
    <header class="sticky-header" @pointerdown="onHeaderPointerdown">
      <div class="sticky-title-row">
        <template v-if="titleEditing">
          <input
            data-testid="title-input"
            :value="titleDraft"
            class="sticky-title-input"
            placeholder="无标题"
            @blur="onTitleBlur"
            @input="onTitleInput"
            @keydown="onTitleKeydown"
          >
          <button
            data-testid="title-save-button"
            class="sticky-title-button"
            title="保存标题"
            @mousedown.prevent
            @click="saveTitle"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
              <path d="M17 3H5a2 2 0 0 0-2 2v14l4-4h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-1 8H8v-2h8zm0-3H8V6h8z" />
            </svg>
          </button>
        </template>
        <template v-else>
          <div data-testid="title-text" class="sticky-title-text">
            {{ savedTitle || '无标题' }}
          </div>
          <button
            data-testid="title-edit-button"
            class="sticky-title-button"
            title="编辑标题"
            @click="startTitleEdit"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
              <path d="M3 17.25V21h3.75l11-11.03-3.75-3.75zM20.71 7.04a1.002 1.002 0 0 0 0-1.42L18.37 3.29a1.002 1.002 0 0 0-1.42 0L15.12 5.12l3.75 3.75z" />
            </svg>
          </button>
        </template>
      </div>
      <div class="sticky-actions">
        <NButton
          quaternary
          circle
          size="tiny"
          class="sticky-icon-button"
          title="取消置顶并关闭"
          @click="onUnpinClick"
        >
          <template #icon>
            <NIcon>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                <path d="M14.4 6 14 4H7.7L7 5.2l3 5.3L7.3 13 4 16.3V17h6.7L12 22l1.3-5h6.7v-.7L16.7 13 14 10.5 17 5.2 16.3 4H14.4zM6.4 15 9 12.4 6.1 7.3l-.4-.8L8 6h4l2.3-.5-.4.8L11 12.4 13.6 15H6.4z" />
              </svg>
            </NIcon>
          </template>
        </NButton>
        <NButton
          quaternary
          circle
          size="tiny"
          class="sticky-icon-button"
          title="隐藏便签"
          @click="onCloseClick"
        >
          <template #icon>
            <NIcon>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L12 14.83l-4.89 4.88-1.42-1.42L10.59 12 5.69 7.12 7.11 5.71 12 10.59z" />
              </svg>
            </NIcon>
          </template>
        </NButton>
      </div>
    </header>

    <div
      class="sticky-content"
      :class="{ 'sticky-content--editing': editing }"
      @dblclick="onBackgroundDblclick"
    >
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-if="!editing" class="sticky-preview prose" v-html="renderedHtml" />
      <MarkdownEditor
        v-else
        v-model="content"
        autofocus
        placeholder="双击空白处可返回阅读模式"
      />
    </div>

    <footer class="sticky-footer" @pointerdown.stop>
      <div class="sticky-footer-left">
        <NPopselect
          v-model:value="config.fontSize"
          :options="FONT_OPTIONS"
          size="small"
          trigger="click"
        >
          <button class="sticky-styler-btn" title="字号">
            A
          </button>
        </NPopselect>
      </div>
      <div data-testid="footer-meta" class="sticky-footer-meta">
        {{ wordCount }} 字 / {{ lineCount }} 行 / {{ saveStatusLabel }}
      </div>
    </footer>
  </div>
</template>

<style scoped>
.sticky-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--app-surface);
  color: var(--app-text);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  overflow: hidden;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--app-text) 14%, transparent);
}

.sticky-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-surface) 82%, var(--app-text-muted) 18%);
  -webkit-user-select: none;
  user-select: none;
  cursor: grab;
}

.sticky-header:active {
  cursor: grabbing;
}

.sticky-title-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sticky-title-text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sticky-title-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
  color: var(--app-text);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 4px;
  outline: none;
}

.sticky-title-input:focus {
  border-color: var(--app-text);
}

.sticky-title-button,
.sticky-styler-btn {
  height: 22px;
  min-width: 22px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--app-text);
  background: color-mix(in srgb, var(--app-surface) 70%, var(--app-text-muted) 30%);
  border: 1px solid var(--app-border);
  border-radius: 4px;
  cursor: pointer;
}

.sticky-title-button:hover,
.sticky-styler-btn:hover {
  background: color-mix(in srgb, var(--app-surface) 50%, var(--app-text-muted) 50%);
}

.sticky-title-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.sticky-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--app-text);
}

.sticky-icon-button {
  color: var(--app-text);
  background: color-mix(in srgb, var(--app-surface) 72%, var(--app-text-muted) 28%);
  border: 1px solid var(--app-border);
}

.sticky-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-size: var(--sticky-font-size);
  line-height: 1.55;
}

.sticky-content--editing {
  background: color-mix(in srgb, var(--app-surface) 76%, var(--app-text-muted) 24%);
}

.sticky-preview {
  flex: 1;
  padding: 8px 12px;
  overflow: auto;
  color: var(--app-text);
}

.sticky-preview :deep(h1),
.sticky-preview :deep(h2),
.sticky-preview :deep(h3) {
  margin: 6px 0 4px;
}

.sticky-preview :deep(h1) {
  font-size: calc(var(--sticky-font-size) * 1.25);
}

.sticky-preview :deep(h2) {
  font-size: calc(var(--sticky-font-size) * 1.12);
}

.sticky-preview :deep(h3) {
  font-size: var(--sticky-font-size);
  font-weight: 700;
}

.sticky-preview :deep(p) {
  margin: 2px 0;
}

.sticky-preview :deep(code),
.sticky-preview :deep(pre) {
  background: color-mix(in srgb, var(--app-surface) 65%, var(--app-text-muted) 35%);
  border-radius: 4px;
}

.sticky-preview :deep(code) {
  padding: 1px 4px;
}

.sticky-preview :deep(pre) {
  padding: 6px 8px;
  overflow: auto;
  font-size: calc(var(--sticky-font-size) * 0.9);
}

.sticky-preview :deep(blockquote) {
  margin: 4px 0;
  padding-left: 8px;
  border-left: 2px solid var(--app-border);
  color: var(--app-text-muted);
}

.sticky-preview :deep(ul),
.sticky-preview :deep(ol) {
  margin: 2px 0;
  padding-left: 1.4em;
}

.sticky-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 4px 8px;
  border-top: 1px solid var(--app-border);
  color: var(--app-text-muted);
}

.sticky-footer-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sticky-footer-meta {
  margin-left: auto;
  font-size: 11px;
  white-space: nowrap;
}
</style>
