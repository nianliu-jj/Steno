<script setup lang="ts">
// 置顶便签窗口顶级视图（mode === 'sticky'）。
// 每条置顶笔记对应一个独立 webview，label = `sticky-{uuid}`，URL = index.html。
// noteId 由 ui store 从 label 抽出后通过 prop 传进来。
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { NButton, NIcon, NInput, NPopselect } from 'naive-ui';

import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { useAutosave } from '@/composables/useAutosave';
import { emitNoteSaved } from '@/composables/useAppEvents';
import { useDb } from '@/composables/useDb';
import { useMarkdown } from '@/composables/useMarkdown';
import { useWindow } from '@/composables/useWindow';
import { useNotesStore } from '@/stores/notes';
import type { Note, PinnedWindowConfig, SaveNoteRequest } from '@/types/steno';

interface Props {
  noteId: string;
}

const props = defineProps<Props>();

const db = useDb();
const notes = useNotesStore();
const win = useWindow();
const { renderHtml, countWords } = useMarkdown();

const DEFAULT_CONFIG: PinnedWindowConfig = {
  width: 280,
  height: 220,
  opacity: 1,
  color: '',
  fontSize: 14,
};

const FONT_OPTIONS = [
  { label: '小', value: 12 },
  { label: '中', value: 14 },
  { label: '大', value: 16 },
  { label: '特大', value: 18 },
];

const loaded = ref(false);
const editing = ref(false);
const title = ref('');
const titleDraft = ref('');
const content = ref('');
const tags = ref<string[]>([]);
const config = ref<PinnedWindowConfig>({ ...DEFAULT_CONFIG });
const isTitleEditing = ref(false);
const titleCommitInFlight = ref(false);
const titleInputRef = ref<{ focus: () => void } | null>(null);
const lastSavedNote = ref<Note | null>(null);

const renderedHtml = computed(() => renderHtml(content.value));
const wordCount = computed(() => countWords(content.value));
const lineCount = computed(() => (content.value ? content.value.split(/\r?\n/).length : 0));

const {
  status,
  savedAt,
  error,
  scheduleSave,
  flushSave,
} = useAutosave(async (payload: SaveNoteRequest) => {
  lastSavedNote.value = await notes.saveDraft(payload);
  return lastSavedNote.value;
});

const configSave = useAutosave<PinnedWindowConfig>(
  async (cfg) => {
    await notes.updatePinnedConfig(props.noteId, cfg);
  },
  { delayMs: 300 },
);

