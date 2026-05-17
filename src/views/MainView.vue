<script setup lang="ts">
import { computed, onMounted, ref, unref, watch } from 'vue';
import { useMessage } from 'naive-ui';

import EntryTypeBadge from '@/components/EntryTypeBadge.vue';
import WorkspaceTreePanel from '@/components/WorkspaceTreePanel.vue';
import { useDb } from '@/composables/useDb';
import { useWindow } from '@/composables/useWindow';
import { useLibraryStore } from '@/stores/library';
import { useUiStore } from '@/stores/ui';
import type { LibraryEntry, MainListContext } from '@/types/steno';

interface EntryStats {
  folders: number;
  groups: number;
  documents: number;
  texts: number;
}

const defaultContext: MainListContext = {
  workspaceId: null,
  folderEntryId: null,
  groupEntryId: null,
  selectedEntryId: null,
};

const defaultStats: EntryStats = {
  folders: 0,
  groups: 0,
  documents: 0,
  texts: 0,
};

const library = useLibraryStore();
const ui = useUiStore();
const win = useWindow();
const db = useDb();
const message = useMessage();

const showWorkspaceTree = ref(false);
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

const workspaceTreeEntries = computed<LibraryEntry[]>(() => {
  const value = unref((library as unknown as { workspaceTree?: LibraryEntry[] }).workspaceTree);
  return Array.isArray(value) ? value : [];
});

const currentContext = computed<MainListContext>(() => {
  const value = unref((library as unknown as { context?: MainListContext }).context);
  return value ? value : defaultContext;
});

const currentWorkspaceLabel = computed(() => {
  const value = unref((library as unknown as { currentWorkspaceLabel?: string }).currentWorkspaceLabel);
  return typeof value === 'string' ? value : '';
});

const stats = computed<EntryStats>(() => {
  const value = unref((library as unknown as { stats?: Partial<EntryStats> }).stats);
  return {
    ...defaultStats,
    ...(value ?? {}),
  };
});

const contextTargetEntry = computed(() => contextMenu.value.entry);
const canConvertContextEntry = computed(() => contextTargetEntry.value?.kind === 'text');

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

function onNewNote() {
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

async function onContextConvertToDocument() {
  const entry = contextTargetEntry.value;
  if (!entry || entry.kind !== 'text') {
    return;
  }

  const workspaceId = currentContext.value.workspaceId;
  if (!workspaceId) {
    message.warning('请先选择工作区');
    return;
  }

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
      folderEntryId: currentContext.value.folderEntryId,
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
</script>

<template>
  <section class="main-root" @click="closeContextMenu">
    <header class="main-header">
      <div>
        <p class="main-eyebrow">Steno 工作台</p>
        <h1>文档与文本</h1>
        <p class="main-subtitle">当前页面同时展示工作区内容与全局文本分组。</p>
      </div>
      <div class="main-toolbar">
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

    <div class="main-layout">
      <div class="main-content">
        <div v-if="visibleEntries.length > 0" class="entry-grid">
          <article
            v-for="entry in visibleEntries"
            :key="entry.id"
            class="entry-card"
            :data-kind="entry.kind"
            @click.stop="onOpenEntry(entry)"
            @contextmenu.stop="openContextMenu($event, entry)"
          >
            <div class="entry-card-head">
              <h2>{{ entry.title }}</h2>
              <EntryTypeBadge :kind="entry.kind as 'folder' | 'group' | 'document' | 'text'" />
            </div>
            <p class="entry-card-preview">{{ entry.previewText || '暂无摘要内容' }}</p>
            <div class="entry-card-meta">
              <span>{{ entry.tags.length ? `#${entry.tags.join(' #')}` : '无标签' }}</span>
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
        />
        <div v-else class="workspace-tree-empty">
          先选择工作区后，再查看当前工作区结构。
        </div>
      </aside>
    </div>

    <footer class="main-footer">
      <div class="main-footer-workspace" data-testid="main-footer-workspace">
        {{
          currentContext.workspaceId
            ? `当前工作区：${currentWorkspaceLabel || currentContext.workspaceId}`
            : '未选择工作区'
        }}
      </div>
      <div class="main-footer-stats" data-testid="main-footer-stats">
        文档 {{ stats.documents }} · 文本 {{ stats.texts }} · 文件夹 {{ stats.folders }} · 分组 {{ stats.groups }}
      </div>
      <button
        type="button"
        class="main-footer-action"
        data-testid="main-footer-open-tree"
        @click.stop="toggleWorkspaceTree"
      >
        {{ showWorkspaceTree ? '收起结构栏' : '工作区结构' }}
      </button>
    </footer>

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
  </section>
</template>

<style scoped>
.main-root {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 100%;
  padding: 20px;
  color: #2d241d;
}

.main-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border: 1px solid rgba(128, 96, 68, 0.14);
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(245, 235, 223, 0.92), rgba(255, 250, 244, 0.96)),
    #fffdf8;
}

