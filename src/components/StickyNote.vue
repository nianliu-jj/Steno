<script setup lang="ts">
// 置顶便签窗口顶级视图（mode === 'sticky'）。
// 每条置顶笔记对应一个独立 webview，label = `sticky-{uuid}`，URL = index.html。
// noteId 由 ui store 从 label 抽出后通过 prop 传进来。
//
// 行为（plan Task 6）：
// - mount：getNote(id) 拉数据 → 应用 pinnedWindowConfig (尺寸/位置/外观)
// - 阅读模式：markdown 预览 + 标题 + 标签
// - 双击内容 → 编辑模式（MarkdownEditor）；双击空白 / 点"完成" → flushSave + 回阅读
// - 内容编辑 1000ms debounce → notes.saveDraft
// - 标题默认只读，点击图标进入编辑，blur / Enter / 保存按钮提交，Escape 取消
// - 取消置顶按钮 → setNotePinned(id, false) + close 当前窗口
//
// 窗口本身由 window_manager::open_sticky_note 创建（transparent + always_on_top +
// skip_taskbar + decorations=false），尺寸/位置在前端 mount 时按 config 调整。
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { NButton, NIcon, NInput, NPopselect } from 'naive-ui';

import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { useAppEvents } from '@/composables/useAppEvents';
import { useAutosave } from '@/composables/useAutosave';
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
const { emitNoteSaved } = useAppEvents();
const { renderHtml, countWords } = useMarkdown();

// ----- 默认外观 -------------------------------------------------------

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

// ----- 数据 -----------------------------------------------------------

const loaded = ref(false);
const editing = ref(false);
const savedTitle = ref('');
const titleDraft = ref('');
const titleEditing = ref(false);
const titleInputRef = ref<{ focus: () => void } | null>(null);
const titleSaveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const titleSaveError = ref<string | null>(null);
const titleSavedAt = ref<Date | null>(null);
const content = ref('');
const tags = ref<string[]>([]);
const config = ref<PinnedWindowConfig>({ ...DEFAULT_CONFIG });

const renderedHtml = computed(() => renderHtml(content.value));
const displayTitle = computed(() => savedTitle.value.trim() || '无标题');
const wordCount = computed(() => countWords(content.value));
const lineCount = computed(() => {
  if (!content.value) {
    return 0;
  }
  return content.value.split(/\r?\n/).length;
});

// ----- 内容自动保存 ---------------------------------------------------

const contentSave = useAutosave(async (payload: SaveNoteRequest) => {
  await notes.saveDraft(payload);
});

watch([savedTitle, content], () => {
  if (!loaded.value) return;
  contentSave.scheduleSave({
    id: props.noteId,
    title: savedTitle.value || undefined,
    content: content.value,
    tags: tags.value,
    isPinned: true,
    pinnedWindowConfig: config.value,
  });
});

// ----- 样式自动保存（独立 debounce, 走 update_pinned_window_config） ----

const configSave = useAutosave<PinnedWindowConfig>(
  async cfg => {
    await notes.updatePinnedConfig(props.noteId, cfg);
  },
  { delayMs: 300 },
);

watch(
  () => ({ ...config.value }),
  cfg => {
    if (!loaded.value) return;
    configSave.scheduleSave(cfg);
  },
  { deep: true },
);

// 样式变更也要立即可视化（窗口尺寸）。
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

// ----- 启动加载 -------------------------------------------------------

onMounted(async () => {
  try {
    const note = await db.getNote(props.noteId);
    if (!note) {
      console.warn('[sticky] note not found:', props.noteId);
      await win.showCurrent();
      return;
    }
    hydrateFromNote(note);
    await applyConfig(config.value);
    await win.showCurrent();
  } catch (e) {
    console.error('[sticky] load failed:', e);
    await win.showCurrent();
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
  } catch (e) {
    console.error('[sticky] applyConfig failed:', e);
  }
}

// ----- 双击切换编辑 ----------------------------------------------------

function enterEdit() {
  editing.value = true;
}

async function exitEdit() {
  editing.value = false;
  await contentSave.flushSave();
}

// 双击 .sticky-content 的非可交互区域时回到阅读模式
function onBackgroundDblclick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (target?.closest('.md-editor__textarea')) return;
  if (target?.closest('button, input, [contenteditable]')) return;
  if (editing.value) {
    void exitEdit();
  } else {
    enterEdit();
  }
}

// ----- 标题编辑 -------------------------------------------------------

async function onStartTitleEdit() {
  titleDraft.value = savedTitle.value;
  titleEditing.value = true;
  titleSaveStatus.value = 'idle';
  titleSaveError.value = null;
  await nextTick();
  titleInputRef.value?.focus();
}

function onCancelTitleEdit() {
  titleDraft.value = savedTitle.value;
  titleEditing.value = false;
  titleSaveStatus.value = 'idle';
  titleSaveError.value = null;
}

