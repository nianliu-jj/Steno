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
    <div class="main-toolbar" data-testid="main-toolbar">
      <button class="toolbar-btn" type="button" data-testid="main-filter">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M3 5h18M6 12h12M10 19h4" />
        </svg>
        筛选
      </button>
      <button class="toolbar-btn toolbar-btn--ghost" type="button" data-testid="main-new-quicknote" @click="onNewQuickNote">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        速记
      </button>
      <button class="toolbar-btn toolbar-btn--primary" type="button" data-testid="main-new-note" @click="onNewNote">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        新建笔记
      </button>
    </div>

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
        <div class="empty-illus" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M5 4h11l3 3v13H5z" />
            <path d="M9 11h6M9 15h4" />
          </svg>
        </div>
        <h2>这里还空着</h2>
        <p>第一条笔记从一次复制开始。按下快捷键呼出浮窗，或直接新建。</p>
        <div class="empty-actions">
          <button class="empty-primary" type="button" data-action="new-note" @click="onNewNote">
            新建笔记
          </button>
        </div>
        <div class="empty-tips">
          <div><span class="empty-kbd">⌥ S</span> 呼出浮窗速记</div>
          <div><span class="empty-kbd">⌘ N</span> 新建一篇笔记</div>
          <div><span class="empty-kbd">⌘ K</span> 搜索任意内容</div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.main-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-btn {
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border: 1px solid oklch(88% 0.012 78);
  border-radius: 7px;
  background: oklch(99% 0.006 78);
  color: oklch(20% 0.02 70);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.toolbar-btn:hover {
  background: oklch(97% 0.014 78);
  border-color: oklch(80% 0.014 78);
}

.toolbar-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.toolbar-btn--ghost {
  color: oklch(49% 0.018 70);
}

.toolbar-btn--primary {
  border-color: oklch(61% 0.13 42);
  background: oklch(61% 0.13 42);
  color: white;
}

.toolbar-btn--primary:hover {
  border-color: oklch(61% 0.13 42);
  background: oklch(58% 0.13 42);
}

.main-root {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
  padding: 18px 20px 20px;
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
  flex: 1 1 auto;
  min-height: 240px;
  display: grid;
  justify-items: center;
  align-content: start;
  padding: 6px 24px 24px;
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

.empty-illus svg {
  width: 38px;
  height: 38px;
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

.empty-actions {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.empty-primary {
  height: 32px;
  padding: 0 14px;
  border: 1px solid oklch(61% 0.13 42);
  border-radius: 8px;
  background: oklch(61% 0.13 42);
  color: white;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.empty-primary:hover {
  filter: brightness(0.96);
}

.empty-tips {
  display: inline-flex;
  flex-direction: column;
  gap: 7px;
  padding: 11px 14px;
  border: 1px solid oklch(88% 0.012 78);
  border-radius: 9px;
  background: oklch(99% 0.006 78);
  color: oklch(49% 0.018 70);
  font-size: 12px;
}

.empty-tips div {
  display: flex;
  align-items: center;
  gap: 9px;
  white-space: nowrap;
}

.empty-kbd {
  min-width: 32px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border: 1px solid oklch(88% 0.012 78);
  border-radius: 4px;
  background: oklch(99% 0.006 78);
  color: oklch(49% 0.018 70);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 10px;
  line-height: 1;
}

@media (max-width: 720px) {
  .main-root {
    padding: 14px 14px 16px;
  }
}
</style>
