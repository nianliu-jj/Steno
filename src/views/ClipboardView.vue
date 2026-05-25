<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';

import { useClipboardStore } from '@/stores/clipboard';
import type { ClipboardContentType, ClipboardEntry } from '@/types/steno';

const store = useClipboardStore();

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
        class="clipboard-item"
        :data-type="entry.contentType"
      >
        <div class="clipboard-item__main">
          <div class="clipboard-item__meta">
            <span class="clipboard-type">{{ typeLabel(entry.contentType) }}</span>
            <time>{{ formatTime(entry.updatedAt) }}</time>
          </div>
          <img
            v-if="entry.contentType === 'image'"
            class="clipboard-image"
            :src="entry.content"
            alt="剪贴板图片预览"
          >
          <pre v-else class="clipboard-preview">{{ previewLines(entry) }}</pre>
        </div>
        <div class="clipboard-actions">
          <button
            type="button"
            :data-testid="`clipboard-copy-${entry.id}`"
            title="复制"
            @click="store.copyEntry(entry.id)"
          >
            复制
          </button>
          <button type="button" title="删除" @click="store.deleteEntry(entry.id)">
            删除
          </button>
        </div>
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

.clipboard-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
}

.clipboard-item__main {
  min-width: 0;
  display: grid;
  gap: 8px;
}

.clipboard-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-muted);
  font-size: 12px;
}

.clipboard-type {
  color: var(--app-accent);
  font-weight: 650;
}

.clipboard-preview {
  max-height: 88px;
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

.clipboard-actions {
  display: flex;
  align-items: start;
  gap: 6px;
}

.clipboard-actions button {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg);
  color: var(--app-fg);
  cursor: pointer;
}

@media (max-width: 720px) {
  .clipboard-toolbar,
  .clipboard-item {
    grid-template-columns: 1fr;
    display: grid;
  }

  .clipboard-search {
    width: 100%;
  }
}
</style>
