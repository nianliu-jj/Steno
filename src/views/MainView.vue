<script setup lang="ts">
// 主窗口落地页（mode === 'main'）。
// 当前作为工作台内容页渲染：
// - 快捷入口卡片：新建笔记 / 新建速记 / 画布 / 搜索 / 设置
// - 最近笔记列表（点击进 Zen / 钉住 / 删除）
import { computed, onMounted } from 'vue';
import { NCard, NEmpty, NText, useMessage } from 'naive-ui';

import { useWindow } from '@/composables/useWindow';
import { useNotesStore } from '@/stores/notes';
import { useUiStore } from '@/stores/ui';
import type { Note } from '@/types/steno';

const notes = useNotesStore();
const ui = useUiStore();
const win = useWindow();
const message = useMessage();

onMounted(() => {
  void notes.loadNotes(50);
  void notes.loadPinned();
});

const recentNotes = computed(() => notes.notes.slice(0, 30));

// ----- 入口 -----------------------------------------------------------

async function onNewQuickNote() {
  try {
    await win.openQuicknote();
  } catch (e) {
    message.error(`打开失败：${String(e)}`);
  }
}

function onNewNote() {
  ui.navigateTo('note-editor');
}

async function onOpenCanvas() {
  try {
    await win.openCanvas();
  } catch (e) {
    message.error(String(e));
  }
}

async function onOpenSearch() {
  try {
    await win.openSearch();
  } catch (e) {
    message.error(String(e));
  }
}

async function onOpenSettings() {
  try {
    await win.openSettings();
  } catch (e) {
    message.error(String(e));
  }
}

// ----- 笔记交互 -------------------------------------------------------

async function onOpenZen(note: Note) {
  ui.navigateTo('note-editor', note.id);
}

async function onTogglePin(note: Note) {
  try {
    if (note.isPinned) {
      await notes.unpinNote(note.id);
      await win.closeStickyNote(note.id);
    } else {
      await notes.pinNote(note.id);
      await win.openStickyNote(note.id);
    }
  } catch (e) {
    message.error(String(e));
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
  } catch (e) {
    message.error(String(e));
  }
}

// ----- 格式 -----------------------------------------------------------

function previewText(content: string): string {
  const stripped = content
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
  return stripped.length > 120 ? `${stripped.slice(0, 120).trim()}…` : stripped;
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
  <div class="main-root">
    <section class="main-quickbar">
      <NCard
        size="small"
        class="main-quick"
        data-action="new-note"
        hoverable
        @click="onNewNote"
      >
        <div class="main-quick-title">＋ 新建笔记</div>
        <NText depth="3" class="main-quick-hint">在主窗口编辑完整笔记</NText>
      </NCard>
      <NCard
        size="small"
        class="main-quick"
        data-action="new-quicknote"
        hoverable
        @click="onNewQuickNote"
      >
        <div class="main-quick-title">✎ 新建速记</div>
        <NText depth="3" class="main-quick-hint">打开速记浮窗</NText>
      </NCard>
      <NCard size="small" class="main-quick" hoverable @click="onOpenCanvas">
        <div class="main-quick-title">▦ 画布</div>
        <NText depth="3" class="main-quick-hint">把笔记摆在无限画布上</NText>
      </NCard>
      <NCard size="small" class="main-quick" hoverable @click="onOpenSearch">
        <div class="main-quick-title">⌕ 搜索</div>
        <NText depth="3" class="main-quick-hint">全文 + 标签查找</NText>
      </NCard>
      <NCard size="small" class="main-quick" hoverable @click="onOpenSettings">
        <div class="main-quick-title">⚙ 设置</div>
        <NText depth="3" class="main-quick-hint">快捷键 / 主题 / 备份</NText>
      </NCard>
    </section>

    <section class="main-recent">
      <header class="main-section-head">
        <h2>最近笔记</h2>
        <NText depth="3" class="main-section-meta">
          {{ recentNotes.length }} 条
        </NText>
      </header>

      <NEmpty
        v-if="!notes.loading && recentNotes.length === 0"
        description="还没有笔记。新建一条开始记录吧。"
      />

      <ul class="main-list">
        <li
          v-for="note in recentNotes"
          :key="note.id"
          class="main-item"
          @dblclick="onOpenZen(note)"
        >
          <div class="main-item-main">
            <header class="main-item-header">
              <span class="main-item-title">
                {{ note.title || '无标题' }}
                <span v-if="note.isPinned" class="main-item-pin" title="已置顶">★</span>
              </span>
              <span class="main-item-time">{{ formatUpdatedAt(note.updatedAt) }}</span>
            </header>
            <p class="main-item-body">{{ previewText(note.content) }}</p>
            <footer v-if="note.tags.length" class="main-item-tags">
              <span v-for="t in note.tags" :key="t" class="main-item-tag">#{{ t }}</span>
            </footer>
          </div>
          <div class="main-item-actions">
            <NButton tertiary size="tiny" @click="onOpenZen(note)">编辑</NButton>
            <NButton tertiary size="tiny" @click="onTogglePin(note)">
              {{ note.isPinned ? '取消置顶' : '置顶' }}
            </NButton>
            <NButton tertiary size="tiny" @click="onDelete(note)">删除</NButton>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.main-root {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  color: #2a2a2a;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* 入口卡片 */
.main-quickbar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  padding: 16px 24px 12px;
}
.main-quick {
  cursor: pointer;
  transition: transform 0.12s, box-shadow 0.12s;
}
.main-quick:hover {
  transform: translateY(-1px);
}
.main-quick-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}
.main-quick-hint {
  font-size: 11px;
}

/* 最近笔记 */
.main-recent {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 24px 24px;
}
.main-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 8px 0 8px;
}
.main-section-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.main-section-meta {
  font-size: 11px;
}

.main-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.main-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.03);
  transition: background 0.1s;
}
.main-item:hover {
  background: rgba(0, 0, 0, 0.06);
}

.main-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.main-item-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.main-item-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.main-item-pin {
  color: #d4a017;
  margin-left: 4px;
  font-size: 12px;
}
.main-item-time {
  font-size: 11px;
  color: #888;
  flex: 0 0 auto;
}
.main-item-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #555;
  white-space: pre-wrap;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.main-item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 10px;
}
.main-item-tag {
  background: rgba(40, 140, 90, 0.12);
  color: #2e8a55;
  padding: 1px 6px;
  border-radius: 8px;
}
.main-item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}
</style>
