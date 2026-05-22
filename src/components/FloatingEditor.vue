<script setup lang="ts">
// 浮窗 / 便签双模式顶层视图。
//
// 两种模式由 `props.noteId` 决定：
//   - quicknote 模式（props.noteId == null）：单例 quick-capture 浮窗
//     · 失焦/关闭 → flushSave → hide + reset 状态，下次唤出是新会话
//     · 置顶按钮 → pin + 创建独立便签窗口，然后 hide quicknote
//   - sticky 模式（props.noteId 非空）：每条置顶笔记一个独立 webview
//     · mount 时按 noteId 从 SQLite hydrate
//     · 失焦不自动关闭（便签需要持久显示）
//     · 关闭/取消置顶按钮 → flushSave → unpin + closeStickyNote
//
// 自动保存：useAutosave 1000ms debounce。sticky 模式 hydrate 期间用 loaded
// 标志位阻断初次 watch，避免 mount 即触发保存。
//
// 拖动握手：startDragCurrent 之后 500ms 内的失焦忽略，避免误触发关闭计时器。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { NButton, NIcon, NInput, NText } from 'naive-ui';

import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { useAutosave } from '@/composables/useAutosave';
import { useDb } from '@/composables/useDb';
import { useMarkdown } from '@/composables/useMarkdown';
import { useWindow } from '@/composables/useWindow';
import { useNotesStore } from '@/stores/notes';
import { useSettingsStore } from '@/stores/settings';
import type { SaveNoteRequest } from '@/types/steno';

const props = withDefaults(defineProps<{
  noteId?: string | null;
}>(), {
  noteId: null,
});

const notes = useNotesStore();
const settings = useSettingsStore();
const win = useWindow();
const db = useDb();
const { countWords } = useMarkdown();

const isSticky = computed(() => !!props.noteId);

const currentNoteId = ref<string | null>(props.noteId ?? null);
const title = ref('');
const content = ref('');
const tagsInput = ref('');
const loaded = ref(!isSticky.value);

const tagsArray = computed(() => {
  const raw = tagsInput.value.trim();
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(/[,，\s]+/)
        .map(t => t.replace(/^#/, '').toLowerCase().trim())
        .filter(Boolean),
    ),
  );
});

const wordCount = computed(() => countWords(content.value));

const isEmpty = computed(
  () => !title.value.trim() && !content.value.trim() && tagsArray.value.length === 0,
);

// ----- 自动保存 -------------------------------------------------------

const { status, savedAt, error, scheduleSave, flushSave } = useAutosave(
  async (payload: SaveNoteRequest) => {
    const saved = await notes.saveDraft(payload);
    if (saved && !currentNoteId.value) {
      currentNoteId.value = saved.id;
    }
  },
);

watch([title, content, tagsInput], () => {
  if (!loaded.value) return;
  if (isEmpty.value && !currentNoteId.value) return;
  scheduleSave({
    id: currentNoteId.value ?? undefined,
    title: title.value || undefined,
    content: content.value,
    tags: tagsArray.value,
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
        ? `已保存 ${savedAt.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
        : '已保存';
    case 'error':
      return `保存失败：${String(error.value).slice(0, 40)}`;
    default:
      return '';
  }
});

const pinButtonTitle = computed(() => (isSticky.value ? '取消置顶并关闭' : '置顶为便签'));
const closeButtonTitle = computed(() => (isSticky.value ? '关闭便签' : '保存并关闭'));

// ----- 拖拽 + 失焦关闭 ------------------------------------------------

const dragUntil = ref(0);

async function onTitlebarPointerdown(e: PointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  dragUntil.value = Date.now() + 500;
  try {
    await win.startDragCurrent();
  } catch (err) {
    console.error('[floating] startDragging failed:', err);
  }
}

function resetState() {
  currentNoteId.value = null;
  title.value = '';
  content.value = '';
  tagsInput.value = '';
}

async function dismissSticky() {
  if (!currentNoteId.value) {
    await win.closeCurrent();
    return;
  }
  await flushSave();
  if (status.value === 'error') return;
  try {
    await notes.unpinNote(currentNoteId.value);
  } catch (e) {
    console.error('[sticky] unpin failed:', e);
  }
  try {
    await win.closeStickyNote(currentNoteId.value);
  } catch {
    await win.closeCurrent();
  }
}

async function dismissQuicknote() {
  if (isEmpty.value && !currentNoteId.value) {
    await win.hideCurrent();
    resetState();
    return;
  }
  await flushSave();
  if (status.value === 'error') return;
  await win.hideCurrent();
  resetState();
}

async function saveAndDismiss(): Promise<void> {
  if (isSticky.value) {
    await dismissSticky();
    return;
  }
  await dismissQuicknote();
}

let blurTimer: ReturnType<typeof setTimeout> | undefined;
let unlistenFocus: (() => void) | undefined;

onMounted(async () => {
  if (isSticky.value && props.noteId) {
    try {
      const note = await db.getNote(props.noteId);
      if (note) {
        currentNoteId.value = note.id;
        title.value = note.title;
        content.value = note.content;
        tagsInput.value = note.tags.map(t => `#${t}`).join(' ');
      } else {
        console.warn('[sticky] note not found:', props.noteId);
      }
    } catch (e) {
      console.error('[sticky] hydrate failed:', e);
    }
    loaded.value = true;
    return;
  }

  unlistenFocus = await win.onCurrentWindowFocusChange(focused => {
    if (focused) {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = undefined;
      }
      return;
    }
    if (Date.now() < dragUntil.value) return;
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      blurTimer = undefined;
      void saveAndDismiss();
    }, settings.state.blurCloseDelayMs);
  });
});

