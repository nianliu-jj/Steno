<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { useClipboardStore } from '@/stores/clipboard';
import { useWindow } from '@/composables/useWindow';
import type { ClipboardContentType, ClipboardEntry } from '@/types/steno';

const store = useClipboardStore();
const win = useWindow();
const pendingDeleteId = ref<string | null>(null);

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const filters: Array<{ label: string; value: ClipboardContentType | null; testid: string }> = [
  { label: '全部', value: null, testid: 'all' },
  { label: '文本', value: 'text', testid: 'text' },
  { label: '链接', value: 'url', testid: 'url' },
  { label: '代码', value: 'code', testid: 'code' },
  { label: '图片', value: 'image', testid: 'image' },
  { label: '文件', value: 'file', testid: 'file' },
  { label: '富文本', value: 'rich_text', testid: 'rich_text' },
];

const countLabel = computed(
  () => `共 ${store.filteredEntries.length} 条`,
);

onMounted(() => {
  void store.startEventListeners();
  void store.load();
});

onBeforeUnmount(() => {
  store.stopEventListeners();
});

function typeLabel(type: ClipboardContentType) {
  switch (type) {
    case 'url': return '链接';
    case 'code': return '代码';
    case 'image': return '图片';
    case 'file': return '文件';
    case 'rich_text': return '富文本';
    case 'text': return '文本';
  }
}

