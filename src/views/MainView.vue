<script setup lang="ts">
/**
 * @component MainView
 * @description 主窗口落地页（`mode === 'main'`）— 笔记卡片网格视图。
 *
 * **功能总览**：
 * - 标签筛选（多选交集 + "无标签"筛选 + "全部笔记"快捷选项）
 * - 笔记卡片网格（标题/预览/标签/时间/操作按钮）
 * - 新建笔记 / 新建速记按钮
 * - 右键上下文菜单（编辑/标签/重命名/导出/删除）
 * - 草稿卡片特殊处理（"未保存"灰色标签，禁止编辑页入口）
 * - 跨窗口实时同步（监听 `steno:note-saved` / `steno:note-removed` 事件）
 *
 * **草稿处理**：
 * - `isDraft` 笔记排在列表最前 + 灰色"未保存"标签
 * - 禁止进入 NoteEditorView：点击编辑 → 打开速记浮窗继续编写
 * - 列表卡片上的"保存"按钮直接调用 `promoteDraft` 提升为正式笔记
 *
 * @props — 无
 */

import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { NButton, NDropdown, NIcon, NInput, NPopconfirm, useMessage } from 'naive-ui';

import EntryTypeBadge from '@/components/EntryTypeBadge.vue';
import WorkspacePickerDialog from '@/components/WorkspacePickerDialog.vue';
import WorkspaceTreePanel from '@/components/WorkspaceTreePanel.vue';
import { useDb } from '@/composables/useDb';
import { useWindow } from '@/composables/useWindow';
import { useLibraryStore } from '@/stores/library';
import { useUiStore } from '@/stores/ui';
import type { LibraryEntry, MainListContext, Workspace } from '@/types/steno';

const typeFilterOptions: Array<{ kind: 'document' | 'text'; label: string }> = [
  { kind: 'document', label: '文档' },
  { kind: 'text', label: '文本' },
];

const defaultContext: MainListContext = {
  workspaceId: null,
  folderEntryId: null,
  groupEntryId: null,
  selectedEntryId: null,
};

const library = useLibraryStore();
const ui = useUiStore();
const win = useWindow();
const db = useDb();
const appEvents = useAppEvents();

const untaggedFilterValue = '__untagged__';
let removeNoteSavedListener: (() => void) | null = null;
let removeNoteRemovedListener: (() => void) | null = null;
let noteSavedListenerDisposed = false;
let initialNotesLoading = true;
const pendingExternalNotes = new Map<string, Note>();

function syncExternalNote(note: Note) {
  notes.syncExternalNote(note);
  if (initialNotesLoading) {
    pendingExternalNotes.set(note.id, note);
  }
}

onMounted(() => {
  void notes.loadNotes(50).finally(() => {
    initialNotesLoading = false;
    if (noteSavedListenerDisposed || pendingExternalNotes.size === 0) {
      pendingExternalNotes.clear();
      return;
    }

    const bufferedNotes = Array.from(pendingExternalNotes.values());
    pendingExternalNotes.clear();

    for (const note of bufferedNotes) {
      notes.syncExternalNote(note);
    }
  });
  void notes.loadPinned().catch((e) => {
    console.error('[main] failed to load pinned notes:', e);
  });
  void appEvents.listenNoteSaved((note) => {
    syncExternalNote(note);
  }).then((unlisten) => {
    if (noteSavedListenerDisposed) {
      unlisten();
      return;
    }
    removeNoteSavedListener = unlisten;
  }).catch((error) => {
    console.error('[main] failed to listen for note save events:', error);
  });
  void appEvents.listenNoteRemoved(({ id }) => {
    // 速记浮窗 promote 草稿后 / 关闭空草稿后，由该事件通知主窗口同步清卡片。
    notes.purgeLocal(id);
    pendingExternalNotes.delete(id);
  }).then((unlisten) => {
    if (noteSavedListenerDisposed) {
      unlisten();
      return;
    }
    removeNoteRemovedListener = unlisten;
  }).catch((error) => {
    console.error('[main] failed to listen for note remove events:', error);
  });
});

onUnmounted(() => {
  noteSavedListenerDisposed = true;
  pendingExternalNotes.clear();
  removeNoteSavedListener?.();
  removeNoteSavedListener = null;
  removeNoteRemovedListener?.();
  removeNoteRemovedListener = null;
});

const recentNotes = computed(() => notes.notes.slice(0, 30));
const filterOpen = ref(false);
const selectedFilterValues = ref<string[]>([]);

