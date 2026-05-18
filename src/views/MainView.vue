<script setup lang="ts">
import { computed, onMounted, ref, unref, watch } from 'vue';
import { useMessage } from 'naive-ui';
import { open } from '@tauri-apps/plugin-dialog';

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
const message = useMessage();

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

const visibleEntries = computed<LibraryEntry[]>(() => {
  const value = unref((library as unknown as { visibleEntries?: LibraryEntry[] }).visibleEntries);
  return Array.isArray(value) ? value : [];
});

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
    await maybeLoader();
  } finally {
    workspacePickerLoading.value = false;
  }
}

async function refreshListAndTree() {
  await loadMainList();
  await loadWorkspaceTree(currentContext.value.workspaceId);
}

onMounted(() => {
  void refreshListAndTree();
});

watch(
  () => currentContext.value.workspaceId,
  (workspaceId, previousWorkspaceId) => {
    if (workspaceId === previousWorkspaceId) {
      return;
    }
    void loadWorkspaceTree(workspaceId);
  },
);

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

async function onNewQuickNote() {
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

async function onToggleTypeFilter(kind: 'folder' | 'group' | 'document' | 'text') {
  const maybeToggle = (library as unknown as {
    toggleTypeFilter?: (kind: 'folder' | 'group' | 'document' | 'text') => Promise<void> | void;
  }).toggleTypeFilter;
  if (typeof maybeToggle !== 'function') {
    return;
  }
  await maybeToggle(kind);
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

  try {
    await win.openPathInFileManager(rootPath);
  } catch (error) {
    message.error(`打开工作区文件夹失败：${String(error)}`);
  }
}

function rememberWorkspace(workspace: Workspace) {
  const maybeUpsert = (library as unknown as { upsertWorkspace?: (workspace: Workspace) => void }).upsertWorkspace;
  if (typeof maybeUpsert === 'function') {
    maybeUpsert(workspace);
  }
}

function deriveWorkspaceName(path: string) {
  const normalized = path.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || '新工作区';
}

async function finalizeWorkspaceSelection(workspace: Workspace) {
  rememberWorkspace(workspace);
  setListContext({
    workspaceId: workspace.id,
    folderEntryId: null,
    selectedEntryId: null,
  });
  workspacePickerOpen.value = false;
  await refreshListAndTree();

  const pending = pendingWorkspaceAction.value;
  pendingWorkspaceAction.value = null;

  if (!pending) {
    return;
  }

  if (pending.type === 'new-note') {
    ui.navigateTo('note-editor');
    return;
  }

  await convertTextEntryToDocument(pending.entry, workspace.id, null);
}

async function onSelectWorkspace(workspace: Workspace) {
  await finalizeWorkspaceSelection(workspace);
}

async function onCreateWorkspaceFromDirectory() {
  workspacePickerBusy.value = true;
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择工作区文件夹',
    });
    if (typeof selected !== 'string' || !selected) {
      return;
    }

    const createWorkspace = (db as unknown as {
      createWorkspace?: (input: { name?: string | null; rootPath: string }) => Promise<Workspace>;
    }).createWorkspace;

    if (typeof createWorkspace !== 'function') {
      message.error('当前版本暂不支持创建工作区');
      return;
    }

    const workspace = await createWorkspace({
      name: deriveWorkspaceName(selected),
      rootPath: selected,
    });
    await finalizeWorkspaceSelection(workspace);
    message.success('工作区已切换');
  } catch (error) {
    message.error(`创建工作区失败：${String(error)}`);
  } finally {
    workspacePickerBusy.value = false;
  }
}

async function onOpenWorkspaceSwitcher() {
  workspacePickerOpen.value = true;
  await loadWorkspaces();
}
</script>

<template>
  <section class="main-root" @click="closeContextMenu">
    <div class="main-top">
      <header class="main-header" data-testid="main-toolbar-shell">
        <div class="main-toolbar">
          <button
            type="button"
            class="main-toolbar-button main-toolbar-button--secondary"
            data-testid="main-filter-toggle"
            @click.stop="showTypeFilters = !showTypeFilters"
          >
            类型筛选
          </button>
          <button
            type="button"
            class="main-toolbar-button main-toolbar-button--secondary"
            data-testid="main-new-quicknote"
            @click.stop="onNewQuickNote"
          >
            速记
          </button>
          <button
            type="button"
            class="main-toolbar-button"
            data-testid="main-new-note"
            @click.stop="onNewNote"
          >
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
        转为文档
      </button>
    </div>

    <WorkspacePickerDialog
      :visible="workspacePickerOpen"
      :workspaces="availableWorkspaces"
      :loading="workspacePickerLoading"
      :busy="workspacePickerBusy"
      @close="closeWorkspacePicker"
      @select="onSelectWorkspace"
      @create="onCreateWorkspaceFromDirectory"
    />
  </section>
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

  .main-footer-workspace {
    flex: 1 1 260px;
    max-width: calc(100% - 38px);
  }
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