function contentSource(entry: ClipboardEntry): string {
  switch (entry.contentType) {
    case 'url': return '网页';
    case 'code': return '代码编辑器';
    case 'image': return '截图/图片';
    case 'file': return '文件管理器';
    case 'rich_text': return '富文本';
    case 'text': return '文本';
  }
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isModified(entry: ClipboardEntry): boolean {
  return entry.createdAt !== entry.updatedAt;
}

function isPinned(entry: ClipboardEntry): boolean {
  return !!entry.pinnedAt;
}

function previewText(entry: ClipboardEntry): string {
  return entry.preview || entry.content;
}

function fileName(entry: ClipboardEntry): string {
  const path = entry.content;
  const sep = path.lastIndexOf('/');
  const sep2 = path.lastIndexOf('\\');
  return path.slice(Math.max(sep, sep2) + 1);
}

function setFilter(value: ClipboardContentType | null) {
  store.typeFilter = value;
}

function requestDelete(id: string) {
  pendingDeleteId.value = id;
}

function cancelDelete() {
  pendingDeleteId.value = null;
}

async function confirmDelete(id: string) {
  await store.deleteEntry(id);
  if (pendingDeleteId.value === id) {
    pendingDeleteId.value = null;
  }
}

async function handleOpen(entry: ClipboardEntry) {
  try {
    switch (entry.contentType) {
      case 'text':
      case 'rich_text':
      case 'code':
        await win.openQuicknote({ fresh: true, initialContent: entry.content, clipboardContext: true, clipboardEntryId: entry.id });
        break;
      case 'url':
        await win.openUrl(entry.content);
        break;
      case 'image':
        await win.openUrl(entry.content);
        break;
      case 'file':
        await win.openPathInFileManager(entry.content);
        break;
    }
  } catch {
    // 静默处理：目标应用可能未安装
  }
}

async function handlePin(entry: ClipboardEntry) {
  try {
    if (isPinned(entry)) {
      await store.unpinEntry(entry.id);
    } else {
      await store.pinEntry(entry.id);
    }
  } catch {
    // 静默
  }
}

async function handleDoubleClick(entry: ClipboardEntry) {
  await store.pasteEntry(entry.id);
}
</script>

<template>
  <section class="clipboard-view">
    <header class="clipboard-toolbar">
      <div class="clipboard-title">
        <h1>粘贴板</h1>
        <p>{{ countLabel }}</p>
      </div>
      <label class="clipboard-search">
        <span>搜索</span>
        <input
          v-model="store.query"
          data-testid="clipboard-search"
          type="search"
          placeholder="搜索剪贴板内容"
        >
      </label>
    </header>

    <nav class="clipboard-filters" aria-label="剪贴板类型筛选">
      <button
        v-for="filter in filters"
        :key="filter.testid"
        class="clipboard-filter"
        :class="{ 'clipboard-filter--active': store.typeFilter === filter.value }"
        type="button"
        :data-testid="`clipboard-filter-${filter.testid}`"
        @click="setFilter(filter.value)"
      >
        {{ filter.label }}
      </button>
    </nav>

    <div v-if="store.error" class="clipboard-error" role="alert">
      {{ store.error }}
    </div>

    <div v-if="!store.loading && store.filteredEntries.length === 0" class="clipboard-empty">
      <strong>暂无剪贴板记录</strong>
      <span>复制文本、链接、代码、图片或文件路径后会显示在这里。</span>
    </div>

    <div v-else class="clipboard-list">
      <article
        v-for="entry in store.pagedEntries"
        :key="entry.id"
        class="clipboard-card"
        :class="{ 'clipboard-card--pinned': isPinned(entry) }"
        :data-type="entry.contentType"
        :data-testid="`clipboard-card-${entry.id}`"
      >
        <!-- 上：卡片头部栏 -->
        <header class="clipboard-card__header" :data-testid="`clipboard-card-header-${entry.id}`">
          <div class="clipboard-card__type">
            <span class="clipboard-type">{{ typeLabel(entry.contentType) }}</span>
            <span class="clipboard-source">{{ contentSource(entry) }}</span>
          </div>
          <div class="clipboard-card__header-actions">
            <template v-if="pendingDeleteId === entry.id">
              <span class="clipboard-confirm-text">确认删除？</span>
              <button
                class="clipboard-icon-button clipboard-icon-button--danger"
                type="button"
                :data-testid="`clipboard-delete-confirm-${entry.id}`"
                aria-label="确认删除"
                title="确认删除"
                @click.stop="confirmDelete(entry.id)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </button>
              <button
                class="clipboard-icon-button"
                type="button"
                :data-testid="`clipboard-delete-cancel-${entry.id}`"
                aria-label="取消删除"
                title="取消删除"
                @click.stop="cancelDelete"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </template>
            <button
              v-else
              class="clipboard-icon-button clipboard-icon-button--danger"
              type="button"
              :data-testid="`clipboard-delete-${entry.id}`"
              aria-label="删除"
              title="删除"
              @click.stop="requestDelete(entry.id)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M6 6l1 14h10l1-14" />
                <path d="M10 11v5M14 11v5" />
              </svg>
            </button>
          </div>
        </header>

        <!-- 中：卡片内容区 -->
        <div
          class="clipboard-card__content"
          :data-testid="`clipboard-card-content-${entry.id}`"
          @dblclick.stop="handleDoubleClick(entry)"
        >
          <template v-if="entry.contentType === 'image'">
            <img
              class="clipboard-image"
              :src="entry.content"
              alt="剪贴板图片预览"
            >
          </template>
          <template v-else-if="entry.contentType === 'file'">
            <div class="clipboard-file">
              <svg class="clipboard-file__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span class="clipboard-file__name" :title="entry.content">{{ fileName(entry) }}</span>
            </div>
          </template>
          <template v-else>
            <pre
              class="clipboard-preview"
              :class="{ 'clipboard-preview--code': entry.contentType === 'code' }"
            >{{ previewText(entry) }}</pre>
          </template>
        </div>

        <!-- 下：卡片底部栏 -->
        <footer class="clipboard-card__footer" :data-testid="`clipboard-card-footer-${entry.id}`">
          <div class="clipboard-card__footer-left">
            <time class="clipboard-time">{{ formatTime(entry.updatedAt) }}</time>
            <span v-if="isPinned(entry)" class="clipboard-pinned">已置顶</span>
            <span v-if="isModified(entry)" class="clipboard-modified">已修改</span>
          </div>
          <div
            class="clipboard-card__footer-actions"
            :data-testid="`clipboard-card-footer-actions-${entry.id}`"
          >
            <button
              class="clipboard-icon-button"
              type="button"
              :data-testid="`clipboard-open-${entry.id}`"
              aria-label="打开"
              title="打开"
              @click.stop="handleOpen(entry)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
            <button
              class="clipboard-icon-button"
              :class="{ 'clipboard-icon-button--active': isPinned(entry) }"
              type="button"
              :data-testid="`clipboard-pin-${entry.id}`"
              :aria-label="isPinned(entry) ? '取消置顶' : '置顶'"
              :title="isPinned(entry) ? '取消置顶' : '置顶'"
              @click.stop="handlePin(entry)"
            >
              <!-- 取消置顶：填充星号 -->
              <svg v-if="isPinned(entry)" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" fill="currentColor" stroke="none" />
              </svg>
              <!-- 置顶：描边星号 -->
              <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" />
              </svg>
            </button>
            <button
              class="clipboard-icon-button"
              type="button"
              :data-testid="`clipboard-copy-${entry.id}`"
              aria-label="复制"
              title="复制"
              @click.stop="store.copyEntry(entry.id)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 8h11v11H8z" />
                <path d="M5 16H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
              </svg>
            </button>
          </div>
        </footer>
      </article>
    </div>

    <!-- 分页栏 -->
    <footer v-if="store.filteredEntries.length > 0" class="clipboard-pagination">
      <div class="clipboard-pagination__info">
        <span>{{ store.filteredEntries.length }} 条记录</span>
        <label class="clipboard-page-size">
          每页
          <select
            :value="store.pageSize"
            data-testid="clipboard-page-size"
            @change="store.setPageSize(Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="size in PAGE_SIZE_OPTIONS" :key="size" :value="size">
              {{ size }}
            </option>
          </select>
          条
        </label>
      </div>
      <div class="clipboard-pagination__controls">
        <button
          class="clipboard-page-btn"
          type="button"
          :disabled="store.page <= 1"
          data-testid="clipboard-page-prev"
          @click="store.setPage(store.page - 1)"
        >
          ‹
        </button>
        <span class="clipboard-page-info">{{ store.page }} / {{ store.totalPages }}</span>
        <button
          class="clipboard-page-btn"
          type="button"
          :disabled="store.page >= store.totalPages"
          data-testid="clipboard-page-next"
          @click="store.setPage(store.page + 1)"
        >
          ›
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.clipboard-view {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  color: var(--app-fg);
}

.clipboard-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.clipboard-title h1,
.clipboard-title p {
  margin: 0;
}

.clipboard-title h1 {
  font-size: 18px;
  font-weight: 650;
}

.clipboard-title p {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 12px;
}

.clipboard-search {
  width: min(360px, 48vw);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
}

.clipboard-search span {
  color: var(--app-muted);
  font-size: 12px;
}

.clipboard-search input {
  flex: 1;
  min-width: 0;
  height: 32px;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
}

.clipboard-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.clipboard-filter {
  min-height: 30px;
  padding: 0 11px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-surface);
  color: var(--app-muted);
  cursor: pointer;
}