const filterOptions = computed(() => {
  const tagCounts = new Map<string, number>();
  let untaggedCount = 0;

  for (const note of recentNotes.value) {
    const tags = normalizedTags(note);
    if (tags.length === 0) {
      untaggedCount++;
      continue;
    }

    for (const tag of new Set(tags)) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  return [
    { value: untaggedFilterValue, label: '无标签', count: untaggedCount, testId: 'filter-option-untagged' },
    ...Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .map(([tag, count]) => ({ value: tag, label: `#${tag}`, count, testId: `filter-option-${tag}` })),
  ];
});

const totalNoteCount = computed(() => recentNotes.value.length);
const isAllFiltersSelected = computed(() => selectedFilterValues.value.length === 0);

const visibleNotes = computed(() => {
  const selected = new Set(selectedFilterValues.value);
  if (selected.size === 0) {
    return recentNotes.value;
  }

  return recentNotes.value.filter((note) => {
    const tags = normalizedTags(note);
    const matchesTag = tags.some(tag => selected.has(tag));
    const matchesUntagged = tags.length === 0 && selected.has(untaggedFilterValue);
    return matchesTag || matchesUntagged;
  });
});
const visibleNoteCount = computed(() => visibleNotes.value.length);
const filterStatText = computed(() => `${visibleNoteCount.value} / ${totalNoteCount.value} 篇`);
const activeFilterCount = computed(() => selectedFilterValues.value.length);

const showWorkspaceTree = ref(false);
const showTypeFilters = ref(false);
const workspacePickerOpen = ref(false);
const workspacePickerBusy = ref(false);
const workspacePickerLoading = ref(false);
const pendingWorkspaceAction = ref<
  | null
  | { type: 'new-note' }
  | { type: 'convert-text'; entry: LibraryEntry }
>(null);
const contextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  entry: LibraryEntry | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  entry: null,
});

const contextTargetNote = computed(() => contextMenu.value.note);
const contextHasTarget = computed(() => contextTargetNote.value !== null);
const contextTargetIsDraft = computed(() => contextTargetNote.value?.isDraft === true);

const displayEntries = computed<LibraryEntry[]>(() =>
  visibleEntries.value.filter(entry => entry.kind === 'document' || entry.kind === 'text'),
);

const workspaceTreeEntries = computed<LibraryEntry[]>(() => {
  const value = unref((library as unknown as { workspaceTree?: LibraryEntry[] }).workspaceTree);
  return Array.isArray(value) ? value : [];
});

const availableWorkspaces = computed<Workspace[]>(() => {
  const value = unref((library as unknown as { workspaces?: Workspace[] }).workspaces);
  return Array.isArray(value) ? value : [];
});

const currentWorkspace = computed<Workspace | null>(() => {
  const value = unref((library as unknown as { currentWorkspace?: Workspace | null }).currentWorkspace);
  return value && typeof value === 'object' ? value : null;
});

const currentContext = computed<MainListContext>(() => {
  const value = unref((library as unknown as { context?: MainListContext }).context);
  return value ? value : defaultContext;
});

const currentWorkspaceLabel = computed(() => {
  const value = unref((library as unknown as { currentWorkspaceLabel?: string }).currentWorkspaceLabel);
  return typeof value === 'string' ? value : '';
});

const currentWorkspaceName = computed(() => {
  if (!currentContext.value.workspaceId) {
    return '未选择工作区';
  }

  return currentWorkspace.value?.name || currentWorkspaceLabel.value || currentContext.value.workspaceId;
});

const currentWorkspaceTitle = computed(() => {
  if (!currentContext.value.workspaceId) {
    return '未选择工作区';
  }

  const rootPath = currentWorkspace.value?.rootPath;
  return rootPath ? `${currentWorkspaceName.value}\n${rootPath}` : currentWorkspaceName.value;
});

const activeTypeFilters = computed<Array<'folder' | 'group' | 'document' | 'text'>>(() => {
  const value = unref((library as unknown as {
    typeFilters?: Array<'folder' | 'group' | 'document' | 'text'>;
  }).typeFilters);
  return Array.isArray(value) ? value : ['folder', 'group', 'document', 'text'];
});

const contextTargetEntry = computed(() => contextMenu.value.entry);
const canConvertContextEntry = computed(() => contextTargetEntry.value?.kind === 'text');

function asBadgeKind(kind: LibraryEntry['kind']) {
  return kind as 'folder' | 'group' | 'document' | 'text';
}

function normalizeDisplayPath(path: string) {
  return path.replace(/\\/g, '/');
}

function trimTrailingPathSeparator(path: string) {
  const trimmed = normalizeDisplayPath(path).replace(/\/+$/, '');
  return trimmed || normalizeDisplayPath(path);
}

function workspaceRelativePath(entry: LibraryEntry) {
  const filePath = entry.filePath?.trim();
  if (!filePath) {
    return '';
  }

  const rootPath = currentWorkspace.value?.rootPath?.trim();
  if (!rootPath) {
    return filePath;
  }

  const normalizedFile = normalizeDisplayPath(filePath);
  const normalizedRoot = trimTrailingPathSeparator(rootPath);
  const fileForCompare = normalizedFile.toLowerCase();
  const rootForCompare = normalizedRoot.toLowerCase();

  if (fileForCompare === rootForCompare) {
    return entry.title;
  }

  const rootPrefix = normalizedRoot === '/' ? '/' : `${normalizedRoot}/`;
  const comparePrefix = normalizedRoot === '/' ? '/' : `${rootForCompare}/`;
  if (fileForCompare.startsWith(comparePrefix)) {
    return normalizedFile.slice(rootPrefix.length);
  }

  return filePath;
}

function entryMetaLabel(entry: LibraryEntry) {
  if (entry.kind === 'document') {
    return workspaceRelativePath(entry) || '工作区文档';
  }

  return entry.tags.length ? `#${entry.tags.join(' #')}` : '无标签';
}

