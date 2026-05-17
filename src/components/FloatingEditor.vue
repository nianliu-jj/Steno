<script setup lang="ts">
// 浮窗速记顶层视图（mode === 'floating'）。
//
// 数据流：
//   用户输入 → useAutosave 1000ms debounce → notes.saveDraft → SQLite
//                                                  ↓ 第一次保存生成 id
//                                              currentNoteId 记下来
//                                                  ↓
//   失焦 (blurCloseDelayMs 后) / 关闭按钮 / 置顶按钮 → flushSave → hide + reset
//
// 关闭语义：浮窗是 "quick capture" 模型，每次唤出就是一次新会话。失焦/关闭后
// hide 当前窗口并把前端状态 reset 成空白，下次唤出就是新笔记。如果用户想继续
// 编辑某条笔记，在主界面打开它的 Sticky 或 Zen 视图。
//
// 空内容丢弃 (plan 5.5)：title/content/tags 都为空 且 currentNoteId 还是 null，
// 直接 hide 不调 save；后端 db.save_note 在收到空 payload 时也会再做一次防御
// （返回 None），双重保险。
//
// 拖动握手 (frontend-only)：startDragging 之后短暂的 focus loss 不能误触发
// blurCloseDelayMs 计时器。dragUntil 记一个 500ms 截止时间，blur 时若仍在
// 截止时间内就跳过，避免一拖窗就保存关闭。
import { computed, onMounted, onUnmounted, ref, unref, watch } from 'vue';
import { NButton, NIcon, NInput, NText, useMessage } from 'naive-ui';

import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { useAutosave } from '@/composables/useAutosave';
import { useDb } from '@/composables/useDb';
import { useMarkdown } from '@/composables/useMarkdown';
import { useWindow } from '@/composables/useWindow';
import { useLibraryStore } from '@/stores/library';
import { useSettingsStore } from '@/stores/settings';
import type { SaveTextEntryRequest } from '@/types/steno';

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
  },
);

watch([title, content, tagsInput], () => {
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
 * 失焦 / 关闭按钮 / pin 路径汇合于此：flush 保存 → 隐藏窗口 → 重置前端状态。
 * 空草稿直接 hide+reset 不保存；保存失败保留窗口让用户看错误。
 */
async function saveAndDismiss(): Promise<void> {
  if (isEmpty.value && !currentNoteId.value) {
    await win.hideCurrent();
    resetState();
    return;
  }
  await flushSave();
  if (status.value === 'error') {
    return;
  }
  await win.hideCurrent();
  resetState();
}

let blurTimer: ReturnType<typeof setTimeout> | undefined;
let unlistenFocus: (() => void) | undefined;

onMounted(async () => {
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
          title="置顶为便签"
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
          title="保存并关闭"
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
