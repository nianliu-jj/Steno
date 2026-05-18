<script setup lang="ts">
// 浮窗速记顶层视图（mode === 'floating'）。
//
// 数据流：
//   用户输入 → useAutosave 1000ms debounce → db.saveTextEntry → SQLite
//                                                  ↓ 第一次保存生成 id
//                                              currentNoteId 记下来
//                                                  ↓
//   每次保存成功 → emit `library://refresh-main-list` 通知主窗口刷新列表
//
// 关闭语义（多入口区分）：
//   - 显式"保存"按钮：要求 title 非空 → flushSave → hide + reset，下次 Skip
//     模式唤起会得到空白窗口（已显式提交完成）。
//   - X 按钮 / 失焦 / 快捷键切换隐藏：flushSave → hide，**保留前端 state**。
//     下次快捷键 Skip 模式唤起仍能看到上次未"显式保存"的内容。
//   - 主页"速记"按钮 / 托盘"新笔记"：Rust 端发 Reset 模式，emit hydrate(null)
//     → hydrateFromEntry 触发 resetState，得到全新窗口。
//   - 双击主页文本卡片：Rust 端发 Entry(id) 模式，emit hydrate(id) → 加载该
//     entry 进入编辑。
//
// 标题编辑：默认 readonly，点铅笔图标解锁，输入框失焦或再次点击图标自动
// flushSave 同步到主页列表。
import { computed, nextTick, onMounted, onUnmounted, ref, unref, watch } from 'vue';
import { NButton, NIcon, NInput, NText, useMessage, type InputInst } from 'naive-ui';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';

import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { useAutosave } from '@/composables/useAutosave';
import { useDb } from '@/composables/useDb';
import { useMarkdown } from '@/composables/useMarkdown';
import { useWindow } from '@/composables/useWindow';
import { useLibraryStore } from '@/stores/library';
import { useSettingsStore } from '@/stores/settings';
import type { EditorEntry, SaveTextEntryRequest } from '@/types/steno';

const REFRESH_EVENT = 'library://refresh-main-list';

const db = useDb();
const library = useLibraryStore();
const settings = useSettingsStore();
const win = useWindow();
const message = useMessage();
const { countWords } = useMarkdown();

const currentNoteId = ref<string | null>(null);
const title = ref('');
const content = ref('');
const tagsInput = ref('');
const isTitleEditing = ref(false);
const titleInputRef = ref<InputInst | null>(null);
/** hydrate（按 id 加载已有 entry）时短暂屏蔽 autosave watch，防止把刚加载的内容当成"用户编辑"再写一次。 */
const suppressSave = ref(false);

let blurTimer: ReturnType<typeof setTimeout> | undefined;
let unlistenFocus: (() => void) | undefined;
let unlistenHydrate: UnlistenFn | undefined;

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
  async (payload: SaveTextEntryRequest) => {
    const saved = await db.saveTextEntry(payload);
    if (!currentNoteId.value) {
      currentNoteId.value = saved.id;
    }
    // 通知主窗口刷新笔记列表，保证关闭浮窗后能立即看到新条目。
    void emit(REFRESH_EVENT);
  },
);