.main-eyebrow {
  margin: 0 0 6px;
  color: #9b6e45;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.main-header h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.1;
}

.main-subtitle {
  margin: 8px 0 0;
  color: rgba(45, 36, 29, 0.72);
  font-size: 14px;
  line-height: 1.6;
}

.main-toolbar {
  display: flex;
  gap: 10px;
}

.main-toolbar-button {
  min-width: 96px;
  height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: #9b6e45;
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.main-toolbar-button--secondary {
  background: rgba(155, 110, 69, 0.12);
  color: #8a5a38;
}

.main-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 280px);
  gap: 16px;
  align-items: start;
}

.main-content {
  min-width: 0;
}

.entry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.entry-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 180px;
  padding: 18px;
  border: 1px solid rgba(128, 96, 68, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 14px 30px rgba(70, 46, 20, 0.06);
  cursor: pointer;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease,
    border-color 0.16s ease;
}

.entry-card:hover {
  border-color: rgba(155, 110, 69, 0.28);
  box-shadow: 0 20px 36px rgba(70, 46, 20, 0.1);
  transform: translateY(-2px);
}

.entry-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.entry-card-head h2 {
  margin: 0;
  font-size: 17px;
  line-height: 1.35;
}

.entry-card-preview {
  flex: 1;
  margin: 0;
  color: rgba(45, 36, 29, 0.72);
  font-size: 13px;
  line-height: 1.7;
}

.entry-card-meta {
  color: rgba(45, 36, 29, 0.56);
  font-size: 12px;
}

.main-empty,
.workspace-tree-empty {
  padding: 28px 24px;
  border: 1px dashed rgba(128, 96, 68, 0.18);
  border-radius: 18px;
  background: rgba(255, 250, 244, 0.72);
  color: rgba(45, 36, 29, 0.72);
  line-height: 1.7;
}

.main-empty h2 {
  margin: 0 0 8px;
  font-size: 18px;
}

.main-empty p {
  margin: 0;
}

.main-sidebar {
  min-width: 0;
}

.main-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border: 1px solid rgba(128, 96, 68, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.76);
  color: rgba(45, 36, 29, 0.76);
  font-size: 13px;
}

.main-footer-workspace,
.main-footer-stats {
  min-width: 0;
}

.main-footer-action {
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: rgba(155, 110, 69, 0.12);
  color: #8a5a38;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.entry-context-menu {
  position: fixed;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 156px;
  padding: 8px;
  border: 1px solid rgba(128, 96, 68, 0.16);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 20px 40px rgba(45, 36, 29, 0.14);
}

.context-item {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #2d241d;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.context-item:hover:not(:disabled) {
  background: rgba(155, 110, 69, 0.08);
}

.context-item:disabled {
  color: rgba(45, 36, 29, 0.36);
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .main-layout {
    grid-template-columns: 1fr;
  }

  .main-footer {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (max-width: 720px) {
  .main-root {
    padding: 14px;
  }

  .main-header {
    flex-direction: column;
  }

  .main-toolbar {
    width: 100%;
  }

  .main-toolbar-button {
    flex: 1;
  }
}
</style>