function setListContext(next: Partial<MainListContext>) {
  const rawContext = (library as unknown as { context?: MainListContext | { value: MainListContext } }).context;
  if (!rawContext) return;

  if (typeof rawContext === 'object' && rawContext !== null && 'value' in rawContext) {
    Object.assign(rawContext.value, next);
    return;
  }

  Object.assign(rawContext, next);
}

async function loadMainList() {
  if (typeof library.loadMainList === 'function') {
    await library.loadMainList();
  }
}

async function loadWorkspaceTree(workspaceId: string | null) {
  const maybeLoader = (library as unknown as { loadWorkspaceTree?: (workspaceId: string) => Promise<void> }).loadWorkspaceTree;
  if (typeof maybeLoader !== 'function') {
    return;
  }

  if (!workspaceId) {
    showWorkspaceTree.value = false;
    return;
  }

  await maybeLoader(workspaceId);
}

async function loadWorkspaces() {
  const maybeLoader = (library as unknown as { loadWorkspaces?: () => Promise<void> }).loadWorkspaces;
  if (typeof maybeLoader !== 'function') {
    return;
  }
  workspacePickerLoading.value = true;
  try {
    // "新建速记"按钮语义 = 全新空白浮窗。多份草稿天然共存，浮窗会按
    // fresh=true 走空白态、autosave 时由后端分配新 UUID 创建独立草稿，
    // 已存在的"未保存"卡片保持不动。
    await win.openQuicknote({ fresh: true });
  } catch (e) {
    message.error(`打开失败：${String(e)}`);
  }
}

async function refreshListAndTree() {
  await loadMainList();
  await loadWorkspaceTree(currentContext.value.workspaceId);
}

/**
 * 草稿笔记不允许进入编辑页 / 内联编辑标题、标签或置顶——所有改动都得通过
 * 速记浮窗走。命中时弹一次提示并返回 true，调用方据此短路自己的逻辑。
 */
function blockDraftEdit(note: Note): boolean {
  if (note.isDraft) {
    message.warning('未保存的笔记，不允许在编辑页面打开');
    return true;
  }
  return false;
}

async function onOpenNoteEditor(note: Note) {
  if (note.isDraft) {
    // 未保存草稿走速记浮窗：按 noteId 让浮窗 hydrate 这份指定草稿。
    try {
      await win.openQuicknote({ noteId: note.id });
    } catch (e) {
      message.error(`打开速记浮窗失败：${String(e)}`);
    }
    return;
  }
  ui.navigateTo('note-editor', note.id);
}

async function onSaveDraftFromCard(note: Note) {
  if (!note.isDraft) return;
  try {
    const promoted = await db.promoteDraft(note.id);
    if (promoted) {
      notes.syncExternalNote(promoted);
      notes.purgeLocal(note.id);
      void appEvents.emitNoteSaved(promoted);
      void appEvents.emitNoteRemoved({ id: note.id });
      message.success('笔记已保存');
    } else {
      message.warning('草稿内容为空，无法保存');
    }
  } catch (e) {
    message.error(`保存失败：${String(e)}`);
  }
}

function closeContextMenu() {
  contextMenu.value.visible = false;
  contextMenu.value.entry = null;
}

function closeWorkspacePicker() {
  workspacePickerOpen.value = false;
  pendingWorkspaceAction.value = null;
}

function openContextMenu(event: MouseEvent, entry: LibraryEntry) {
  event.preventDefault();
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    entry,
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
  void onOpenNoteEditor(note);
}

async function onContextSaveDraft() {
  const note = contextTargetNote.value;
  if (!note || !note.isDraft) return;
  closeContextMenu();
  await onSaveDraftFromCard(note);
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
  await exportNote(note, format);
}

async function onCardExportSelect(key: string, note: Note) {
  await exportNote(note, key as 'markdown' | 'html' | 'pdf');
}

async function exportNote(note: Note, format: 'markdown' | 'html' | 'pdf') {
  try {
    await win.openQuicknote();
  } catch (error) {
    message.error(`打开速记失败：${String(error)}`);
  }
}

async function onNewNote() {
  if (!currentContext.value.workspaceId) {
    pendingWorkspaceAction.value = { type: 'new-note' };
    workspacePickerOpen.value = true;
    await loadWorkspaces();
    return;
  }
  ui.navigateTo('note-editor');
  closeContextMenu();
  await onConfirmDelete(note);
}

async function onOpenEntry(entry: LibraryEntry) {
  if (entry.kind === 'folder') {
    setListContext({
      folderEntryId: entry.id,
      selectedEntryId: entry.id,
    });
    closeContextMenu();
    await refreshListAndTree();
    return;
  }

  if (entry.kind === 'group') {
    setListContext({
      groupEntryId: entry.id,
      selectedEntryId: entry.id,
    });
    closeContextMenu();
    await loadMainList();
    return;
  }

  closeContextMenu();
  ui.navigateTo('note-editor', entry.id);
}

function onAddTagRow() {
  if (tagDraftRows.value.length >= 3) {
    message.warning('最多只能添加 3 个标签');
    return;
  }
  tagDraftRows.value.push('');
}

