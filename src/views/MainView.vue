<script setup lang="ts">
// 主窗口落地页（mode === 'main'）。
// 当前作为工作台内容页渲染：原型 v2 的笔记卡片网格和空状态。
import { computed, onMounted, ref } from 'vue';
import { NButton, NInput, useMessage } from 'naive-ui';

import { useDb } from '@/composables/useDb';
import { useWindow } from '@/composables/useWindow';
import { useNotesStore } from '@/stores/notes';
import { useUiStore } from '@/stores/ui';
import type { Note } from '@/types/steno';

const notes = useNotesStore();
const ui = useUiStore();
const win = useWindow();
const message = useMessage();
const db = useDb();

const untaggedFilterValue = '__untagged__';

onMounted(() => {
  void notes.loadNotes(50);
});

const recentNotes = computed(() => notes.notes.slice(0, 30));
const filterOpen = ref(false);
const selectedFilterValues = ref<string[]>([]);

const filterOptions = computed(() => {
  const tags = new Set<string>();
  for (const note of recentNotes.value) {
    for (const tag of note.tags) {
      const trimmed = tag.trim();
      if (trimmed) tags.add(trimmed);
    }
  }
  return [
    ...Array.from(tags)
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
      .map(tag => ({ value: tag, label: tag, testId: `filter-option-${tag}` })),
    { value: untaggedFilterValue, label: '无标签', testId: 'filter-option-untagged' },
  ];
});

const allFilterValues = computed(() => filterOptions.value.map(option => option.value));
const isAllFiltersSelected = computed(
  () =>
    allFilterValues.value.length > 0 &&
    allFilterValues.value.every(value => selectedFilterValues.value.includes(value)),
);

const visibleNotes = computed(() => {
  const selected = new Set(selectedFilterValues.value);
  if (selected.size === 0 || allFilterValues.value.every(value => selected.has(value))) {
    return recentNotes.value;
  }

  return recentNotes.value.filter((note) => {
    const tags = normalizedTags(note);
    const matchesTag = tags.some(tag => selected.has(tag));
    const matchesUntagged = tags.length === 0 && selected.has(untaggedFilterValue);
    return matchesTag || matchesUntagged;
  });
});

const contextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  note: Note | null;
  exportOpen: boolean;
}>({
  visible: false,
  x: 0,
  y: 0,
  note: null,
  exportOpen: false,
});

const contextTargetNote = computed(() => contextMenu.value.note);
const contextHasTarget = computed(() => contextTargetNote.value !== null);

const tagDialogVisible = ref(false);
const tagDialogNote = ref<Note | null>(null);
const tagDraftRows = ref<string[]>([]);
const renameDialogVisible = ref(false);
const renameDialogNote = ref<Note | null>(null);
const renameDraft = ref('');

function normalizedTags(note: Note): string[] {
  return note.tags.map(tag => tag.trim()).filter(Boolean);
}

function onToggleAllFilters(checked: boolean) {
  selectedFilterValues.value = checked ? [...allFilterValues.value] : [];
}

function onToggleAllFiltersChange(event: Event) {
  onToggleAllFilters((event.target as HTMLInputElement).checked);
}

function toggleFilterMenu() {
  filterOpen.value = !filterOpen.value;
}

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

function closeContextMenu() {
  contextMenu.value.visible = false;
  contextMenu.value.exportOpen = false;
}

function openContextMenu(event: MouseEvent, note: Note | null) {
  event.preventDefault();
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    note,
    exportOpen: false,
  };
}

function onContextMenuBlank(event: MouseEvent) {
  openContextMenu(event, null);
}

function onContextMenuNote(event: MouseEvent, note: Note) {
  openContextMenu(event, note);
}

function onContextNewNote() {
  closeContextMenu();
  onNewNote();
}

function onContextEdit() {
  const note = contextTargetNote.value;
  if (!note) return;
  closeContextMenu();
  onOpenNoteEditor(note);
}

