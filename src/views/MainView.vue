<script setup lang="ts">
// 主窗口落地页（mode === 'main'）。
// 当前作为工作台内容页渲染：原型 v2 的笔记卡片网格和空状态。
import { computed, onMounted } from 'vue';
import { NButton, useMessage } from 'naive-ui';

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

function onOpenCanvas() {
  ui.navigateTo('canvas');
}

function onOpenSearch() {
  ui.navigateTo('search');
}

function onOpenNoteEditor(note: Note) {
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
    <section v-if="recentNotes.length > 0" class="notes-grid">
      <article
        v-for="note in recentNotes"
        :key="note.id"
        class="note-card"
        :class="{ 'paper-1': note.isPinned }"
        @dblclick="onOpenNoteEditor(note)"
      >
        <div class="note-head">
          <span v-if="note.isPinned" class="note-pin"></span>
          <h3>{{ note.title || '无标题' }}</h3>
        </div>
        <p>{{ previewText(note.content) }}</p>
        <div class="note-foot">
          <div class="note-tags">
            <span v-for="tag in note.tags.slice(0, 2)" :key="tag">#{{ tag }}</span>
          </div>
          <span>{{ formatUpdatedAt(note.updatedAt) }}</span>
        </div>
        <div class="note-actions">
          <NButton tertiary size="tiny" @click="onOpenNoteEditor(note)">编辑</NButton>
          <NButton tertiary size="tiny" @click="onTogglePin(note)">
            {{ note.isPinned ? '取消置顶' : '置顶' }}
          </NButton>
          <NButton tertiary size="tiny" @click="onDelete(note)">删除</NButton>
        </div>
      </article>
    </section>

    <section v-else-if="!notes.loading" class="empty-state">
      <div class="empty-inner">
        <div class="empty-illus">□</div>
        <h2>这里还空着</h2>
        <p>第一条笔记从一次复制开始。按下快捷键呼出浮窗，或直接新建。</p>
        <div class="empty-tips">
          <button type="button" data-action="new-note" @click="onNewNote">新建笔记</button>
          <button type="button" data-action="new-quicknote" @click="onNewQuickNote">新建速记</button>
          <button type="button" @click="onOpenCanvas">打开画布</button>
          <button type="button" @click="onOpenSearch">搜索</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.main-root {
  min-height: 100%;
  color: #2a2a2a;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.note-card {
  min-height: 168px;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border: 1px solid oklch(88% 0.012 78);
  border-radius: 11px;
  background: oklch(99% 0.006 78);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.note-card:hover {
  border-color: oklch(80% 0.014 78);
  box-shadow: 0 6px 18px oklch(24% 0.02 70 / 0.1);
  transform: translateY(-1px);
}

.note-card.paper-1 {
  background: oklch(96% 0.038 88);
}

.note-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.note-pin {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 999px;
  background: oklch(61% 0.13 42);
}

.note-card h3 {
  margin: 0;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-card p {
  flex: 1;
  margin: 0;
  color: color-mix(in oklch, oklch(20% 0.02 70) 78%, oklch(49% 0.018 70));
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.55;
}

.note-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  color: oklch(49% 0.018 70);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 10.5px;
}

.note-tags {
  min-width: 0;
  display: flex;
  gap: 6px;
  overflow: hidden;
}

.note-tags span {
  padding: 1px 6px;
  border: 1px solid oklch(88% 0.012 78);
  border-radius: 3px;
  background: color-mix(in oklch, oklch(99% 0.006 78) 60%, transparent);
}

.note-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.note-card:hover .note-actions {
  opacity: 1;
}

.empty-state {
  min-height: 420px;
  display: grid;
  place-items: center;
  padding: 40px 24px;
}

.empty-inner {
  max-width: 360px;
  text-align: center;
}

.empty-illus {
  width: 96px;
  height: 96px;
  display: grid;
  place-items: center;
  margin: 0 auto 22px;
  border: 1.5px dashed oklch(80% 0.014 78);
  border-radius: 24px;
  background: oklch(99% 0.006 78);
  color: oklch(70% 0.014 70);
  font-size: 38px;
}

.empty-inner h2 {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 600;
}

.empty-inner p {
  margin: 0 0 18px;
  color: oklch(49% 0.018 70);
  font-size: 13px;
  line-height: 1.55;
}

.empty-tips {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.empty-tips button {
  height: 30px;
  padding: 0 12px;
  border: 1px solid oklch(88% 0.012 78);
  border-radius: 7px;
  background: oklch(99% 0.006 78);
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.empty-tips button:hover {
  border-color: oklch(61% 0.13 42);
  color: oklch(61% 0.13 42);
}
</style>