async function onContextConvertToDocument() {
  const entry = contextTargetEntry.value;
  if (!entry || entry.kind !== 'text') {
    return;
  }

  const workspaceId = currentContext.value.workspaceId;
  if (!workspaceId) {
    pendingWorkspaceAction.value = { type: 'convert-text', entry };
    workspacePickerOpen.value = true;
    await loadWorkspaces();
    return;
  }

  await convertTextEntryToDocument(entry, workspaceId, currentContext.value.folderEntryId);
}

async function convertTextEntryToDocument(
  entry: LibraryEntry,
  workspaceId: string,
  folderEntryId: string | null,
) {
  const convertTextToDocument = (db as unknown as {
    convertTextToDocument?: (input: {
      id: string;
      workspaceId: string;
      folderEntryId?: string | null;
    }) => Promise<unknown>;
  }).convertTextToDocument;

  if (typeof convertTextToDocument !== 'function') {
    message.error('当前版本暂不支持转为文档');
    return;
  }

  try {
    await convertTextToDocument({
      id: entry.id,
      workspaceId,
      folderEntryId,
    });
    closeContextMenu();
    await refreshListAndTree();
    message.success('已转为文档');
  } catch (error) {
    message.error(`转为文档失败：${String(error)}`);
  }
}

function toggleWorkspaceTree() {
  showWorkspaceTree.value = !showWorkspaceTree.value;
}

async function onOpenCurrentWorkspaceFolder() {
  const rootPath = currentWorkspace.value?.rootPath;
  if (!rootPath) {
    message.warning('请先选择工作区');
    return;
  }

async function onConfirmTagDialog() {
  const note = tagDialogNote.value;
  if (!note) return;
  const tags = parseTagRows(tagDraftRows.value);
  if (tags.length > 3) {
    message.warning('最多只能添加 3 个标签');
    return;
  }
  try {
    await notes.saveDraft(buildSaveRequest(note, { tags }));
    onCloseTagDialog();
  } catch (e) {
    message.error(String(e));
  }
}

function rememberWorkspace(workspace: Workspace) {
  const maybeUpsert = (library as unknown as { upsertWorkspace?: (workspace: Workspace) => void }).upsertWorkspace;
  if (typeof maybeUpsert === 'function') {
    maybeUpsert(workspace);
  }
}

async function onTogglePin(note: Note) {
  if (blockDraftEdit(note)) return;
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择工作区文件夹',
    });
    if (typeof selected !== 'string' || !selected) {
      return;
    }

const editingTitleId = ref<string | null>(null);
const titleDraft = ref('');

async function onStartTitleEdit(note: Note) {
  if (blockDraftEdit(note)) return;
  editingTitleId.value = note.id;
  titleDraft.value = note.title;
  await nextTick();
  const input = document.querySelector<HTMLInputElement>(
    `[data-testid="card-title-input-${note.id}"] input`,
  );
  input?.focus();
  input?.select();
}

function onCancelTitleEdit() {
  editingTitleId.value = null;
  titleDraft.value = '';
}

async function onSaveTitleEdit(note: Note) {
  const next = titleDraft.value.trim();
  if (next === note.title) {
    editingTitleId.value = null;
    return;
  }
  if (next) {
    const conflict = notes.notes.find(n => n.id !== note.id && n.title === next);
    if (conflict) {
      message.error(`已存在同名笔记「${next}」，请更换标题`);
      return;
    }
  }
  try {
    await notes.saveDraft(buildSaveRequest(note, { title: next }));
    editingTitleId.value = null;
    message.success('标题已保存');
  } catch (e) {
    message.error(`保存失败：${String(e)}`);
  }
}

async function onConfirmDelete(note: Note) {
  try {
    if (note.isPinned) {
      await win.closeStickyNote(note.id).catch(() => undefined);
    }
    await notes.removeNote(note.id);
    message.success(`已删除「${note.title || '无标题'}」`);
  } catch (e) {
    message.error(`删除失败：${String(e)}`);
  }
}

