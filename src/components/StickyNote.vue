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
// - 样式工具栏（opacity / color / fontSize）→ 300ms debounce → notes.updatePinnedConfig
// - 取消置顶按钮 → setNotePinned(id, false) + close 当前窗口
//
// 窗口本身由 window_manager::open_sticky_note 创建（transparent + always_on_top +
// skip_taskbar + decorations=false），尺寸/位置在前端 mount 时按 config 调整。
import { computed, onMounted, ref, watch } from 'vue';
import { NButton, NColorPicker, NIcon, NInput, NPopselect, NSlider } from 'naive-ui';

import MarkdownEditor from '@/components/MarkdownEditor.vue';
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
const { renderHtml } = useMarkdown();

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
const title = ref('');
const content = ref('');
const tags = ref<string[]>([]);
const config = ref<PinnedWindowConfig>({ ...DEFAULT_CONFIG });

const renderedHtml = computed(() => renderHtml(content.value));

// ----- 内容自动保存 ---------------------------------------------------

const contentSave = useAutosave(async (payload: SaveNoteRequest) => {
  await notes.saveDraft(payload);
});

watch([title, content], () => {
  if (!loaded.value) return;
  contentSave.scheduleSave({
    id: props.noteId,
    title: title.value || undefined,
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
  await contentSave.flushSave();
  await win.hideCurrent();
}

// ----- CSS 样式绑定 ----------------------------------------------------

const rootStyle = computed(() => ({
  '--sticky-bg': config.value.color,
  '--sticky-opacity': String(config.value.opacity),
  '--sticky-font-size': `${config.value.fontSize}px`,
}));

const COLOR_PRESETS = [
  '#fff7cc',
  '#ffd6cc',
  '#ccf2ff',
  '#d4ffcc',
  '#ead4ff',
  '#f0f0f0',
];
</script>

<template>
  <div class="sticky-root" :style="rootStyle">
    <header class="sticky-header" @pointerdown="onHeaderPointerdown">
      <NInput
        v-model:value="title"
        size="tiny"
        placeholder="无标题"
        :bordered="false"
        class="sticky-title"
        @pointerdown.stop
      />
      <div class="sticky-actions">
        <NButton
          quaternary
          circle
          size="tiny"
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
          <button class="sticky-styler-btn" title="字号">
            A
          </button>
        </NPopselect>
        <div class="sticky-color-picker">
          <NColorPicker
            v-model:value="config.color"
            :show-alpha="false"
            :swatches="COLOR_PRESETS"
            size="small"
          />
        </div>
        <div class="sticky-opacity">
          <NSlider
            v-model:value="config.opacity"
            :min="0.5"
            :max="1"
            :step="0.05"
            :tooltip="false"
          />
        </div>
      </div>
      <button
        v-if="editing"
        class="sticky-done-btn"
        title="完成编辑"
        @click="exitEdit"
      >
        完成
      </button>
    </footer>
  </div>
</template>

<style scoped>
.sticky-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--sticky-bg);
  color: #2a2a2a;
  border-radius: 6px;
  overflow: hidden;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  /* opacity 作用于整窗（包括 transparent 出来的圆角阴影），便于"轻便签"观感 */
  opacity: var(--sticky-opacity);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
}

.sticky-header {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 22px;
  padding: 0 4px 0 8px;
  -webkit-user-select: none;
  user-select: none;
  cursor: grab;
}
.sticky-header:active {
  cursor: grabbing;
}
.sticky-title {
  flex: 1;
  background: transparent;
}
.sticky-title :deep(input) {
  font-size: 12px;
  color: #444;
}
.sticky-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  color: #444;
}

.sticky-content {
  flex: 1;
  min-height: 0;
  font-size: var(--sticky-font-size);
  line-height: 1.55;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.sticky-content--editing {
  background: rgba(255, 255, 255, 0.4);
}

.sticky-preview {
  flex: 1;
  padding: 4px 12px 6px;
  overflow: auto;
  color: #2a2a2a;
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
  background: rgba(0, 0, 0, 0.08);
  padding: 1px 4px;
  border-radius: 3px;
}
.sticky-preview :deep(pre) {
  background: rgba(0, 0, 0, 0.08);
  padding: 6px 8px;
  border-radius: 4px;
  overflow: auto;
  font-size: calc(var(--sticky-font-size) * 0.9);
}
.sticky-preview :deep(blockquote) {
  margin: 4px 0;
  padding-left: 8px;
  border-left: 2px solid rgba(0, 0, 0, 0.2);
  color: #555;
}
.sticky-preview :deep(ul),
.sticky-preview :deep(ol) {
  margin: 2px 0;
  padding-left: 1.4em;
}

.sticky-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 6px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}
.sticky-styler {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}
.sticky-styler-btn {
  width: 20px;
  height: 18px;
  font-size: 12px;
  font-weight: 700;
  background: transparent;
  color: #444;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}
.sticky-styler-btn:hover {
  background: rgba(0, 0, 0, 0.08);
}
.sticky-color-picker {
  width: 28px;
}
.sticky-color-picker :deep(.n-color-picker) {
  width: 100%;
}
.sticky-color-picker :deep(.n-color-picker-trigger) {
  height: 16px;
  min-height: 16px;
}
.sticky-opacity {
  flex: 1;
  min-width: 50px;
  display: flex;
  align-items: center;
}

.sticky-done-btn {
  height: 18px;
  padding: 0 8px;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.08);
  color: #2a2a2a;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}
.sticky-done-btn:hover {
  background: rgba(0, 0, 0, 0.16);
}
</style>
