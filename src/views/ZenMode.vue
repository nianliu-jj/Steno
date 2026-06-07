<script setup lang="ts">
/**
 * @component ZenMode
 * @description Zen 写作窗口顶层视图（`mode === 'zen'`）。
 *
 * **布局**：
 * - 头部栏：左侧标题（含编辑按钮），右侧导出 / 退出按钮
 * - 编辑区：全宽 CodeMirror 6 编辑器（`MarkdownEditor`），背景透明沉浸式
 * - 底部栏：左侧标签列表，右侧字数 + 保存状态
 * - 大纲：右下角 FAB 按钮，点击弹出大纲面板
 *
 * **数据流**：
 * - mount：若 `ui.noteId` 或 `?id=` 存在则从 SQLite hydrate；否则空白草稿
 * - 自动保存：`useAutosave` 1000ms 防抖
 * - Esc / 退出按钮 → `flushSave` + `ui.exitZen()`
 *
 * **返回逻辑**：`exitZen()` 通过 `ui.zenReturnMode` 回到进入前的页面
 * （如从 Canvas 双击进入 → 退出后回到 Canvas）。
 */

import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { NDropdown, NInput, NText, useMessage } from 'naive-ui';

import DocumentOutlineTree from '@/components/DocumentOutlineTree.vue';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { useDb } from '@/composables/useDb';
import { useMarkdown } from '@/composables/useMarkdown';
import { useMarkdownOutline } from '@/composables/useMarkdownOutline';
import { useWritingSession } from '@/composables/useWritingSession';
import { useUiStore } from '@/stores/ui';

const db = useDb();
const ui = useUiStore();
const { countWords } = useMarkdown();
const { buildOutline } = useMarkdownOutline();
const message = useMessage();
const session = useWritingSession(ref(ui.noteId ?? readIdFromUrl()));

// 标题/正文/标签直接复用 writing session 的响应式状态（与 NoteEditorView 一致），
// 这样进入 Zen 时能回显当前笔记内容，且编辑会写回同一笔记。
const title = session.title;
const content = session.content;
const tags = session.tags;

const titleEditing = ref(false);
const titleInputRef = ref<{ focus: () => void } | null>(null);
const outlineOpen = ref(false);

const wordCount = computed(() => countWords(content.value));
const isEmpty = computed(
    () => !session.title.value.trim() && !session.content.value.trim() && session.tags.value.length === 0,
);
const outlineNodes = computed(() => buildOutline(content.value));
const displayTitle = computed(() => title.value.trim() || '无标题');

// ----- 启动加载 -------------------------------------------------------

function readIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search.replace(/^\?/, ''));
  return params.get('id');
}