onUnmounted(() => {
  if (blurTimer) clearTimeout(blurTimer);
  unlistenFocus?.();
  void flushSave();
});

// ----- 关闭 / 置顶 -----------------------------------------------------

async function onCloseClick() {
  await saveAndDismiss();
}

/**
 * quicknote 模式：flushSave → pin → 开 sticky → hide quicknote。
 * sticky 模式：等同于 dismissSticky（取消置顶并关闭）。
 */
async function onPinClick() {
  if (isSticky.value) {
    await dismissSticky();
    return;
  }
  if (isEmpty.value && !currentNoteId.value) return;
  await flushSave();
  if (status.value === 'error' || !currentNoteId.value) return;
  try {
    await notes.pinNote(currentNoteId.value);
    await win.openStickyNote(currentNoteId.value);
  } catch (e) {
    console.error('[floating] pin failed:', e);
    return;
  }
  await win.hideCurrent();
  resetState();
}
</script>

<template>
  <div class="floating-root">
    <header
      class="floating-titlebar"
      @pointerdown="onTitlebarPointerdown"
    >
      <NInput
        v-model:value="title"
        size="tiny"
        placeholder="无标题"
        :bordered="false"
        class="floating-title-input"
        @pointerdown.stop
      />
      <div class="floating-titlebar-actions">
        <NButton
          quaternary
          circle
          size="tiny"
          :title="pinButtonTitle"
          data-testid="floating-pin"
          @click="onPinClick"
        >
          <template #icon>
            <NIcon>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M14.4 6 14 4H7.7L7 5.2l3 5.3L7.3 13 4 16.3V17h6.7L12 22l1.3-5h6.7v-.7L16.7 13 14 10.5 17 5.2 16.3 4H14.4z" />
              </svg>
            </NIcon>
          </template>
        </NButton>
        <NButton
          quaternary
          circle
          size="tiny"
          :title="closeButtonTitle"
          data-testid="floating-close"
          @click="onCloseClick"
        >
          <template #icon>
            <NIcon>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L12 14.83l-4.89 4.88-1.42-1.42L10.59 12 5.69 7.12 7.11 5.71 12 10.59z" />
              </svg>
            </NIcon>
          </template>
        </NButton>
      </div>
    </header>

    <div class="floating-body">
      <MarkdownEditor
        v-model="content"
        autofocus
        placeholder="此刻在想什么？支持 Markdown · #标签 自动识别"
      />
    </div>

    <footer class="floating-footer">
      <NInput
        v-model:value="tagsInput"
        size="tiny"
        :bordered="false"
        placeholder="#tag1 #tag2"
        class="floating-tags-input"
      />
      <div class="floating-footer-meta">
        <NText depth="3" class="floating-meta-item">{{ wordCount }} 字</NText>
        <NText
          depth="3"
          class="floating-meta-item"
          :class="{ 'floating-meta-error': status === 'error' }"
        >
          {{ statusText }}
        </NText>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.floating-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #1f1f24;
  color: #e8e8ea;
  border-radius: 8px;
  overflow: hidden;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.floating-titlebar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 4px 4px 10px;
  background: #17171b;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  -webkit-user-select: none;
  user-select: none;
  cursor: grab;
}
.floating-titlebar:active {
  cursor: grabbing;
}
.floating-title-input {
  flex: 1;
  background: transparent;
  font-size: 12px;
  color: #cfcfd4;
}
.floating-title-input :deep(input) {
  font-size: 12px;
}
.floating-titlebar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.floating-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.floating-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: #17171b;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  font-size: 11px;
}
.floating-tags-input {
  flex: 1;
  font-size: 11px;
}
.floating-tags-input :deep(input) {
  font-size: 11px;
}
.floating-footer-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #6f6f78;
  white-space: nowrap;
}
.floating-meta-item {
  font-size: 11px;
}
.floating-meta-error {
  color: #ff6b6b;
}
</style>
