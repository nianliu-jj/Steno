<script setup lang="ts">
// 全局搜索视图（mode === 'search'）。由 main 窗口路由切入。
//
// 行为（plan 8.2 / spec search-export-settings）：
// - mount：搜索输入框自动 focus
// - 输入 200ms 防抖 → notes.search(query)
// - 结果列表显示标题、首段预览、标签、更新时间
// - 每条记录有三个动作：编辑（开 Zen）/ 钉住（toggle pin）/ 删除
// - "标签筛选"用 chips 切换 selectedTags
// - 空查询时显示最近 50 条（loadNotes(50)）作为默认展示
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue';
import { NDropdown, NEmpty, NIcon, NInput, NTag, useMessage } from 'naive-ui';

import { useDb } from '@/composables/useDb';
import { useWindow } from '@/composables/useWindow';
import { useNotesStore } from '@/stores/notes';
import type { Note } from '@/types/steno';

const db = useDb();
const notes = useNotesStore();
const win = useWindow();
const message = useMessage();

const query = ref('');
const selectedTags = ref<string[]>([]);
const searchInput = useTemplateRef<InstanceType<typeof NInput>>('searchInput');
const searching = ref(false);
const error = ref<string | null>(null);
const results = ref<Note[]>([]);

const allTags = computed(() => {
  const set = new Set<string>();
  for (const n of results.value) {
    for (const t of n.tags) set.add(t);
  }
  return Array.from(set).sort();
});

// ----- 搜索（200ms debounce） ----------------------------------------

let searchTimer: ReturnType<typeof setTimeout> | undefined;

watch([query, selectedTags], () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void runSearch();
  }, 200);
}, { deep: true });

async function runSearch() {
  searching.value = true;
  error.value = null;
  try {
    const q = query.value.trim();
    const tags = selectedTags.value;
    if (!q && tags.length === 0) {
      // 空查询：拉最近 50 条作为默认展示
      results.value = await db.listNotes(50);
    } else {
      results.value = await db.searchNotes({
        query: q,
        tags,
        pinnedOnly: false,
        limit: 200,
      });
    }
  } catch (e) {
    error.value = String(e);
    results.value = [];
  } finally {
    searching.value = false;
  }
}

onMounted(async () => {
  // Naive Input expose 了 focus()
  await new Promise<void>(resolve => queueMicrotask(() => resolve()));
  searchInput.value?.focus();
  await runSearch();
});

// ----- 结果交互 ------------------------------------------------------

function toggleTag(tag: string) {
  const i = selectedTags.value.indexOf(tag);
  if (i >= 0) selectedTags.value.splice(i, 1);
  else selectedTags.value.push(tag);
}

async function onOpenZen(note: Note) {
  try {
    await win.openZen(note.id);
  } catch (e) {
    console.error('[search] openZen failed:', e);
  }
}

async function onTogglePin(note: Note) {
  try {
    if (note.isPinned) {
      const updated = await notes.unpinNote(note.id);
      await win.closeStickyNote(note.id);
      patchResult(updated);
    } else {
      const updated = await notes.pinNote(note.id);
      await win.openStickyNote(note.id);
      patchResult(updated);
    }
  } catch (e) {
    console.error('[search] toggle pin failed:', e);
  }
}

async function onDelete(note: Note) {
  if (note.isPinned) {
    try {
      await win.closeStickyNote(note.id);
    } catch {
      // ignore
    }
  }
  try {
    await notes.removeNote(note.id);
    results.value = results.value.filter(n => n.id !== note.id);
  } catch (e) {
    console.error('[search] delete failed:', e);
  }
}

function patchResult(note: Note) {
  const i = results.value.findIndex(n => n.id === note.id);
  if (i >= 0) results.value[i] = note;
}

// ----- 导出 ----------------------------------------------------------

const exportOptions = [
  { key: 'markdown', label: '导出为 Markdown' },
  { key: 'pdf', label: '导出为 PDF' },
];

async function onExportSelect(key: string, note: Note) {
  try {
    if (key === 'markdown') {
      const path = await db.exportNoteMarkdown(note.id);
      message.success(`已导出：${path}`);
    } else {
      const path = await db.exportNotePdf(note.id);
      message.success(`已导出：${path}`);
    }
  } catch (e) {
    message.error(String(e));
  }
}

// ----- 预览 / 时间格式 -----------------------------------------------

function previewText(content: string): string {
  const stripped = content
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
  return stripped.length > 140 ? `${stripped.slice(0, 140).trim()}…` : stripped;
}