function onContextTags() {
  const note = contextTargetNote.value;
  if (!note) return;
  tagDialogNote.value = note;
  tagDraftRows.value = note.tags.length ? [...note.tags] : [''];
  tagDialogVisible.value = true;
  closeContextMenu();
}

function onContextRename() {
  const note = contextTargetNote.value;
  if (!note) return;
  renameDialogNote.value = note;
  renameDraft.value = note.title;
  renameDialogVisible.value = true;
  closeContextMenu();
}

function onToggleExportSubmenu() {
  if (!contextTargetNote.value) return;
  contextMenu.value.exportOpen = !contextMenu.value.exportOpen;
}

async function onContextExport(format: 'markdown' | 'html' | 'pdf') {
  const note = contextTargetNote.value;
  if (!note) return;
  try {
    const path = format === 'markdown'
      ? await db.exportNoteMarkdown(note.id)
      : format === 'html'
        ? await db.exportNoteHtml(note.id)
        : await db.exportNotePdf(note.id);
    message.success(`已导出：${path}`);
  } catch (e) {
    message.error(String(e));
  }
}

function onContextPrint() {
  window.print();
}

async function onContextDelete() {
  const note = contextTargetNote.value;
  if (!note) return;
  closeContextMenu();
  await onDelete(note);
}

function onCloseTagDialog() {
  tagDialogVisible.value = false;
  tagDialogNote.value = null;
  tagDraftRows.value = [];
}

function onAddTagRow() {
  tagDraftRows.value.push('');
}

function onDeleteTagRow(index: number) {
  tagDraftRows.value.splice(index, 1);
  if (tagDraftRows.value.length === 0) {
    tagDraftRows.value.push('');
  }
}