const saveStatusText = computed(() => {
  switch (status.value) {
    case 'scheduled':
      return '编辑中…';
    case 'saving':
      return '保存中…';
    case 'saved':
      return savedAt.value
        ? `已保存 ${savedAt.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
        : '已保存';
    case 'error':
      return `保存失败：${String(error.value).slice(0, 40)}`;
    default:
      return '';
  }
});

const footerStatusText = computed(() => {
  const prefix = `${wordCount.value} 字 · ${lineCount.value} 行`;
  return saveStatusText.value ? `${prefix} · ${saveStatusText.value}` : prefix;
});

const rootStyle = computed(() => ({
  '--sticky-font-size': `${config.value.fontSize}px`,
}));

watch([title, content], () => {
  if (!loaded.value) return;
  scheduleSave(buildSavePayload());
});

watch(
  () => ({ ...config.value }),
  (cfg) => {
    if (!loaded.value) return;
    configSave.scheduleSave(cfg);
  },
  { deep: true },
);

watch(
  () => [config.value.width, config.value.height] as const,
  (next, prev) => {
    if (!loaded.value) return;
    const [width, height] = next;
    const [prevWidth, prevHeight] = prev ?? [0, 0];
    if (width === prevWidth && height === prevHeight) return;
    void win.setCurrentSize(width, height);
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
  } catch (e) {
    console.error('[sticky] load failed:', e);
  } finally {
    loaded.value = true;
  }
});

function hydrateFromNote(note: Note) {
  title.value = note.title;
  titleDraft.value = note.title;
  content.value = note.content;
  tags.value = [...note.tags];
  config.value = { ...DEFAULT_CONFIG, ...note.pinnedWindowConfig };
  lastSavedNote.value = note;
}

function buildSavePayload(): SaveNoteRequest {
  return {
    id: props.noteId,
    title: title.value || undefined,
    content: content.value,
    tags: tags.value,
    isPinned: true,
    pinnedWindowConfig: config.value,
  };
}

async function applyConfig(cfg: PinnedWindowConfig) {
  try {
    await win.setCurrentSize(cfg.width, cfg.height);
    if (cfg.x != null && cfg.y != null) {
      await win.setCurrentPosition(cfg.x, cfg.y);
    }
  } catch (e) {
    console.error('[sticky] applyConfig failed:', e);
  }
}

function enterEdit() {
  editing.value = true;
}

async function exitEdit() {
  editing.value = false;
  await flushSave();
}

async function enterTitleEdit() {
  titleDraft.value = title.value;
  isTitleEditing.value = true;
  await nextTick();
  titleInputRef.value?.focus();
}

function cancelTitleEdit() {
  titleDraft.value = title.value;
  isTitleEditing.value = false;
}

async function commitTitleEdit() {
  if (!isTitleEditing.value || titleCommitInFlight.value) return;
  titleCommitInFlight.value = true;
  try {
    const nextTitle = titleDraft.value.trim();
    const changed = nextTitle !== title.value;
    title.value = nextTitle;
    titleDraft.value = nextTitle;
    if (changed) {
      await nextTick();
    }
    await flushSave();
    if (status.value === 'error') return;
    isTitleEditing.value = false;
    if (changed && lastSavedNote.value) {
      await emitNoteSaved(lastSavedNote.value);
    }
  } finally {
    titleCommitInFlight.value = false;
  }
}

function onTitleInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    void commitTitleEdit();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelTitleEdit();
  }
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

async function onHeaderPointerdown(event: PointerEvent) {
  if (event.button !== 0) return;
  if ((event.target as HTMLElement | null)?.closest('button')) return;
  event.preventDefault();
  try {
    await win.startDragCurrent();
  } catch (err) {
    console.error('[sticky] drag failed:', err);
  }
}

async function onUnpinClick() {
  try {
    await flushSave();
    await notes.unpinNote(props.noteId);
  } catch (e) {
    console.error('[sticky] unpin failed:', e);
  }
  try {
    await win.closeStickyNote(props.noteId);
  } catch {
    await win.closeCurrent();
  }
}

async function onCloseClick() {
  await flushSave();
  await win.hideCurrent();
}
</script>

<template>
  <div class="sticky-root" :style="rootStyle">
    <header class="sticky-header" @pointerdown="onHeaderPointerdown">
      <div class="sticky-title-wrap" @pointerdown.stop>
        <NInput
          v-if="isTitleEditing"
          ref="titleInputRef"
          v-model:value="titleDraft"
          size="tiny"
          placeholder="无标题"
          :bordered="false"
          class="sticky-title"
          data-testid="sticky-title-input"
          @blur="commitTitleEdit"
          @keydown="onTitleInputKeydown"
        />
        <span
          v-else
          class="sticky-title-text"
          data-testid="sticky-title-text"
        >
          {{ title || '无标题' }}
        </span>
        <NButton
          v-if="!isTitleEditing"
          quaternary
          circle
          size="tiny"
          class="sticky-icon-btn"
          title="编辑标题"
          data-testid="sticky-title-edit"
          @click="enterTitleEdit"
        >
          <template #icon>
            <NIcon>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </NIcon>
          </template>
        </NButton>
        <NButton
          v-else
          quaternary
          circle
          size="tiny"
          class="sticky-icon-btn"
          title="保存标题"
          data-testid="sticky-title-save"
          @click="commitTitleEdit"
        >
          <template #icon>
            <NIcon>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </NIcon>
          </template>
        </NButton>
      </div>

      <div class="sticky-actions">
        <NButton
          quaternary
          circle
          size="tiny"
          class="sticky-icon-btn"
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
          class="sticky-icon-btn"
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
      <!-- v-html 安全说明：见 MarkdownEditor.vue 顶部"设计取舍"。 -->
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
      <div class="sticky-styler">
        <NPopselect
          v-model:value="config.fontSize"
          :options="FONT_OPTIONS"
          size="small"
          trigger="click"
        >
          <button class="sticky-styler-btn" title="字号">A</button>
        </NPopselect>
      </div>
      <button
        v-if="editing"
        class="sticky-done-btn"
        title="完成编辑"
        @click="exitEdit"
      >
        完成
      </button>
      <span class="sticky-status" data-testid="sticky-footer-status">
        {{ footerStatusText }}
      </span>
    </footer>
  </div>
</template>

<style scoped>
.sticky-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--sticky-surface);
  color: var(--sticky-fg);
  border: 1px solid var(--sticky-border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 14px 30px var(--sticky-shadow);
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.sticky-header,
.sticky-footer {
  background: color-mix(in srgb, var(--sticky-surface) 86%, var(--app-surface-2));
}

.sticky-header {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 4px 6px 4px 10px;
  -webkit-user-select: none;
  user-select: none;
  cursor: grab;
}

.sticky-header:active {
  cursor: grabbing;
}

.sticky-title-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.sticky-title {
  flex: 1;
  min-width: 0;
}

.sticky-title :deep(input) {
  font-size: 12px;
  color: var(--sticky-fg);
}

.sticky-title-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--sticky-muted);
  font-size: 12px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sticky-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.sticky-icon-btn,
.sticky-styler-btn,
.sticky-done-btn {
  color: var(--sticky-fg);
}

.sticky-icon-btn:hover,
.sticky-styler-btn:hover,
.sticky-done-btn:hover {
  background: var(--app-accent-soft);
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
  background: var(--sticky-editor);
}

.sticky-preview {
  flex: 1;
  padding: 6px 12px 8px;
  overflow: auto;
  color: var(--sticky-fg);
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
  background: var(--sticky-code);
}

.sticky-preview :deep(code) {
  padding: 1px 4px;
  border-radius: 3px;
}

.sticky-preview :deep(pre) {
  padding: 6px 8px;
  border-radius: 4px;
  overflow: auto;
  font-size: calc(var(--sticky-font-size) * 0.9);
}

.sticky-preview :deep(blockquote) {
  margin: 4px 0;
  padding-left: 8px;
  border-left: 2px solid var(--sticky-quote);
  color: var(--sticky-muted);
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
  min-height: 30px;
  padding: 4px 8px;
  border-top: 1px solid var(--sticky-border);
}

.sticky-styler {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sticky-styler-btn {
  width: 20px;
  height: 18px;
  border: none;
  border-radius: 3px;
  background: transparent;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.sticky-done-btn {
  height: 20px;
  padding: 0 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 11px;
  cursor: pointer;
}

.sticky-status {
  margin-left: auto;
  color: var(--sticky-muted);
  font-size: 11px;
  white-space: nowrap;
}
</style>