function formatUpdatedAt(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { year: '2-digit', month: '2-digit', day: '2-digit' });
  } catch {
    return iso;
  }
}
</script>

<template>
  <div class="search-root">
    <NInput
      ref="searchInput"
      v-model:value="query"
      size="large"
      placeholder="搜索标题 / 正文 / 标签…"
      clearable
      class="search-input"
    />

    <div v-if="allTags.length" class="search-tags">
      <NTag
        v-for="t in allTags"
        :key="t"
        size="small"
        checkable
        :checked="selectedTags.includes(t)"
        :type="selectedTags.includes(t) ? 'primary' : 'default'"
        @click="toggleTag(t)"
      >
        #{{ t }}
      </NTag>
    </div>

    <div class="search-body">
      <div v-if="error" class="search-error">{{ error }}</div>
      <NEmpty
        v-else-if="!searching && results.length === 0"
        description="没有匹配的笔记"
      />
      <ul v-else class="search-list">
        <li
          v-for="note in results"
          :key="note.id"
          class="search-item"
          @dblclick="onOpenZen(note)"
        >
          <div class="search-item-main">
            <header class="search-item-header">
              <span class="search-item-title">
                {{ note.title || '无标题' }}
                <span v-if="note.isPinned" class="search-item-pin" title="已置顶">★</span>
              </span>
              <span class="search-item-time">{{ formatUpdatedAt(note.updatedAt) }}</span>
            </header>
            <p class="search-item-body">{{ previewText(note.content) }}</p>
            <footer v-if="note.tags.length" class="search-item-tags">
              <span v-for="t in note.tags" :key="t" class="search-item-tag">#{{ t }}</span>
            </footer>
          </div>
          <div class="search-item-actions">
            <NButton
              quaternary
              size="tiny"
              title="进入 Zen 编辑"
              @click="onOpenZen(note)"
            >
              <template #icon>
                <NIcon>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.42l-2.34-2.33a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z" />
                  </svg>
                </NIcon>
              </template>
            </NButton>
            <NButton
              quaternary
              size="tiny"
              :title="note.isPinned ? '取消置顶' : '置顶为便签'"
              @click="onTogglePin(note)"
            >
              <template #icon>
                <NIcon>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M14.4 6 14 4H7.7L7 5.2l3 5.3L7.3 13 4 16.3V17h6.7L12 22l1.3-5h6.7v-.7L16.7 13 14 10.5 17 5.2 16.3 4H14.4z" />
                  </svg>
                </NIcon>
              </template>
            </NButton>
            <NDropdown
              :options="exportOptions"
              trigger="click"
              @select="key => onExportSelect(key, note)"
            >
              <NButton quaternary size="tiny" title="导出">
                <template #icon>
                  <NIcon>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z" />
                    </svg>
                  </NIcon>
                </template>
              </NButton>
            </NDropdown>
            <NButton
              quaternary
              size="tiny"
              title="删除"
              @click="onDelete(note)"
            >
              <template #icon>
                <NIcon>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z" />
                  </svg>
                </NIcon>
              </template>
            </NButton>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.search-root {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  color: #2a2a2a;
}
.search-input {
  margin: 16px 24px 8px;
}
.search-input :deep(input) {
  font-size: 16px;
}

.search-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 24px;
  border-bottom: 1px solid rgba(55, 46, 36, 0.08);
  max-height: 80px;
  overflow: auto;
}

.search-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 0;
}
.search-error {
  padding: 12px 24px;
  color: #ff6b6b;
  font-size: 12px;
}

.search-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.search-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 24px;
  border-bottom: 1px solid rgba(55, 46, 36, 0.08);
  cursor: default;
  transition: background 0.1s;
}
.search-item:hover {
  background: rgba(199, 108, 52, 0.06);
}

.search-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.search-item-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.search-item-title {
  font-size: 14px;
  font-weight: 600;
  color: #2a2a2a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.search-item-pin {
  color: #ffd166;
  margin-left: 4px;
  font-size: 12px;
}
.search-item-time {
  font-size: 11px;
  color: #7a7067;
  white-space: nowrap;
  flex: 0 0 auto;
}
.search-item-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #5f564d;
  white-space: pre-wrap;
  /* 双行省略 */
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.search-item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 10px;
}
.search-item-tag {
  background: rgba(199, 108, 52, 0.12);
  color: #9a4d20;
  padding: 1px 6px;
  border-radius: 8px;
}
.search-item-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}
</style>