.clipboard-filter--active {
  border-color: var(--app-accent);
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.clipboard-empty,
.clipboard-error {
  margin: auto;
  display: grid;
  gap: 6px;
  text-align: center;
  color: var(--app-muted);
}

.clipboard-empty strong {
  color: var(--app-fg);
  font-size: 16px;
}

.clipboard-list {
  min-height: 0;
  flex: 1;
  display: grid;
  gap: 8px;
  overflow: auto;
}

/* ===== 卡片布局 ===== */
.clipboard-card {
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 6px;
  padding: 10px 14px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  cursor: default;
  user-select: text;
  transition: border-color 120ms;
}

.clipboard-card:hover {
  border-color: var(--app-accent);
}

.clipboard-card--pinned {
  border-width: 2px;
  border-color: var(--app-fg);
}

/* 上：头部栏 */
.clipboard-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.clipboard-card__type {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.clipboard-type {
  color: var(--app-accent);
  font-weight: 650;
  font-size: 12px;
  flex-shrink: 0;
}

.clipboard-source {
  color: var(--app-faint);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clipboard-card__header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* 中：内容区 */
.clipboard-card__content {
  min-width: 0;
  min-height: 0;
}

.clipboard-preview {
  margin: 0;
  padding: 4px 0;
  overflow: hidden;
  color: var(--app-fg);
  font: 13px/1.5 ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
  white-space: nowrap;
  text-overflow: ellipsis;
  max-height: 1.5em;
}

.clipboard-preview--code {
  white-space: pre-wrap;
  max-height: 4.5em;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.clipboard-image {
  width: min(220px, 100%);
  max-height: 120px;
  object-fit: contain;
  border-radius: 6px;
  background: var(--app-bg);
}

.clipboard-file {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clipboard-file__icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: var(--app-muted);
}

.clipboard-file__name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 下：底部栏 */
.clipboard-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.clipboard-card__footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clipboard-time {
  color: var(--app-muted);
  font-size: 11px;
}

.clipboard-modified {
  color: var(--app-accent);
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--app-accent-soft);
}

.clipboard-pinned {
  color: var(--app-fg);
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--app-surface-2);
  border: 1px solid var(--app-border);
}

.clipboard-card__footer-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.clipboard-confirm-text {
  color: var(--app-muted);
  font-size: 12px;
}

/* 图标按钮 */
.clipboard-icon-button {
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg);
  color: var(--app-muted);
  cursor: pointer;
  transition: border-color 120ms, color 120ms;
}

.clipboard-icon-button:hover,
.clipboard-icon-button:focus-visible {
  border-color: var(--app-accent);
  color: var(--app-accent);
  outline: 0;
}

.clipboard-icon-button--danger:hover,
.clipboard-icon-button--danger:focus-visible {
  border-color: #d03050;
  color: #d03050;
}

.clipboard-icon-button--active {
  border-color: var(--app-accent);
  color: var(--app-accent);
  background: var(--app-accent-soft);
}

.clipboard-icon-button svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 分页栏 */
.clipboard-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0 4px;
  border-top: 1px solid var(--app-border);
  margin-top: auto;
}

.clipboard-pagination__info {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--app-muted);
  font-size: 12px;
}

.clipboard-page-size {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.clipboard-page-size select {
  padding: 2px 6px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: var(--app-surface);
  color: var(--app-fg);
  font-size: 12px;
  outline: none;
}

.clipboard-pagination__controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.clipboard-page-btn {
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-surface);
  color: var(--app-fg);
  font-size: 16px;
  cursor: pointer;
  transition: border-color 120ms;
}

.clipboard-page-btn:hover:not(:disabled) {
  border-color: var(--app-accent);
  color: var(--app-accent);
}

.clipboard-page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.clipboard-page-info {
  font-size: 12px;
  color: var(--app-muted);
  min-width: 50px;
  text-align: center;
}

@media (max-width: 720px) {
  .clipboard-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .clipboard-search {
    width: 100%;
  }
}
</style>
