import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import { useDb } from '@/composables/useDb';
import { useSettingsStore } from '@/stores/settings';
import type { EntryKind, LibraryEntry, MainListContext, Workspace } from '@/types/steno';

const FILTERABLE_ENTRY_KINDS: EntryKind[] = ['folder', 'group', 'document', 'text'];

function parseTypeFilters(raw: string): EntryKind[] {
  const normalized = raw
    .split(',')
    .map(item => item.trim())
    .filter((item): item is EntryKind => FILTERABLE_ENTRY_KINDS.includes(item as EntryKind));

  return normalized.length > 0 ? normalized : [...FILTERABLE_ENTRY_KINDS];
}

function serializeTypeFilters(filters: EntryKind[]) {
  return filters.join(',');
}

export const useLibraryStore = defineStore('library', () => {
  const db = useDb();
  const settings = useSettingsStore();

  const entries = ref<LibraryEntry[]>([]);
  const workspaceTree = ref<LibraryEntry[]>([]);
  const workspaces = ref<Workspace[]>([]);
  const context = ref<MainListContext>({
    workspaceId: null,
    folderEntryId: null,
    groupEntryId: null,
    selectedEntryId: null,
  });
  const typeFilters = ref<EntryKind[]>(
    parseTypeFilters(settings.state.mainListTypeFilters),
  );

  watch(
    () => settings.state.mainListTypeFilters,
    raw => {
      const next = parseTypeFilters(raw);
      if (serializeTypeFilters(typeFilters.value) === serializeTypeFilters(next)) {
        return;
      }
      typeFilters.value = next;
    },
    { immediate: true },
  );

  const visibleEntries = computed(() =>
    entries.value.filter(entry => typeFilters.value.includes(entry.kind)),
  );
  const currentWorkspace = computed(() =>
    workspaces.value.find(workspace => workspace.id === context.value.workspaceId) ?? null,
  );
  const currentWorkspaceLabel = computed(() =>
    currentWorkspace.value?.name ?? '',
  );
  const currentGroupId = computed(() => context.value.groupEntryId);

  const stats = computed(() => ({
    folders: visibleEntries.value.filter(entry => entry.kind === 'folder').length,
    groups: visibleEntries.value.filter(entry => entry.kind === 'group').length,
    documents: visibleEntries.value.filter(entry => entry.kind === 'document').length,
    texts: visibleEntries.value.filter(entry => entry.kind === 'text').length,
  }));

  async function loadMainList() {
    entries.value = await db.listLibraryEntries(context.value);
  }

  async function loadWorkspaceTree(workspaceId: string) {
    workspaceTree.value = await db.listWorkspaceTree(workspaceId);
  }

  async function loadWorkspaces() {
    workspaces.value = await db.listWorkspaces();
  }

  async function setTypeFilters(next: EntryKind[]) {
    typeFilters.value = [...next];
    await settings.update('mainListTypeFilters', serializeTypeFilters(typeFilters.value));
  }

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

  function upsertWorkspace(workspace: Workspace) {
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
    upsertWorkspace,
  };
});