function onOpenTagDialogForCard(note: Note) {
  if (blockDraftEdit(note)) return;
  tagDialogNote.value = note;
  tagDraftRows.value = note.tags.length ? [...note.tags] : [''];
  tagDialogVisible.value = true;
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
          <span v-if="activeFilterCount > 0" class="filter-badge">{{ activeFilterCount }}</span>
        </button>
        <div v-if="filterOpen" class="filter-menu" data-testid="filter-menu" role="menu">
          <header class="filter-menu__header">
            <strong>按标签筛选</strong>
            <button type="button" class="filter-menu__reset" data-testid="filter-clear" @click="onResetFilters">
              重置
            </button>
          </header>
          <div class="filter-list">
            <label
              class="filter-row filter-row--all"
              :class="{ 'filter-row--checked': isAllFiltersSelected }"
              data-testid="filter-select-all"
            >
              <input
                type="checkbox"
                :checked="isAllFiltersSelected"
                @change="onToggleAllFiltersChange"
              >
              <span class="filter-row__check" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span class="filter-row__name">全部笔记</span>
              <span class="filter-row__count">{{ totalNoteCount }}</span>
            </label>
            <label
              v-for="option in filterOptions"
              :key="option.value"
              class="filter-row"
              :class="{
                'filter-row--checked': isFilterValueSelected(option.value),
                'filter-row--untagged': option.value === untaggedFilterValue,
              }"
              :data-testid="option.testId"
            >
              <input
                v-model="selectedFilterValues"
                type="checkbox"
                :value="option.value"
              >
              <span class="filter-row__check" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span class="filter-row__name">{{ option.label }}</span>
              <span class="filter-row__count">{{ option.count }}</span>
            </label>
          </div>
          <footer class="filter-menu__footer">
            <span data-testid="filter-stat">{{ filterStatText }}</span>
            <button type="button" data-testid="filter-apply" @click="onApplyFilters">
              完成
            </button>
          </footer>
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
        @contextmenu.stop="onContextMenuNote($event, note)"
      >
        <header class="note-card-header" @click.stop>
          <div class="note-card-title-area">
            <span
              v-if="note.isDraft"
              class="note-card-draft-tag"
              data-testid="card-draft-tag"
              title="未保存的草稿，仅可在速记浮窗里继续编辑"
            >未保存</span>
            <span v-if="note.isPinned" class="note-pin"></span>
            <h3
              v-if="editingTitleId !== note.id"
              class="note-card-title"
              @click="onStartTitleEdit(note)"
            >
              {{ note.title || '无标题' }}
            </h3>
            <NInput
              v-else
              v-model:value="titleDraft"
              size="tiny"
              :bordered="false"
              class="note-card-title-input"
              :data-testid="`card-title-input-${note.id}`"
              @keydown.enter.prevent="onSaveTitleEdit(note)"
              @keydown.esc.prevent="onCancelTitleEdit"
              @blur="onSaveTitleEdit(note)"
            />
            <NButton
              quaternary
              circle
              size="tiny"
              :title="editingTitleId === note.id ? '保存标题' : '编辑标题'"
              :data-testid="`card-title-edit-${note.id}`"
              class="note-card-title-action"
              @click="editingTitleId === note.id ? onSaveTitleEdit(note) : onStartTitleEdit(note)"
            >
              <template #icon>
                <NIcon>
                  <svg
                    v-if="editingTitleId === note.id"
                    viewBox="0 0 24 24"
                    width="12"
                    height="12"
                    fill="currentColor"
                  >
                    <path d="m9 16.17-3.88-3.88a.996.996 0 1 0-1.41 1.41l4.59 4.59c.39.39 1.02.39 1.41 0L21.7 6.7a.996.996 0 1 0-1.41-1.41z" />
                  </svg>
                  <svg
                    v-else
                    viewBox="0 0 24 24"
                    width="12"
                    height="12"
                    fill="currentColor"
                  >
                    <path d="M3 17.46V21h3.54l10.4-10.4-3.54-3.54L3 17.46zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.54 3.54 2.04-2.04z" />
                  </svg>
                </NIcon>
              </template>
            </NButton>
          </div>
          <NPopconfirm
            placement="bottom-end"
            positive-text="删除"
            negative-text="取消"
            @positive-click="onConfirmDelete(note)"
          >
            <template #trigger>
              <NButton
                quaternary
                circle
                size="tiny"
                title="删除"
                data-testid="card-action-delete"
              >
                <template #icon>
                  <NIcon>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z" />
                    </svg>
                  </NIcon>
                </template>
              </NButton>
            </template>
            确定删除「{{ note.title || '无标题' }}」吗？此操作不可恢复。
          </NPopconfirm>
        </header>

        <div class="note-card-content" @dblclick="onOpenNoteEditor(note)">
          <p class="note-card-preview">{{ previewText(note.content) }}</p>
          <span class="note-card-time">{{ formatUpdatedAt(note.updatedAt) }}</span>
        </div>

        <footer class="note-card-footer" @click.stop>
          <div
            class="note-card-tags"
            :class="{ 'note-card-tags-empty': note.tags.length === 0 }"
            :data-testid="`card-tags-${note.id}`"
          >
            <template v-if="note.tags.length > 0">
              <span v-for="tag in note.tags.slice(0, 2)" :key="tag" class="note-card-tag">#{{ tag }}</span>
              <span v-if="note.tags.length > 2" class="note-card-tag note-card-tag-more">+{{ note.tags.length - 2 }}</span>
            </template>
            <span v-else>空标签</span>
            <NButton
              quaternary
              circle
              size="tiny"
              title="编辑标签"
              :data-testid="`card-tags-edit-${note.id}`"
              class="note-card-tags-action"
              @click="onOpenTagDialogForCard(note)"
            >
              <template #icon>
                <NIcon>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                    <path d="M3 17.46V21h3.54l10.4-10.4-3.54-3.54L3 17.46zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.54 3.54 2.04-2.04z" />
                  </svg>
                </NIcon>
              </template>
            </NButton>
          </div>
          <div class="note-card-actions" data-testid="card-actions">
            <NButton
              quaternary
              size="tiny"
              title="编辑"
              data-testid="card-action-edit"
              @click="onOpenNoteEditor(note)"
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
              data-testid="card-action-pin"
              :disabled="note.isDraft"
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
              v-if="!note.isDraft"
              :options="cardExportOptions"
              trigger="click"
              @select="key => onCardExportSelect(key, note)"
            >
              <NButton quaternary size="tiny" title="导出" data-testid="card-action-export">
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
              v-else
              quaternary
              size="tiny"
              title="未保存的草稿，请先在速记浮窗中保存"
              data-testid="card-action-export"
              :disabled="true"
            >
              <template #icon>
                <NIcon>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z" />
                  </svg>
                </NIcon>
              </template>
            </NButton>
          </div>
        </footer>
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
      </header>

      <section
        v-if="showTypeFilters"
        class="main-filter-panel"
        data-testid="main-type-filter-panel"
      >
        <button
          v-for="option in typeFilterOptions"
          :key="option.kind"
          type="button"
          class="main-filter-chip"
          :class="{ 'main-filter-chip--active': activeTypeFilters.includes(option.kind) }"
          :data-testid="`type-filter-${option.kind}`"
          @click.stop="onToggleTypeFilter(option.kind)"
        >
          {{ option.label }}
        </button>
      </section>
    </div>

    <div class="main-body">
      <div class="main-layout" :class="{ 'main-layout--with-sidebar': showWorkspaceTree }">
        <div class="main-content" data-testid="main-scroll-region">
          <div v-if="displayEntries.length > 0" class="entry-grid">
            <article
              v-for="entry in displayEntries"
              :key="entry.id"
              class="entry-card"
              :data-kind="entry.kind"
              @click.stop="onOpenEntry(entry)"
              @contextmenu.stop="openContextMenu($event, entry)"
            >
              <div class="entry-card-head">
                <h2>{{ entry.title }}</h2>
                <EntryTypeBadge :kind="asBadgeKind(entry.kind)" />
              </div>
              <p class="entry-card-preview">{{ entry.previewText || '暂无摘要内容' }}</p>
              <div class="entry-card-meta" :title="entryMetaLabel(entry)">
                <span>{{ entryMetaLabel(entry) }}</span>
              </div>
            </article>
          </div>

          <div v-else class="main-empty">
            <h2>这里还没有内容</h2>
            <p>你可以先创建文档，或者用速记把文本收进默认分组。</p>
          </div>
        </div>

        <aside v-if="showWorkspaceTree" class="main-sidebar">
          <WorkspaceTreePanel
            v-if="workspaceTreeEntries.length > 0"
            :entries="workspaceTreeEntries"
            @select="onOpenEntry"
          />
          <div v-else class="workspace-tree-empty">
            先选择工作区后，再查看当前工作区结构。
          </div>
        </aside>
      </div>
    </div>

    <div class="main-footer-shell" data-testid="main-footer-shell">
      <footer class="main-footer">
        <div class="main-footer-workspace" data-testid="main-footer-workspace">
          <button
            type="button"
            class="main-footer-icon-button"
            data-testid="main-footer-open-workspace-folder"
            :disabled="!currentWorkspace?.rootPath"
            :title="currentWorkspace?.rootPath ? `打开文件夹：${currentWorkspace.rootPath}` : '未选择工作区'"
            aria-label="打开当前工作区文件夹"
            @click.stop="onOpenCurrentWorkspaceFolder"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M4 6h6l2 2h8v10H4z" />
              <path d="M4 10h16" />
            </svg>
          </button>
          <span class="main-footer-workspace-name" :title="currentWorkspaceTitle">
            {{ currentWorkspaceName }}
          </span>
          <button
            type="button"
            class="main-footer-icon-button"
            data-testid="main-footer-switch-workspace"
            title="切换工作区"
            aria-label="切换工作区"
            @click.stop="onOpenWorkspaceSwitcher"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M16 3h5v5" />
              <path d="M21 3l-7 7" />
              <path d="M8 21H3v-5" />
              <path d="M3 21l7-7" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          class="main-footer-icon-button main-footer-icon-button--tree"
          :class="{ 'main-footer-icon-button--active': showWorkspaceTree }"
          data-testid="main-footer-open-tree"
          :aria-pressed="showWorkspaceTree"
          :title="showWorkspaceTree ? '收起结构栏' : '展开工作区结构'"
          :aria-label="showWorkspaceTree ? '收起工作区结构' : '展开工作区结构'"
          @click.stop="toggleWorkspaceTree"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M5 4h5v5H5z" />
            <path d="M14 4h5v5h-5z" />
            <path d="M14 15h5v5h-5z" />
            <path d="M10 6.5h2a2 2 0 0 1 2 2V17" />
            <path d="M10 6.5h4" />
          </svg>
        </button>
      </footer>
    </div>

    <div
      v-if="contextMenu.visible"
      class="entry-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button type="button" class="context-item" @click="onNewNote">
        新建笔记
      </button>
      <button
        type="button"
        class="context-item"
        data-testid="context-convert-document"
        :disabled="!canConvertContextEntry"
        :aria-disabled="canConvertContextEntry ? 'false' : 'true'"
        @click="onContextConvertToDocument"
      >
        编辑
      </button>
      <button
        class="context-item"
        type="button"
        data-testid="context-save-draft"
        :disabled="!contextTargetIsDraft"
        :aria-disabled="!contextTargetIsDraft"
        role="menuitem"
        @click="onContextSaveDraft"
      >
        保存
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
              class="main-tag-input"
              :data-testid="`main-tag-input-${index}`"
            />
            <NButton
              quaternary
              circle
              size="small"
              class="main-tag-delete"
              :aria-label="`删除标签 ${index + 1}`"
              :data-testid="`main-tag-delete-${index}`"
              @click="onDeleteTagRow(index)"
            >
              ×
            </NButton>
          </div>
          <NButton
            size="small"
            tertiary
            class="main-dialog-cancel"
            data-testid="main-tag-add"
            :disabled="tagDraftRows.length >= 3"
            @click="onAddTagRow"
          >
            添加标签
          </NButton>
        </div>
        <div class="main-dialog-actions">
          <NButton size="small" class="main-dialog-cancel" @click="onCloseTagDialog">取消</NButton>
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
          class="main-rename-dialog-input"
          data-testid="main-rename-input"
        />
        <div class="main-dialog-actions">
          <NButton size="small" class="main-dialog-cancel" @click="onCloseRenameDialog">取消</NButton>
          <NButton size="small" type="primary" data-testid="main-rename-confirm" @click="onConfirmRenameDialog">
            保存
          </NButton>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.main-root {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 10px;
  height: 100%;
  min-height: 100%;
  padding: 14px 14px 0;
  overflow: hidden;
  background: var(--app-bg);
  color: var(--app-fg);
}