function parseTagRows(rows: string[]): string[] {
  return Array.from(
    new Set(
      rows
        .map(tag => tag.replace(/^#+/, '').trim())
        .filter(Boolean),
    ),
  );
}

function buildSaveRequest(note: Note, overrides: Partial<Pick<Note, 'title' | 'tags'>>) {
  return {
    id: note.id,
    title: overrides.title ?? note.title,
    content: note.content,
    tags: overrides.tags ?? note.tags,
    isPinned: note.isPinned,
    pinnedWindowConfig: note.pinnedWindowConfig ?? null,
    canvasPosition: note.canvasPosition ?? null,
  };
}

async function onConfirmTagDialog() {
  const note = tagDialogNote.value;
  if (!note) return;
  try {
    await notes.saveDraft(buildSaveRequest(note, { tags: parseTagRows(tagDraftRows.value) }));
    onCloseTagDialog();
  } catch (e) {
    message.error(String(e));
  }
}

function onCloseRenameDialog() {
  renameDialogVisible.value = false;
  renameDialogNote.value = null;
  renameDraft.value = '';
}

async function onConfirmRenameDialog() {
  const note = renameDialogNote.value;
  if (!note) return;
  try {
    await notes.saveDraft(buildSaveRequest(note, { title: renameDraft.value }));
    onCloseRenameDialog();
  } catch (e) {
    message.error(String(e));
  }
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
  <div class="main-root" @click="closeContextMenu" @contextmenu="onContextMenuBlank">
    <div class="main-toolbar" data-testid="main-toolbar">
      <div class="filter-wrap" @click.stop>
        <button class="toolbar-btn" type="button" data-testid="main-filter" @click="toggleFilterMenu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M3 5h18M6 12h12M10 19h4" />
          </svg>
          筛选
        </button>
        <div v-if="filterOpen" class="filter-menu" data-testid="filter-menu">
          <label class="filter-option filter-option--all" data-testid="filter-select-all">
            <input
              type="checkbox"
              :checked="isAllFiltersSelected"
              @change="onToggleAllFiltersChange"
            >
            <span>全选</span>
          </label>
          <label
            v-for="option in filterOptions"
            :key="option.value"
            class="filter-option"
            :data-testid="option.testId"
          >
            <input
              v-model="selectedFilterValues"
              type="checkbox"
              :value="option.value"
            >
            <span>{{ option.label }}</span>
          </label>
        </div>
      </div>
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

    <section v-if="visibleNotes.length > 0" class="notes-grid">
      <article
        v-for="note in visibleNotes"
        :key="note.id"
        class="note-card"
        :class="{ 'paper-1': note.isPinned }"
        @dblclick="onOpenNoteEditor(note)"
        @contextmenu.stop="onContextMenuNote($event, note)"
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

    <div
      v-if="contextMenu.visible"
      class="note-context-menu"
      data-testid="note-context-menu"
      role="menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
      @contextmenu.stop.prevent
    >
      <button
        class="context-item"
        type="button"
        data-testid="context-new"
        aria-disabled="false"
        role="menuitem"
        @click="onContextNewNote"
      >
        新建
      </button>
      <button
        class="context-item"
        type="button"
        data-testid="context-edit"
        :disabled="!contextHasTarget"
        :aria-disabled="!contextHasTarget"
        role="menuitem"
        @click="onContextEdit"
      >
        编辑
      </button>
      <button
        class="context-item"
        type="button"
        data-testid="context-tags"
        :disabled="!contextHasTarget"
        :aria-disabled="!contextHasTarget"
        role="menuitem"
        @click="onContextTags"
      >
        标签
      </button>
      <div class="context-export-wrap">
        <button
          class="context-item context-item--with-arrow"
          type="button"
          data-testid="context-export"
          :disabled="!contextHasTarget"
          :aria-disabled="!contextHasTarget"
          role="menuitem"
          @click="onToggleExportSubmenu"
        >
          导出为
          <span aria-hidden="true">›</span>
        </button>
        <div v-if="contextMenu.exportOpen && contextHasTarget" class="context-submenu" role="menu">
          <button class="context-item" type="button" data-testid="context-export-markdown" role="menuitem" @click="onContextExport('markdown')">
            Markdown
          </button>
          <button class="context-item" type="button" data-testid="context-export-html" role="menuitem" @click="onContextExport('html')">
            Html
          </button>
          <button class="context-item" type="button" data-testid="context-export-pdf" role="menuitem" @click="onContextExport('pdf')">
            PDF
          </button>
        </div>
      </div>
      <button
        class="context-item"
        type="button"
        data-testid="context-print"
        aria-disabled="false"
        role="menuitem"
        @click="onContextPrint"
      >
        打印
      </button>
      <button
        class="context-item"
        type="button"
        data-testid="context-rename"
        :disabled="!contextHasTarget"
        :aria-disabled="!contextHasTarget"
        role="menuitem"
        @click="onContextRename"
      >
        重命名
      </button>
      <button
        class="context-item context-item--danger"
        type="button"
        data-testid="context-delete"
        :disabled="!contextHasTarget"
        :aria-disabled="!contextHasTarget"
        role="menuitem"
        @click="onContextDelete"
      >
        删除
      </button>
    </div>

    <div
      v-if="tagDialogVisible"
      class="main-dialog-backdrop"
      @click.self="onCloseTagDialog"
      @keydown.esc="onCloseTagDialog"
    >
      <section class="main-dialog" role="dialog" aria-modal="true" aria-labelledby="main-tags-title" @click.stop>
        <h2 id="main-tags-title" class="main-dialog-title">标签</h2>
        <div class="tag-editor">
          <div v-for="(_, index) in tagDraftRows" :key="index" class="tag-row">
            <NInput
              v-model:value="tagDraftRows[index]"
              size="small"
              placeholder="输入标签"
              :aria-label="`标签 ${index + 1}`"
              :data-testid="`main-tag-input-${index}`"
            />
            <NButton
              quaternary
              circle
              size="small"
              :aria-label="`删除标签 ${index + 1}`"
              :data-testid="`main-tag-delete-${index}`"
              @click="onDeleteTagRow(index)"
            >
              ×
            </NButton>
          </div>
          <NButton size="small" tertiary data-testid="main-tag-add" @click="onAddTagRow">
            添加标签
          </NButton>
        </div>
        <div class="main-dialog-actions">
          <NButton size="small" @click="onCloseTagDialog">取消</NButton>
          <NButton size="small" type="primary" data-testid="main-tags-confirm" @click="onConfirmTagDialog">
            保存
          </NButton>
        </div>
      </section>
    </div>

    <div
      v-if="renameDialogVisible"
      class="main-dialog-backdrop"
      @click.self="onCloseRenameDialog"
      @keydown.esc="onCloseRenameDialog"
    >
      <section class="main-dialog" role="dialog" aria-modal="true" aria-labelledby="main-rename-title" @click.stop>
        <h2 id="main-rename-title" class="main-dialog-title">重命名</h2>
        <NInput
          v-model:value="renameDraft"
          size="small"
          placeholder="输入文档名称"
          aria-label="文档名称"
          data-testid="main-rename-input"
        />
        <div class="main-dialog-actions">
          <NButton size="small" @click="onCloseRenameDialog">取消</NButton>
          <NButton size="small" type="primary" data-testid="main-rename-confirm" @click="onConfirmRenameDialog">
            保存
          </NButton>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.main-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-wrap {
  position: relative;
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

.filter-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 20;
  width: 178px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px;
  border: 1px solid oklch(86% 0.014 78);
  border-radius: 8px;
  background: oklch(99% 0.006 78);
  box-shadow: 0 12px 30px oklch(24% 0.02 70 / 0.14);
}

.filter-option {
  min-height: 30px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 7px;
  border-radius: 6px;
  color: oklch(24% 0.02 70);
  font-size: 12.5px;
  cursor: pointer;
}

.filter-option:hover {
  background: oklch(96% 0.014 78);
}

.filter-option input {
  width: 14px;
  height: 14px;
  accent-color: oklch(61% 0.13 42);
}

.filter-option--all {
  margin-bottom: 3px;
  border-bottom: 1px solid oklch(90% 0.01 78);
  border-radius: 6px 6px 2px 2px;
  font-weight: 600;
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

.note-context-menu {
  position: fixed;
  z-index: 40;
  width: 172px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border: 1px solid oklch(84% 0.014 78);
  border-radius: 8px;
  background: oklch(99% 0.006 78);
  box-shadow: 0 16px 42px oklch(24% 0.02 70 / 0.18);
}

.context-item {
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: oklch(22% 0.02 70);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}

.context-item:hover:not(:disabled) {
  background: oklch(96% 0.014 78);
}

.context-item:disabled {
  color: oklch(58% 0.01 70);
  cursor: not-allowed;
  opacity: 0.48;
}

.context-item--danger:not(:disabled) {
  color: oklch(48% 0.16 28);
}

.context-item--with-arrow {
  justify-content: space-between;
  width: 100%;
}

.context-export-wrap {
  position: relative;
}

.context-submenu {
  position: absolute;
  top: 0;
  left: calc(100% + 6px);
  width: 128px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border: 1px solid oklch(84% 0.014 78);
  border-radius: 8px;
  background: oklch(99% 0.006 78);
  box-shadow: 0 12px 30px oklch(24% 0.02 70 / 0.14);
}

.main-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 24px;
  background: oklch(18% 0.02 70 / 0.24);
}

.main-dialog {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid oklch(84% 0.014 78);
  border-radius: 8px;
  background: oklch(99% 0.006 78);
  box-shadow: 0 18px 48px oklch(24% 0.02 70 / 0.16);
}

.main-dialog-title {
  margin: 0;
  color: oklch(22% 0.02 70);
  font-size: 16px;
  font-weight: 600;
}

.tag-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tag-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  align-items: center;
  gap: 8px;
}

.main-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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