const statusText = computed(() => {
  switch (session.status.value) {
    case 'idle':
      return '';
    case 'scheduled':
      return '编辑中…';
    case 'saving':
      return '保存中…';
    case 'saved':
      return session.savedAt.value
          ? `已保存 ${session.savedAt.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
          : '已保存';
    case 'error':
      return `保存失败：${String(session.error.value).slice(0, 40)}`;
    default:
      return '';
  }
});

// ----- 标题编辑 -------------------------------------------------------

async function onStartTitleEdit() {
  titleEditing.value = true;
  await nextTick();
  titleInputRef.value?.focus();
}

function onFinishTitleEdit() {
  titleEditing.value = false;
}

// ----- 退出（Esc / 关闭按钮） -----------------------------------------

async function exitZen() {
  if (!isEmpty.value || session.currentNoteId.value) {
    await session.flushSave();
    if (session.status.value === 'error') return; // 保留窗口让用户看错误
  }
  ui.exitZen();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    void exitZen();
  }
}

function onSelectOutline(node: { id: string }) {
  requestAnimationFrame(() => {
    document.getElementById(node.id)?.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    });
  });
}

// ----- 导出 ----------------------------------------------------------

const exportOptions = [
  { key: 'markdown', label: '导出为 Markdown' },
  { key: 'pdf', label: '导出为 PDF' },
];

async function onExport(key: string) {
  if (!session.currentNoteId.value) {
    message.warning('请先输入内容（保存后才能导出）');
    return;
  }
  await session.flushSave();
  if (session.status.value === 'error') {
    message.error('保存失败，已取消导出');
    return;
  }
  try {
    if (key === 'markdown') {
      const path = await db.exportNoteMarkdown(session.currentNoteId.value);
      message.success(`已导出：${path}`);
    } else {
      const path = await db.exportNotePdf(session.currentNoteId.value);
      message.success(`已导出：${path}`);
    }
  } catch (e) {
    message.error(String(e));
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  void session.flushSave();
});
</script>

<template>
  <div class="zen-root">
    <header class="zen-header" data-tauri-drag-region="true">
      <div class="zen-title-area" data-tauri-drag-region="true">
        <NInput
          v-if="titleEditing"
          ref="titleInputRef"
          v-model:value="title"
          :bordered="false"
          size="small"
          placeholder="标题"
          class="zen-title-input"
          data-testid="zen-title-input"
          data-tauri-drag-region="false"
          @blur="onFinishTitleEdit"
          @keydown.enter="onFinishTitleEdit"
        />
        <template v-else>
          <span
            class="zen-title-text"
            data-testid="zen-title-text"
            data-tauri-drag-region="true"
            :title="displayTitle"
          >{{ displayTitle }}</span>
        </template>
        <button
          type="button"
          class="zen-title-edit"
          data-testid="zen-title-edit"
          data-tauri-drag-region="false"
          :title="titleEditing ? '完成编辑' : '编辑标题'"
          :aria-label="titleEditing ? '完成编辑' : '编辑标题'"
          @click="titleEditing ? onFinishTitleEdit() : onStartTitleEdit()"
        >
          <svg
            v-if="titleEditing"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
        </button>
      </div>
      <div class="zen-actions" data-tauri-drag-region="false">
        <NDropdown
          :options="exportOptions"
          trigger="click"
          @select="onExport"
        >
          <button class="zen-export" title="导出" data-tauri-drag-region="false">↓</button>
        </NDropdown>
        <button
          class="zen-exit"
          title="返回主界面 (Esc)"
          data-tauri-drag-region="false"
          @click="exitZen"
        >
          ✕
        </button>
      </div>
    </header>

    <div class="zen-stage">
      <div class="zen-paper">
        <div class="zen-body">
          <MarkdownEditor
            v-model="content"
            autofocus
            placeholder="开始写作… 按 Esc 返回主界面"
          />
        </div>
      </div>

      <button
        class="zen-outline-fab"
        type="button"
        data-testid="zen-outline-toggle"
        :aria-pressed="outlineOpen"
        :aria-label="outlineOpen ? '收起大纲' : '展开大纲'"
        :title="outlineOpen ? '收起大纲' : '展开大纲'"
        @click="outlineOpen = !outlineOpen"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="8" y1="6" x2="20" y2="6" />
          <line x1="8" y1="12" x2="20" y2="12" />
          <line x1="8" y1="18" x2="20" y2="18" />
          <circle cx="4" cy="6" r="1.4" />
          <circle cx="4" cy="12" r="1.4" />
          <circle cx="4" cy="18" r="1.4" />
        </svg>
      </button>

      <aside
        v-if="outlineOpen"
        class="zen-outline-panel"
        data-testid="zen-outline-panel"
      >
        <header class="zen-outline-panel__header">大纲</header>
        <DocumentOutlineTree
          :nodes="outlineNodes"
          @select="onSelectOutline"
        />
      </aside>
    </div>

    <footer class="zen-footer">
      <div class="zen-footer-tags" aria-label="标签">
        <span
          v-if="tags.length === 0"
          class="zen-tag-empty"
          data-testid="zen-tag-empty"
        >无标签</span>
        <template v-else>
          <span
            v-for="tag in tags"
            :key="tag"
            class="zen-tag"
            :title="`#${tag}`"
          >#{{ tag }}</span>
        </template>
      </div>
      <div class="zen-footer-meta">
        <NText depth="3" class="zen-meta-item">{{ wordCount }} 字</NText>
        <NText
          depth="3"
          class="zen-meta-item"
          :class="{ 'zen-meta-error': session.status.value === 'error' }"
        >
          {{ statusText }}
        </NText>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.zen-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #14141a;
  color: #e8e8ea;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.zen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 36px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.zen-title-area {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 0 1 auto;
}

.zen-title-text {
  display: inline-block;
  max-width: 480px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  color: #f0f0f2;
}

.zen-title-input {
  width: 320px;
  font-size: 14px;
  color: #f0f0f2;
}
.zen-title-input :deep(input) {
  font-size: 14px;
  font-weight: 600;
  color: #f0f0f2 !important;
  -webkit-text-fill-color: #f0f0f2;
  background: transparent;
  padding: 0;
  caret-color: #f0f0f2;
}
.zen-title-input :deep(.n-input__placeholder),
.zen-title-input :deep(input::placeholder) {
  color: #6f6f78 !important;
}

.zen-title-edit {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: #8a8a92;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.12s, background 0.12s;
}
.zen-title-edit:hover {
  color: #f0f0f2;
  background: rgba(255, 255, 255, 0.06);
}

.zen-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}
.zen-export,
.zen-exit {
  width: 24px;
  height: 24px;
  background: transparent;
  color: #6f6f78;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 14px;
  transition: color 0.12s, background 0.12s;
}
.zen-export:hover,
.zen-exit:hover {
  color: #e8e8ea;
  background: rgba(255, 255, 255, 0.06);
}

.zen-stage {
  flex: 1;
  position: relative;
  display: flex;
  justify-content: center;
  padding: 24px 24px 24px;
  overflow: auto;
}

.zen-paper {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 1080px;
  min-height: 0;
}

.zen-outline-shell {
  flex: 1;
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  color: #f0f0f2;
}

/* 沉浸式编辑器：背景透明、字号略大、暗色光标 */
.zen-body :deep(.cm-editor) {
  background: transparent;
  font-size: 16px;
  line-height: 1.8;
  color: #f0f0f2;
}
.zen-body :deep(.cm-scroller) {
  padding: 8px 0;
}
.zen-body :deep(.cm-cursor),
.zen-body :deep(.cm-dropCursor) {
  border-left-color: #f0f0f2 !important;
  border-left-width: 2px;
}
.zen-body :deep(.cm-content) {
  caret-color: #f0f0f2;
}
.zen-body :deep(.cm-placeholder) {
  color: rgba(180, 180, 184, 0.55);
}
.zen-body :deep(.cm-md-inline-code) {
  background: rgba(255, 255, 255, 0.1);
}
.zen-body :deep(.cm-md-code-block) {
  background: rgba(255, 255, 255, 0.07);
  color: #f0f0f2;
}
.zen-body :deep(.cm-md-code-fence-line) {
  color: rgba(220, 220, 224, 0.72);
}
.zen-body :deep(.cm-md-code-fence-mark) {
  color: rgba(220, 220, 224, 0.42);
}
.zen-body :deep(.cm-md-quote) {
  border-left-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(220, 220, 224, 0.88);
}
.zen-body :deep(.cm-md-link) {
  color: #60a5fa;
}

.zen-outline-fab {
  position: absolute;
  right: 24px;
  bottom: 24px;
  z-index: 4;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(36, 36, 44, 0.92);
  color: #c8c8d2;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.zen-outline-fab:hover,
.zen-outline-fab:focus-visible {
  color: #f5f5f8;
  background: rgba(50, 50, 60, 0.96);
  border-color: rgba(255, 255, 255, 0.16);
}
.zen-outline-fab[aria-pressed="true"] {
  color: #f5f5f8;
  background: rgba(60, 60, 72, 0.98);
  border-color: rgba(255, 255, 255, 0.22);
}
.zen-outline-fab svg {
  pointer-events: none;
}

.zen-outline-panel {
  position: absolute;
  right: 24px;
  bottom: 72px;
  z-index: 3;
  width: 240px;
  max-height: calc(100% - 96px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(28, 28, 36, 0.96);
  overflow: auto;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
}

.zen-outline-panel__header {
  color: #b8b8c1;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.zen-outline-panel :deep(.outline-tree__button) {
  color: #d4d4dc;
}
.zen-outline-panel :deep(.outline-tree__button:hover) {
  color: #f5f5f8;
}
.zen-outline-panel :deep(.outline-tree__badge) {
  background: rgba(255, 255, 255, 0.08);
  color: #b8b8c1;
}

.zen-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 32px;
  padding: 0 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.zen-footer-tags {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: #b8b8c1;
  font-size: 11px;
  overflow: hidden;
}

.zen-tag,
.zen-tag-empty {
  flex-shrink: 0;
  line-height: 20px;
}

.zen-tag {
  max-width: 140px;
  overflow: hidden;
  padding: 0 7px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
}

.zen-tag-empty {
  color: #6f6f78;
  font-style: italic;
}

.zen-footer-meta {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 16px;
  color: #6f6f78;
  font-size: 11px;
  white-space: nowrap;
}

.zen-meta-item {
  font-size: 11px;
}

.zen-meta-error {
  color: #ff6b6b;
}
</style>