.main-top {
  position: sticky;
  top: 14px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.main-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 44px;
  padding: 6px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: color-mix(in oklch, var(--app-surface) 94%, var(--app-bg));
  backdrop-filter: blur(12px);
  box-shadow: 0 14px 28px oklch(14% 0.01 70 / 0.14);
}

.main-toolbar {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
}

.main-toolbar-button {
  min-width: 82px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid color-mix(in oklch, var(--app-accent) 78%, transparent);
  border-radius: 7px;
  background: var(--app-accent);
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}

.main-toolbar-button--secondary {
  border-color: var(--app-border);
  background: var(--app-surface-2);
  color: var(--app-muted);
}

.main-toolbar-button:hover {
  border-color: var(--app-accent);
}

.main-toolbar-button--secondary:hover {
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.main-body {
  min-height: 0;
  overflow: hidden;
}

.main-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  align-items: stretch;
  height: 100%;
  min-height: 0;
}

.main-layout--with-sidebar {
  grid-template-columns: minmax(0, 1fr) minmax(260px, 300px);
}

.main-filter-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: color-mix(in oklch, var(--app-surface) 92%, var(--app-bg));
  backdrop-filter: blur(10px);
}

.main-filter-chip {
  min-width: 64px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: transparent;
  color: var(--app-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.main-filter-chip--active {
  border-color: color-mix(in oklch, var(--app-accent) 70%, var(--app-border));
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.main-content {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.entry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.entry-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 132px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.16s ease;
}

.entry-card:hover {
  border-color: color-mix(in oklch, var(--app-accent) 55%, var(--app-border));
  background: color-mix(in oklch, var(--app-surface-2) 70%, var(--app-surface));
}

.entry-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.entry-card-head h2 {
  margin: 0;
  overflow: hidden;
  color: var(--app-fg);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-card-preview {
  flex: 1;
  margin: 0;
  overflow: hidden;
  color: var(--app-muted);
  display: -webkit-box;
  font-size: 12.5px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.entry-card-meta {
  min-width: 0;
  overflow: hidden;
  color: var(--app-faint);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main-empty,
.workspace-tree-empty {
  padding: 18px;
  border: 1px dashed var(--app-border);
  border-radius: 8px;
  background: color-mix(in oklch, var(--app-surface) 58%, transparent);
  color: var(--app-muted);
  line-height: 1.7;
}

.main-empty h2 {
  margin: 0 0 8px;
  color: var(--app-fg);
  font-size: 15px;
}

.main-empty p {
  margin: 0;
}

.main-sidebar {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.main-footer-shell {
  min-height: 47px;
  margin-inline: -14px;
  padding: 0 14px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
}

.main-footer {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 46px;
  gap: 8px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--app-muted);
  font-size: 13px;
}

.main-footer-workspace {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 1 380px;
  min-width: 0;
  max-width: min(420px, 45vw);
}

.main-footer-workspace-name {
  min-width: 0;
  max-width: min(260px, 28vw);
  overflow: hidden;
  color: var(--app-fg);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main-footer-icon-button {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-muted);
  font: inherit;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.main-footer-icon-button:hover:not(:disabled),
.main-footer-icon-button--active {
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.main-footer-icon-button:disabled {
  color: var(--app-faint);
  cursor: not-allowed;
}

.main-footer-icon-button svg {
  width: 16px;
  height: 16px;
}

.main-footer-icon-button--tree {
  margin-left: 2px;
}

.entry-context-menu {
  position: fixed;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 156px;
  padding: 6px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: 0 16px 36px oklch(10% 0.01 70 / 0.35);
}

.context-item {
  min-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-fg);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}

.context-item:hover:not(:disabled) {
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.context-item:disabled {
  color: var(--app-faint);
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .main-layout--with-sidebar {
    grid-template-columns: 1fr;
  }

  .main-footer {
    flex-wrap: wrap;
    gap: 6px;
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

.main-tag-input,
.main-rename-dialog-input {
  --n-text-color: #2a2a2a !important;
  --n-placeholder-color: #8a7c70 !important;
  --n-color: #fffdf9 !important;
  --n-color-focus: #fffdf9 !important;
  --n-caret-color: #2a2a2a !important;
  --n-border: 1px solid rgba(55, 46, 36, 0.22) !important;
  --n-border-hover: 1px solid rgba(55, 46, 36, 0.38) !important;
  --n-border-focus: 1px solid #18a058 !important;
}

.main-tag-input :deep(.n-input__placeholder),
.main-tag-input :deep(input::placeholder),
.main-rename-dialog-input :deep(.n-input__placeholder),
.main-rename-dialog-input :deep(input::placeholder) {
  color: #8a7c70 !important;
}

.main-tag-input :deep(.n-input__input-el),
.main-tag-input :deep(input),
.main-rename-dialog-input :deep(.n-input__input-el),
.main-rename-dialog-input :deep(input) {
  color: #2a2a2a !important;
  -webkit-text-fill-color: #2a2a2a;
  caret-color: #2a2a2a;
}

.main-tag-delete :deep(.n-button),
.main-dialog-cancel,
.main-tag-delete {
  --n-text-color: #6f5c4c !important;
  --n-text-color-hover: #2f2923 !important;
  --n-text-color-pressed: #2f2923 !important;
  --n-text-color-focus: #2f2923 !important;
  --n-color-hover: rgba(55, 46, 36, 0.08) !important;
  --n-color-pressed: rgba(55, 46, 36, 0.12) !important;
  --n-color-focus: rgba(55, 46, 36, 0.08) !important;
  color: #6f5c4c !important;
}

.main-tag-delete :deep(.n-button__content),
.main-dialog-cancel :deep(.n-button__content) {
  color: inherit;
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
  cursor: default;
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

.note-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.note-card-title-area {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}

.note-pin {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 999px;
  background: oklch(61% 0.13 42);
}

.note-card-draft-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  border: 1px solid oklch(85% 0.005 80);
  border-radius: 4px;
  background: oklch(94% 0.005 80);
  color: oklch(55% 0.012 80);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.02em;
  cursor: default;
}

.note-card-title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: text;
  flex: 0 1 auto;
}

.note-card-title-input {
  flex: 1 1 auto;
  min-width: 0;
}

.note-card-title-input :deep(input) {
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.3;
  padding: 0;
}

.note-card-title-action {
  flex: 0 0 auto;
}

.note-card-header :deep(.n-button) {
  color: oklch(45% 0.018 70);
}

.note-card-header :deep(.n-button:hover) {
  color: oklch(35% 0.02 70);
}

.note-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  margin-bottom: 8px;
  min-height: 56px;
  cursor: text;
}

.note-card-preview {
  flex: 1;
  margin: 0;
  color: color-mix(in oklch, oklch(20% 0.02 70) 78%, oklch(49% 0.018 70));
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.55;
  padding-right: 64px;
}

.note-card-time {
  position: absolute;
  right: 0;
  bottom: 0;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 10.5px;
  color: oklch(49% 0.018 70);
}

.note-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed oklch(90% 0.012 78);
}

.note-card.paper-1 .note-card-footer {
  border-top-color: oklch(86% 0.04 88);
}

.note-card-tags {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  gap: 4px;
  overflow: hidden;
  font-size: 10.5px;
  color: oklch(49% 0.018 70);
}

.note-card-tag {
  flex: 0 0 auto;
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 6px;
  border: 1px solid oklch(88% 0.012 78);
  border-radius: 3px;
  background: color-mix(in oklch, oklch(99% 0.006 78) 60%, transparent);
}

.note-card-tag-more {
  font-weight: 600;
  color: oklch(45% 0.018 70);
  background: color-mix(in oklch, oklch(94% 0.012 78) 70%, transparent);
}

.note-card-tags-empty {
  font-style: italic;
  color: oklch(60% 0.012 78);
}

.note-card-tags-action {
  flex: 0 0 auto;
  color: oklch(45% 0.018 70);
}

.note-card-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}

.note-card-actions :deep(.n-button) {
  color: oklch(45% 0.018 70);
}

.note-card-actions :deep(.n-button:hover) {
  color: oklch(35% 0.02 70);
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
    padding: 10px 10px 0;
  }

  .main-top {
    top: 10px;
  }

  .main-header {
    padding: 6px;
  }

  .main-toolbar {
    width: 100%;
    justify-content: flex-start;
  }

  .main-toolbar-button {
    flex: 1;
  }

  .main-footer-shell {
    margin-inline: -10px;
    padding: 0 10px;
  }

  .main-footer {
    padding: 6px 0;
  }

  .main-footer-workspace-name {
    max-width: 48vw;
  }
}
</style>