function parseSavedTime(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function onSaveTitle() {
  if (!titleEditing.value || titleSaveStatus.value === 'saving') {
    return;
  }

  const nextTitle = titleDraft.value.trim();
  titleSaveStatus.value = 'saving';
  titleSaveError.value = null;

  try {
    await contentSave.flushSave();
    const savedNote = await notes.saveDraft({
      id: props.noteId,
      title: nextTitle || undefined,
      content: content.value,
      tags: tags.value,
      isPinned: true,
      pinnedWindowConfig: config.value,
    });

    if (!savedNote) {
      throw new Error('saveDraft returned null');
    }

    savedTitle.value = savedNote.title;
    titleDraft.value = savedNote.title;
    titleEditing.value = false;
    titleSaveStatus.value = 'saved';
    titleSavedAt.value = parseSavedTime(savedNote.updatedAt) ?? new Date();
    await emitNoteSaved(savedNote);
  } catch (e) {
    titleSaveStatus.value = 'error';
    titleSaveError.value = String(e);
    console.error('[sticky] save title failed:', e);
  }
}

const latestSavedAt = computed(() => {
  const contentSavedAt = contentSave.savedAt.value;
  const titleSaved = titleSavedAt.value;
  if (!contentSavedAt) return titleSaved;
  if (!titleSaved) return contentSavedAt;
  return contentSavedAt.getTime() >= titleSaved.getTime() ? contentSavedAt : titleSaved;
});

const statusText = computed(() => {
  if (titleEditing.value || contentSave.status.value === 'scheduled') {
    return '编辑中…';
  }
  if (titleSaveStatus.value === 'saving' || contentSave.status.value === 'saving') {
    return '保存中…';
  }
  if (titleSaveStatus.value === 'error') {
    return titleSaveError.value
      ? `保存失败：${titleSaveError.value.slice(0, 40)}`
      : '保存失败';
  }
  if (contentSave.status.value === 'error') {
    return `保存失败：${String(contentSave.error.value).slice(0, 40)}`;
  }
  if (titleSaveStatus.value === 'saved' || contentSave.status.value === 'saved') {
    return latestSavedAt.value
      ? `已保存 ${latestSavedAt.value.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
      : '已保存';
  }
  return '未修改';
});

// ----- 顶栏 + 操作 -----------------------------------------------------

async function onHeaderPointerdown(e: PointerEvent) {
  if (e.button !== 0) return;
  // 点中按钮不拖
  if ((e.target as HTMLElement | null)?.closest('button')) return;
  e.preventDefault();
  try {
    await win.startDragCurrent();
  } catch (err) {
    console.error('[sticky] drag failed:', err);
  }
}

async function onUnpinClick() {
  try {
    await contentSave.flushSave();
    await notes.unpinNote(props.noteId);
  } catch (e) {
    console.error('[sticky] unpin failed:', e);
  }
  try {
    await win.closeStickyNote(props.noteId);
  } catch {
    // 兜底
    await win.closeCurrent();
  }
}

async function onCloseClick() {
  try {
    await contentSave.flushSave();
    await notes.unpinNote(props.noteId);
  } catch (e) {
    console.error('[sticky] close failed:', e);
  }
  try {
    await win.closeStickyNote(props.noteId);
  } catch {
    await win.closeCurrent();
  }
}

// ----- CSS 样式绑定 ----------------------------------------------------

const rootStyle = computed(() => ({
  '--sticky-font-size': `${config.value.fontSize}px`,
}));
</script>

<template>
  <div class="sticky-root" :style="rootStyle">
    <header class="sticky-header" @pointerdown="onHeaderPointerdown">
      <div class="sticky-title-wrap" @pointerdown.stop>
        <NInput
          v-if="titleEditing"
          ref="titleInputRef"
          v-model:value="titleDraft"
          size="tiny"
          placeholder="无标题"
          :bordered="false"
          data-testid="sticky-title-input"
          class="sticky-title-input"
          @blur="onSaveTitle"
          @keydown.enter.prevent="onSaveTitle"
          @keydown.esc.prevent="onCancelTitleEdit"
        />
        <span
          v-else
          data-testid="sticky-title-text"
          class="sticky-title-text"
        >
          {{ displayTitle }}
        </span>
        <NButton
          quaternary
          circle
          size="tiny"
          :data-testid="titleEditing ? 'sticky-title-save' : 'sticky-title-edit'"
          :title="titleEditing ? '保存标题' : '编辑标题'"
          class="sticky-icon-button sticky-title-action"
          @pointerdown.prevent
          @click="titleEditing ? onSaveTitle() : onStartTitleEdit()"
        >
          <template #icon>
            <NIcon>
              <svg
                v-if="titleEditing"
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="m5 12 5 5L20 7" />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
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
          title="取消置顶并关闭"
          class="sticky-icon-button"
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
          title="关闭便签"
          class="sticky-icon-button"
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
          <button class="sticky-styler-btn" title="字号">
            A
          </button>
        </NPopselect>
      </div>
      <div class="sticky-footer-center">
        <button
          v-if="editing"
          class="sticky-done-btn"
          title="完成编辑"
          @click="exitEdit"
        >
          完成
        </button>
      </div>
      <div class="sticky-status" data-testid="sticky-status-bar">
        <span>{{ wordCount }} 字</span>
        <span aria-hidden="true">·</span>
        <span>{{ lineCount }} 行</span>
        <span aria-hidden="true">·</span>
        <span>{{ statusText }}</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.sticky-root {
  --sticky-surface: color-mix(in oklch, var(--app-surface) 94%, var(--app-accent-soft));
  --sticky-surface-2: color-mix(in oklch, var(--app-surface-2) 88%, transparent);
  --sticky-fg: var(--app-fg);
  --sticky-muted: var(--app-muted);
  --sticky-border: color-mix(in oklch, var(--app-border) 90%, transparent);
  --sticky-accent: var(--app-accent);
  --sticky-accent-soft: var(--app-accent-soft);
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--sticky-surface);
  color: var(--sticky-fg);
  border: 1px solid var(--sticky-border);
  border-radius: 8px;
  overflow: hidden;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  box-shadow: 0 10px 28px color-mix(in oklch, var(--app-fg) 18%, transparent);
}

.sticky-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 4px 8px 4px 10px;
  border-bottom: 1px solid var(--sticky-border);
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
  gap: 6px;
  color: var(--sticky-muted);
}

.sticky-title-text {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 140px;
  overflow: hidden;
  color: var(--sticky-fg);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sticky-title-input {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 140px;
}

.sticky-title-input :deep(input) {
  font-size: 12px;
  font-weight: 600;
  color: var(--sticky-fg) !important;
  caret-color: var(--sticky-accent);
}

.sticky-title-input :deep(input::placeholder),
.sticky-title-input :deep(.n-input__placeholder) {
  color: var(--sticky-muted) !important;
}

.sticky-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.sticky-icon-button {
  --n-text-color: var(--sticky-accent) !important;
  --n-text-color-hover: var(--sticky-fg) !important;
  --n-text-color-pressed: var(--sticky-fg) !important;
  --n-text-color-focus: var(--sticky-fg) !important;
  --n-color-hover: color-mix(in oklch, var(--sticky-accent-soft) 65%, transparent) !important;
  --n-color-pressed: color-mix(in oklch, var(--sticky-accent-soft) 82%, transparent) !important;
  --n-color-focus: color-mix(in oklch, var(--sticky-accent-soft) 65%, transparent) !important;
  color: var(--sticky-accent) !important;
}

.sticky-icon-button:hover,
.sticky-icon-button:focus-visible {
  color: var(--sticky-fg) !important;
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
  background: var(--sticky-surface-2);
}

.sticky-preview {
  flex: 1;
  padding: 8px 12px 10px;
  overflow: auto;
  color: var(--sticky-fg);
}

.sticky-preview :deep(h1),
.sticky-preview :deep(h2),
.sticky-preview :deep(h3) {
  margin: 6px 0 4px;
}

.sticky-preview :deep(h1) { font-size: calc(var(--sticky-font-size) * 1.25); }
.sticky-preview :deep(h2) { font-size: calc(var(--sticky-font-size) * 1.12); }
.sticky-preview :deep(h3) { font-size: var(--sticky-font-size); font-weight: 700; }
.sticky-preview :deep(p) { margin: 2px 0; }

.sticky-preview :deep(code) {
  background: color-mix(in oklch, var(--sticky-border) 55%, transparent);
  padding: 1px 4px;
  border-radius: 3px;
}

.sticky-preview :deep(pre) {
  background: color-mix(in oklch, var(--sticky-border) 55%, transparent);
  padding: 6px 8px;
  border-radius: 4px;
  overflow: auto;
  font-size: calc(var(--sticky-font-size) * 0.9);
}

.sticky-preview :deep(blockquote) {
  margin: 4px 0;
  padding-left: 8px;
  border-left: 2px solid var(--sticky-border);
  color: var(--sticky-muted);
}

.sticky-preview :deep(ul),
.sticky-preview :deep(ol) {
  margin: 2px 0;
  padding-left: 1.4em;
}

.sticky-footer {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 8px;
  border-top: 1px solid var(--sticky-border);
}

.sticky-styler {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sticky-styler-btn {
  width: 22px;
  height: 20px;
  font-size: 12px;
  font-weight: 700;
  background: transparent;
  color: var(--sticky-muted);
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.sticky-styler-btn:hover {
  background: color-mix(in oklch, var(--sticky-accent-soft) 55%, transparent);
  color: var(--sticky-fg);
}

.sticky-footer-center {
  display: flex;
  justify-content: center;
}

.sticky-status {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  color: var(--sticky-muted);
  font-size: 11px;
  white-space: nowrap;
}

.sticky-done-btn {
  height: 20px;
  padding: 0 10px;
  font-size: 11px;
  background: color-mix(in oklch, var(--sticky-accent-soft) 70%, transparent);
  color: var(--sticky-fg);
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.sticky-done-btn:hover {
  background: color-mix(in oklch, var(--sticky-accent-soft) 88%, transparent);
}
</style>
