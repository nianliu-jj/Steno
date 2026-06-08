/**
 * @file Pinia 状态管理 - library
 *
 * 组织 library 的核心逻辑、类型和协作边界，供 Pinia 状态管理 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import { useDb } from '@/composables/useDb';
import { useSettingsStore } from '@/stores/settings';
import type { EntryKind, LibraryEntry, MainListContext, Workspace } from '@/types/steno';

const FILTERABLE_ENTRY_KINDS: EntryKind[] = ['folder', 'group', 'document', 'text'];

// 函数 parseTypeFilters：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function parseTypeFilters(raw: string): EntryKind[] {
  // 局部常量 normalized：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const normalized = raw
    .split(',')
    .map(item => item.trim())
    .filter((item): item is EntryKind => FILTERABLE_ENTRY_KINDS.includes(item as EntryKind));

  return normalized.length > 0 ? normalized : [...FILTERABLE_ENTRY_KINDS];
}

// 函数 serializeTypeFilters：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function serializeTypeFilters(filters: EntryKind[]) {
  return filters.join(',');
}

// Store useLibraryStore：暴露模块状态、派生数据和写入动作，是跨组件共享状态的入口。
export const useLibraryStore = defineStore('library', () => {
  // 局部常量 db：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const db = useDb();
  // 局部常量 settings：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const settings = useSettingsStore();

  // 局部常量 entries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const entries = ref<LibraryEntry[]>([]);
  // 局部常量 workspaceTree：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const workspaceTree = ref<LibraryEntry[]>([]);
  // 局部常量 workspaces：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const workspaces = ref<Workspace[]>([]);
  // 局部常量 context：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const context = ref<MainListContext>({
    workspaceId: null,
    folderEntryId: null,
    groupEntryId: null,
    selectedEntryId: null
  });
  // 局部常量 typeFilters：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const typeFilters = ref<EntryKind[]>(parseTypeFilters(settings.state.mainListTypeFilters));

  watch(
    () => settings.state.mainListTypeFilters,
    raw => {
      // 局部常量 next：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const next = parseTypeFilters(raw);
      if (serializeTypeFilters(typeFilters.value) === serializeTypeFilters(next)) {
        return;
      }
      typeFilters.value = next;
    },
    { immediate: true }
  );

  // 局部常量 visibleEntries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const visibleEntries = computed(() => entries.value.filter(entry => typeFilters.value.includes(entry.kind)));
  // 局部常量 currentWorkspace：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const currentWorkspace = computed(
    () => workspaces.value.find(workspace => workspace.id === context.value.workspaceId) ?? null
  );
  // 局部常量 currentWorkspaceLabel：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const currentWorkspaceLabel = computed(() => currentWorkspace.value?.name ?? '');
  // 局部常量 currentGroupId：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const currentGroupId = computed(() => context.value.groupEntryId);

  // 局部常量 stats：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const stats = computed(() => ({
    folders: visibleEntries.value.filter(entry => entry.kind === 'folder').length,
    groups: visibleEntries.value.filter(entry => entry.kind === 'group').length,
    documents: visibleEntries.value.filter(entry => entry.kind === 'document').length,
    texts: visibleEntries.value.filter(entry => entry.kind === 'text').length
  }));

  // 函数 loadMainList：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function loadMainList() {
    entries.value = await db.listLibraryEntries(context.value);
  }

  // 函数 loadWorkspaceTree：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function loadWorkspaceTree(workspaceId: string) {
    workspaceTree.value = await db.listWorkspaceTree(workspaceId);
  }

  // 函数 loadWorkspaces：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function loadWorkspaces() {
    workspaces.value = await db.listWorkspaces();
  }

  // 函数 setTypeFilters：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function setTypeFilters(next: EntryKind[]) {
    typeFilters.value = [...next];
    await settings.update('mainListTypeFilters', serializeTypeFilters(typeFilters.value));
  }

  // 函数 toggleTypeFilter：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function toggleTypeFilter(kind: EntryKind) {
    if (!FILTERABLE_ENTRY_KINDS.includes(kind)) {
      return;
    }

    if (typeFilters.value.includes(kind)) {
      await setTypeFilters(typeFilters.value.filter(item => item !== kind));
      return;
    }

    await setTypeFilters([...typeFilters.value, kind]);
  }

  // 函数 upsertWorkspace：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function upsertWorkspace(workspace: Workspace) {
    // 局部常量 index：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const index = workspaces.value.findIndex(item => item.id === workspace.id);
    if (index >= 0) {
      workspaces.value[index] = workspace;
      return;
    }
    workspaces.value.unshift(workspace);
  }

  return {
    entries,
    workspaceTree,
    workspaces,
    context,
    typeFilters,
    visibleEntries,
    currentWorkspace,
    currentWorkspaceLabel,
    currentGroupId,
    stats,
    loadMainList,
    loadWorkspaceTree,
    loadWorkspaces,
    setTypeFilters,
    toggleTypeFilter,
    upsertWorkspace
  };
});
