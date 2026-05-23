<script setup lang="ts">
// 浮窗 / 便签双模式顶层视图。
//
// 两种模式由 `props.noteId` 决定：
//   - quicknote 模式（props.noteId == null）：单例 quick-capture 浮窗。
//     标题与标签是 NInput 直接编辑；失焦/关闭 → flushSave → hide + reset；
//     置顶按钮 → pin + 创建独立便签窗口，然后 hide quicknote。
//   - sticky 模式（props.noteId 非空）：每条置顶笔记一个独立 webview。
//     mount 时按 noteId 从 SQLite hydrate；
//     标题与标签默认以只读文本展示，旁侧编辑按钮切换 NInput；
//     失焦不自动关闭；关闭 / 取消置顶 → flushSave → unpin + closeStickyNote。
//
// 跨窗口同步：autosave 成功后 emit `steno:note-saved`，MainView 监听后调用
// syncExternalNote 让笔记列表卡片实时更新（包括标题/标签/内容）。
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { NButton, NIcon, NInput, NText, useMessage } from 'naive-ui';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { useAppEvents } from '@/composables/useAppEvents';
import { useAutosave } from '@/composables/useAutosave';
import { useDb } from '@/composables/useDb';
import { useMarkdown } from '@/composables/useMarkdown';
import { useWindow } from '@/composables/useWindow';
import { useNotesStore } from '@/stores/notes';
import { useSettingsStore } from '@/stores/settings';
import type { SaveNoteRequest } from '@/types/steno';
import { QUICKNOTE_DRAFT_ID } from '@/types/steno';

const props = withDefaults(defineProps<{
  noteId?: string | null;
}>(), {
  noteId: null,
});

const notes = useNotesStore();
const settings = useSettingsStore();
const win = useWindow();
const db = useDb();
const appEvents = useAppEvents();
const message = useMessage();
const { countWords } = useMarkdown();

const isSticky = computed(() => !!props.noteId);

// quicknote 模式下"已锁定"开关——pin 按钮 toggle 后不再失焦关闭。
const quicknotePinned = ref(false);

const currentNoteId = ref<string | null>(props.noteId ?? null);
const title = ref('');
const content = ref('');
const tagsInput = ref('');
const loaded = ref(!isSticky.value);

const titleEditing = ref(false);
const titleDraft = ref('');
const titleInputRef = ref<{ focus: () => void } | null>(null);

const tagsEditing = ref(false);
const tagsDraft = ref('');
const tagsInputRef = ref<{ focus: () => void } | null>(null);

const tagsArray = computed(() => parseTags(tagsInput.value));