watch([title, content, tagsInput], () => {
  if (suppressSave.value) return;
  // plan 5.5：空内容不调度保存（后端兜底也会再判一次）。
  if (isEmpty.value && !currentNoteId.value) return;
  scheduleSave({
    id: currentNoteId.value ?? undefined,
    title: title.value || undefined,
    content: content.value,
    tags: tagsArray.value,
    groupId: unref(library.currentGroupId) ?? undefined,
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

// ----- 拖拽 + 失焦关闭 ------------------------------------------------

const dragUntil = ref(0);

async function onTitlebarPointerdown(e: PointerEvent) {
  if (e.button !== 0) return;
  // 阻止 textarea 抢焦点之类的副作用
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

/**
 * 主页面双击文本卡片重新进入编辑场景：Rust 端 emit `quicknote://hydrate`，
 * 携带 entry id（payload string）或 null（新建空白会话）。
 * 重置 → 加载 entry → 临时屏蔽 autosave watch，避免把刚 hydrate 的字段当成
 * 用户编辑触发一次冗余写库。
 */
async function hydrateFromEntry(entryId: string | null) {
  if (blurTimer) {
    clearTimeout(blurTimer);
    blurTimer = undefined;
  }
  if (!entryId) {
    resetState();
    return;
  }
  let entry: EditorEntry | null = null;
  try {
    entry = await db.getEditorEntry(entryId);
  } catch (err) {
    console.error('[floating] hydrate failed:', err);
    message.error(`加载笔记失败：${String(err)}`);
    return;
  }
  if (!entry || entry.kind !== 'text') {
    resetState();
    return;
  }
  suppressSave.value = true;
  currentNoteId.value = entry.id;
  title.value = entry.title ?? '';
  content.value = entry.content ?? '';
  tagsInput.value = (entry.tags ?? []).map(t => `#${t}`).join(' ');
  // 等 watcher 跑完当前同步队列再放开
  await Promise.resolve();
  suppressSave.value = false;
}

/**
 * 失焦 / X 关闭按钮 / 全局快捷键隐藏 路径汇合于此：flush 保存 → 隐藏窗口。
 * 注意：**不**重置前端 state，下次 Skip 模式唤起浮窗时仍能看到上次的内容。
 * 显式 reset 只在两条路径上发生：① 用户点"保存"按钮显式提交 ② 主页"速记"
 * 或托盘"新笔记"触发 Reset hydrate 事件。
 */
async function saveAndDismiss(): Promise<void> {
  // 内容被清空但已存在隐式草稿条目：从列表里删除该条目，避免留下空记录。
  if (isEmpty.value && currentNoteId.value) {
    const idToDelete = currentNoteId.value;
    try {
      await db.deleteNote(idToDelete);
    } catch (err) {
      console.error('[floating] delete empty draft failed:', err);
    }
    void emit(REFRESH_EVENT);
    resetState();
    await win.hideCurrent();
    return;
  }
  if (isEmpty.value && !currentNoteId.value) {
    await win.hideCurrent();
    return;
  }
  await flushSave();
  if (status.value === 'error') {
    return;
  }
  await win.hideCurrent();
}

/**
 * 显式"保存"按钮：要求 title 非空（用户主动归档时必须给一个标题），保存完毕
 * 后隐藏并 reset，让下次 Skip 唤起得到空白窗口。
 */
async function onExplicitSaveClick() {
  if (!title.value.trim()) {
    message.warning('请填写标题后再保存');
    isTitleEditing.value = true;
    await nextTick();
    titleInputRef.value?.focus();
    return;
  }
  isTitleEditing.value = false;
  if (isEmpty.value && !currentNoteId.value) {
    // title 已校验非空，理论不会进入此分支；这里只是兜底。
    await win.hideCurrent();
    return;
  }
  await flushSave();
  if (status.value === 'error') {
    return;
  }
  await win.hideCurrent();
  resetState();
}

async function onEditTitleClick() {
  if (isTitleEditing.value) {
    isTitleEditing.value = false;
    await flushSave();
    return;
  }
  isTitleEditing.value = true;
  await nextTick();
  titleInputRef.value?.focus();
}

async function onTitleBlur() {
  if (!isTitleEditing.value) return;
  isTitleEditing.value = false;
  // 仅在非空草稿场景下 flush；空草稿继续由 saveAndDismiss 兜底。
  if (!(isEmpty.value && !currentNoteId.value)) {
    await flushSave();
  }
}

onMounted(async () => {
  unlistenHydrate = await listen<string | null>('quicknote://hydrate', event => {
    void hydrateFromEntry(event.payload ?? null);
  });
  unlistenFocus = await win.onCurrentWindowFocusChange(focused => {
    if (focused) {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = undefined;
      }
      return;
    }
    // 拖动握手期内的失焦忽略
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
  unlistenHydrate?.();
  // 守护：组件被卸载（webview 真正销毁）之前再 flush 一次
  void flushSave();
});

// ----- 关闭 / 置顶 -----------------------------------------------------

async function onCloseClick() {
  await saveAndDismiss();
}

/**
 * 当前 quicknote 已改为 `text` 存储，旧的 StickyNote 仍只支持 legacy notes。
 * 在便签链路完成迁移前，这里给出明确提示，避免静默失败。
 */
async function onPinClick() {
  message.warning('速记文本暂不支持直接置顶为便签');
}
</script>

<template>
  <div class="floating-root">
    <header
      class="floating-titlebar"
      @pointerdown="onTitlebarPointerdown"
    >
      <NInput
        ref="titleInputRef"
        v-model:value="title"
        size="tiny"
        placeholder="无标题"
        :bordered="false"
        :readonly="!isTitleEditing"
        class="floating-title-input"
        :class="{ 'floating-title-input--editing': isTitleEditing }"
        @pointerdown.stop
        @blur="onTitleBlur"
      />
      <NButton
        quaternary
        circle
        size="tiny"
        :title="isTitleEditing ? '完成编辑标题' : '编辑标题'"
        class="floating-title-edit"
        :class="{ 'floating-title-edit--active': isTitleEditing }"
        @pointerdown.stop
        @click="onEditTitleClick"
      >
        <template #icon>
          <NIcon>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path
                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0L15.13 5.13l3.75 3.75 1.83-1.84z"
              />
            </svg>
          </NIcon>
        </template>
      </NButton>
      <div class="floating-titlebar-actions">
        <NButton
          quaternary
          circle
          size="tiny"
          title="置顶为便签"
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
          title="保存到笔记列表"
          @pointerdown.stop
          @click="onExplicitSaveClick"
        >
          <template #icon>
            <NIcon>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M17 3H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
              </svg>
            </NIcon>
          </template>
        </NButton>
        <NButton
          quaternary
          circle
          size="tiny"
          title="关闭（保留草稿）"
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
  cursor: default;
}
.floating-title-input--editing :deep(input) {
  cursor: text;
}
.floating-title-edit {
  flex-shrink: 0;
}
.floating-title-edit--active {
  color: var(--app-accent, #8b6cff);
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
