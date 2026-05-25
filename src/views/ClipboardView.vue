<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { useClipboardStore } from '@/stores/clipboard';
import type { ClipboardContentType, ClipboardEntry } from '@/types/steno';

const store = useClipboardStore();
const pendingDeleteId = ref<string | null>(null);

const filters: Array<{ label: string; value: ClipboardContentType | null; testid: string }> = [
  { label: '全部', value: null, testid: 'all' },
  { label: '文本', value: 'text', testid: 'text' },
  { label: '链接', value: 'url', testid: 'url' },
  { label: '代码', value: 'code', testid: 'code' },
  { label: '图片', value: 'image', testid: 'image' },
  { label: '文件', value: 'file', testid: 'file' },
  { label: '富文本', value: 'rich_text', testid: 'rich_text' },
];

const countLabel = computed(() => `${store.filteredEntries.length} 条`);

onMounted(() => {
  void store.startEventListeners();
  void store.load();
});

onBeforeUnmount(() => {
  store.stopEventListeners();
});

function typeLabel(type: ClipboardContentType) {
  switch (type) {
    case 'url':
      return '链接';
    case 'code':
      return '代码';
    case 'image':
      return '图片';
    case 'file':
      return '文件';
    case 'rich_text':
      return '富文本';
    case 'text':
      return '文本';
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

function previewLines(entry: ClipboardEntry) {
  return entry.preview || entry.content;
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
        v-for="entry in store.filteredEntries"
        :key="entry.id"
        class="clipboard-card"
        :data-type="entry.contentType"
        :data-testid="`clipboard-card-${entry.id}`"
      >
        <header class="clipboard-card__header" :data-testid="`clipboard-card-header-${entry.id}`">
          <div class="clipboard-card__type">
            <span class="clipboard-type">{{ typeLabel(entry.contentType) }}</span>
          </div>
          <div class="clipboard-card__delete">
            <template v-if="pendingDeleteId === entry.id">
              <span class="clipboard-confirm-text">确认删除？</span>
              <button
                class="clipboard-icon-button clipboard-icon-button--danger"
                type="button"
                :data-testid="`clipboard-delete-confirm-${entry.id}`"
                aria-label="确认删除"
                title="确认删除"
                @click="confirmDelete(entry.id)"
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
                @click="cancelDelete"
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
              @click="requestDelete(entry.id)"
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

        <div class="clipboard-card__content">
          <img
            v-if="entry.contentType === 'image'"
            class="clipboard-image"
            :src="entry.content"
            alt="剪贴板图片预览"
          >
          <pre v-else class="clipboard-preview">{{ previewLines(entry) }}</pre>
        </div>

        <footer class="clipboard-card__footer" :data-testid="`clipboard-card-footer-${entry.id}`">
          <time class="clipboard-time">{{ formatTime(entry.updatedAt) }}</time>
          <div
            class="clipboard-card__footer-actions"
            :data-testid="`clipboard-card-footer-actions-${entry.id}`"
          >
            <button
              class="clipboard-icon-button"
              type="button"
              :data-testid="`clipboard-copy-${entry.id}`"
              aria-label="复制"
              title="复制"
              @click="store.copyEntry(entry.id)"
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
  display: grid;
  gap: 8px;
  overflow: auto;
}

.clipboard-card {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
}

.clipboard-card__header,
.clipboard-card__footer {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.clipboard-card__type,
.clipboard-card__delete,
.clipboard-card__footer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.clipboard-card__content {
  min-width: 0;
}

.clipboard-type {
  color: var(--app-accent);
  font-weight: 650;
  font-size: 13px;
}

.clipboard-time,
.clipboard-confirm-text {
  color: var(--app-muted);
  font-size: 12px;
}

.clipboard-preview {
  min-height: 34px;
  max-height: 118px;
  margin: 0;
  overflow: hidden;
  color: var(--app-fg);
  font: 13px/1.5 ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.clipboard-image {
  width: min(220px, 100%);
  max-height: 140px;
  object-fit: contain;
  border-radius: 6px;
  background: var(--app-bg);
}

.clipboard-icon-button {
  width: 32px;
  height: 32px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg);
  color: var(--app-muted);
  cursor: pointer;
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

.clipboard-icon-button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (max-width: 720px) {
  .clipboard-toolbar,
  .clipboard-card {
    grid-template-columns: 1fr;
    display: grid;
  }

  .clipboard-search {
    width: 100%;
  }
}
</style>