function parseTags(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return Array.from(
    new Set(
      trimmed
        .split(/[,，\s]+/)
        .map(t => t.replace(/^#/, '').toLowerCase().trim())
        .filter(Boolean),
    ),
  );
}

const wordCount = computed(() => countWords(content.value));

const isEmpty = computed(
  () => !title.value.trim() && !content.value.trim() && tagsArray.value.length === 0,
);

// ----- 自动保存 -------------------------------------------------------

const { status, savedAt, error, scheduleSave, flushSave } = useAutosave(
  async (payload: SaveNoteRequest) => {
    const saved = await notes.saveDraft(payload);
    if (!saved) return;
    if (!currentNoteId.value) currentNoteId.value = saved.id;
    void appEvents.emitNoteSaved(saved);
  },
);

watch([title, content, tagsInput], () => {
  if (!loaded.value) return;
  if (isEmpty.value && !currentNoteId.value) return;
  if (isSticky.value) {
    scheduleSave({
      id: currentNoteId.value ?? undefined,
      title: title.value || undefined,
      content: content.value,
      tags: tagsArray.value,
    });
    return;
  }
  // quicknote 模式：固定写 quicknote-draft 单条记录并打 is_draft 标记，
  // 这样关闭浮窗或退出应用后下次仍能从同一行 hydrate。
  scheduleSave({
    id: QUICKNOTE_DRAFT_ID,
    title: title.value || undefined,
    content: content.value,
    tags: tagsArray.value,
    isDraft: true,
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

const pinButtonTitle = computed(() => {
  if (isSticky.value) return '取消置顶并关闭';
  return quicknotePinned.value ? '取消置顶' : '置顶为便签';
});

const displayTitle = computed(() => title.value.trim() || '无标题');
const displayTags = computed(() => {
  const tags = tagsArray.value;
  if (tags.length === 0) return '点击编辑标签';
  return tags.map(t => `#${t}`).join(' ');
});

// ----- 标题编辑 -------------------------------------------------------

async function onStartTitleEdit() {
  titleDraft.value = title.value;
  titleEditing.value = true;
  await nextTick();
  titleInputRef.value?.focus();
}

function onCancelTitleEdit() {
  titleDraft.value = '';
  titleEditing.value = false;
}

function onSaveTitle() {
  const next = titleDraft.value.trim();
  titleEditing.value = false;
  if (next === title.value) return;
  title.value = next;
}

// ----- 标签编辑 -------------------------------------------------------

async function onStartTagsEdit() {
  tagsDraft.value = tagsInput.value;
  tagsEditing.value = true;
  await nextTick();
  tagsInputRef.value?.focus();
}

function onCancelTagsEdit() {
  tagsDraft.value = '';
  tagsEditing.value = false;
}

function onSaveTags() {
  const next = tagsDraft.value;
  tagsEditing.value = false;
  if (next === tagsInput.value) return;
  tagsInput.value = next;
}

// ----- 拖拽 + 失焦关闭 ------------------------------------------------

const dragUntil = ref(0);

async function onTitlebarPointerdown(e: PointerEvent) {
  if (e.button !== 0) return;
  if ((e.target as HTMLElement | null)?.closest('button, input, [contenteditable]')) return;
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
  titleEditing.value = false;
  tagsEditing.value = false;
}

async function dismissSticky() {
  if (!currentNoteId.value) {
    await win.closeCurrent();
    return;
  }
  await flushSave();
  if (status.value === 'error') return;
  try {
    const updated = await notes.unpinNote(currentNoteId.value);
    void appEvents.emitNoteSaved(updated);
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
  // 草稿持久化策略：
  // - 内存白板（currentNoteId 为 null 且 isEmpty）：什么都没有，直接 hide，不动 db；
  // - 用户主动清空了 quicknote-draft（currentNoteId 命中草稿且 isEmpty）：顺手把 db 行清掉，
  //   下次打开浮窗就是干净状态；
  // - 其它（有内容）：flushSave 保留到 db，下次打开浮窗 / 重启应用都能恢复。
  if (currentNoteId.value === null && isEmpty.value) {
    await win.hideCurrent();
    resetState();
    return;
  }
  if (currentNoteId.value === QUICKNOTE_DRAFT_ID && isEmpty.value) {
    try {
      await db.deleteNote(QUICKNOTE_DRAFT_ID);
      void appEvents.emitNoteRemoved({ id: QUICKNOTE_DRAFT_ID });
    } catch {
      // 草稿原本就不存在时 deleteNote 不抛错，这里 catch 兜底其他偶发情况。
    }
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
let unlistenOpen: UnlistenFn | undefined;

async function hydrateDraftFromDb(): Promise<boolean> {
  try {
    const draft = await db.getNote(QUICKNOTE_DRAFT_ID);
    if (!draft) return false;
    currentNoteId.value = draft.id;
    title.value = draft.title === '未命名' ? '' : draft.title;
    content.value = draft.content;
    tagsInput.value = draft.tags.map(t => `#${t}`).join(' ');
    return true;
  } catch (e) {
    console.error('[quicknote] hydrate draft failed:', e);
    return false;
  }
}

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

  // quicknote 路径：先尝试从 SQLite 拉上次未保存的草稿；存在则回填 UI。
  await hydrateDraftFromDb();
  loaded.value = true;

  unlistenFocus = await win.onCurrentWindowFocusChange(focused => {
    if (focused) {
      // 浮窗单例 hide / show 复用同一组件实例，onMounted 不会再触发；
      // 这里在窗口被激活时按需重新 hydrate，让用户在 close → open 之间
      // 仍能看到上一次未保存的草稿。
      // 只有"内存白板"（dismissQuicknote 后 resetState 留下的空态）才补 hydrate，
      // 否则可能覆盖用户正在编辑的内容。
      if (currentNoteId.value === null && isEmpty.value) {
        void hydrateDraftFromDb();
      }
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = undefined;
      }
      return;
    }
    if (Date.now() < dragUntil.value) return;
    if (quicknotePinned.value) return;
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      blurTimer = undefined;
      void saveAndDismiss();
    }, settings.state.blurCloseDelayMs);
  });

  if (!isSticky.value) {
    // 后端 show() 每次触发都 emit；fresh=true 表示"新建速记"按钮入口，
    // 此刻 MainView 侧已经 deleteNote 掉旧草稿，这里只需把 UI 重置成空白。
    unlistenOpen = await listen<{ fresh: boolean }>('quicknote:open', ({ payload }) => {
      if (payload.fresh) {
        resetState();
      }
    });
  }
});

onUnmounted(() => {
  if (blurTimer) clearTimeout(blurTimer);
  unlistenFocus?.();
  unlistenOpen?.();
  void flushSave();
});

// ----- 关闭 / 置顶 -----------------------------------------------------

async function nextUntitledName(): Promise<string> {
  const base = '未命名';
  try {
    const existing = await db.listNotes(1000);
    const titles = new Set(existing.map(n => n.title));
    if (!titles.has(base)) return base;
    let i = 1;
    while (titles.has(`${base}${i}`)) i++;
    return `${base}${i}`;
  } catch (e) {
    console.error('[floating] list notes failed:', e);
    return base;
  }
}

async function onSaveClick() {
  if (!content.value.trim()) {
    message.warning('笔记内容为空，无法保存');
    return;
  }
  if (!title.value.trim()) {
    title.value = await nextUntitledName();
  }
  // 先把当前编辑落到 quicknote-draft 行，再原子地把它提升为正式笔记：
  // 分配新 UUID + 清掉 is_draft 标记 + 删掉草稿。
  await flushSave();
  if (status.value === 'error') return;
  if (isSticky.value) return;
  try {
    const promoted = await db.promoteQuicknoteDraft();
    if (promoted) {
      currentNoteId.value = promoted.id;
      notes.syncExternalNote(promoted);
      void appEvents.emitNoteSaved(promoted);
      void appEvents.emitNoteRemoved({ id: QUICKNOTE_DRAFT_ID });
      message.success('笔记已保存');
      await win.hideCurrent();
      resetState();
    }
  } catch (e) {
    console.error('[quicknote] promote draft failed:', e);
    message.error(`保存失败：${String(e)}`);
  }
}

async function onCloseClick() {
  if (isSticky.value) {
    await dismissSticky();
    return;
  }
  await dismissQuicknote();
}

async function onPinClick() {
  if (isSticky.value) {
    await dismissSticky();
    return;
  }
  // quicknote 模式：toggle 锁定状态，禁用 / 恢复失焦关闭。
  quicknotePinned.value = !quicknotePinned.value;
  if (quicknotePinned.value && blurTimer) {
    clearTimeout(blurTimer);
    blurTimer = undefined;
  }
}
</script>

<template>
  <div class="floating-root">
    <header
      class="floating-titlebar"
      @pointerdown="onTitlebarPointerdown"
    >
      <span
        v-if="!titleEditing"
        class="floating-title-readonly"
        :class="{ 'floating-title-empty': !title.trim() }"
        data-testid="floating-title-text"
        @click="onStartTitleEdit"
      >
        {{ displayTitle }}
      </span>
      <NInput
        v-else
        ref="titleInputRef"
        v-model:value="titleDraft"
        size="tiny"
        placeholder="无标题"
        :bordered="false"
        class="floating-title-input"
        data-testid="floating-title-input"
        @pointerdown.stop
        @keydown.enter.prevent="onSaveTitle"
        @keydown.esc.prevent="onCancelTitleEdit"
        @blur="onSaveTitle"
      />
      <NButton
        quaternary
        circle
        size="tiny"
        :title="titleEditing ? '保存标题' : '编辑标题'"
        :data-testid="titleEditing ? 'floating-title-save' : 'floating-title-edit'"
        class="floating-title-action"
        @pointerdown.stop
        @click="titleEditing ? onSaveTitle() : onStartTitleEdit()"
      >
        <template #icon>
          <NIcon>
            <svg
              v-if="titleEditing"
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="currentColor"
            >
              <path d="m9 16.17-3.88-3.88a.996.996 0 1 0-1.41 1.41l4.59 4.59c.39.39 1.02.39 1.41 0L21.7 6.7a.996.996 0 1 0-1.41-1.41z" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="currentColor"
            >
              <path d="M3 17.46V21h3.54l10.4-10.4-3.54-3.54L3 17.46zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.54 3.54 2.04-2.04z" />
            </svg>
          </NIcon>
        </template>
      </NButton>
      <div class="floating-titlebar-actions">
        <NButton
          quaternary
          circle
          size="tiny"
          title="保存笔记"
          data-testid="floating-save"
          @pointerdown.stop
          @click="onSaveClick"
        >
          <template #icon>
            <NIcon>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
              </svg>
            </NIcon>
          </template>
        </NButton>
        <NButton
          quaternary
          circle
          size="tiny"
          :title="pinButtonTitle"
          :class="{ 'pin-active': !isSticky && quicknotePinned }"
          data-testid="floating-pin"
          @pointerdown.stop
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
          title="关闭浮窗"
          data-testid="floating-close"
          @pointerdown.stop
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
      <span
        v-if="!tagsEditing"
        class="floating-tags-readonly"
        :class="{ 'floating-tags-empty': tagsArray.length === 0 }"
        data-testid="floating-tags-text"
        @click="onStartTagsEdit"
      >
        {{ displayTags }}
      </span>
      <NInput
        v-else
        ref="tagsInputRef"
        v-model:value="tagsDraft"
        size="tiny"
        :bordered="false"
        placeholder="#tag1 #tag2"
        class="floating-tags-input"
        data-testid="floating-tags-input"
        @keydown.enter.prevent="onSaveTags"
        @keydown.esc.prevent="onCancelTagsEdit"
        @blur="onSaveTags"
      />
      <NButton
        quaternary
        circle
        size="tiny"
        :title="tagsEditing ? '保存标签' : '编辑标签'"
        :data-testid="tagsEditing ? 'floating-tags-save' : 'floating-tags-edit'"
        class="floating-tags-action"
        @click="tagsEditing ? onSaveTags() : onStartTagsEdit()"
      >
        <template #icon>
          <NIcon>
            <svg
              v-if="tagsEditing"
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="currentColor"
            >
              <path d="m9 16.17-3.88-3.88a.996.996 0 1 0-1.41 1.41l4.59 4.59c.39.39 1.02.39 1.41 0L21.7 6.7a.996.996 0 1 0-1.41-1.41z" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="currentColor"
            >
              <path d="M3 17.46V21h3.54l10.4-10.4-3.54-3.54L3 17.46zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.54 3.54 2.04-2.04z" />
            </svg>
          </NIcon>
        </template>
      </NButton>
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

.floating-title-readonly {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: #e8e8ea;
  cursor: text;
}

.floating-title-empty {
  color: #6f6f78;
  font-weight: 500;
  font-style: italic;
}

.floating-title-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  font-size: 12px;
  color: #cfcfd4;
}
.floating-title-input :deep(input) {
  font-size: 12px;
}

.floating-title-action {
  flex: 0 0 auto;
  color: #8a8a92 !important;
}

.floating-titlebar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  margin-left: auto;
}

.pin-active :deep(svg) {
  color: #ff8a4c;
}

.floating-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 浮窗 / 便签是固定暗色容器，给 CodeMirror 编辑器适配深色背景。 */
.floating-body :deep(.cm-editor) {
  font-size: 13px;
}
.floating-body :deep(.cm-scroller) {
  padding: 8px 12px;
}
.floating-body :deep(.cm-placeholder) {
  color: rgba(180, 180, 184, 0.55);
}
.floating-body :deep(.cm-md-inline-code) {
  background: rgba(255, 255, 255, 0.12);
}
.floating-body :deep(.cm-md-quote) {
  border-left-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(220, 220, 224, 0.86);
}
.floating-body :deep(.cm-md-link) {
  color: #60a5fa;
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

.floating-tags-readonly {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: #cfcfd4;
  cursor: text;
}

.floating-tags-empty {
  color: #6f6f78;
  font-style: italic;
}

.floating-tags-input {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 60%;
  font-size: 11px;
}
.floating-tags-input :deep(input) {
  font-size: 11px;
}

.floating-tags-action {
  flex: 0 0 auto;
  color: #8a8a92 !important;
}

.floating-footer-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #6f6f78;
  white-space: nowrap;
  margin-left: auto;
}
.floating-meta-item {
  font-size: 11px;
}
.floating-meta-error {
  color: #ff6b6b;
}
</style>
