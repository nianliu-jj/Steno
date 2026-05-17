import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { useDb } from '@/composables/useDb';
import type { EntryKind, LibraryEntry, MainListContext } from '@/types/steno';

export const useLibraryStore = defineStore('library', () => {
  const db = useDb();

  const entries = ref<LibraryEntry[]>([]);
  const workspaceTree = ref<LibraryEntry[]>([]);
  const context = ref<MainListContext>({
    workspaceId: null,
    folderEntryId: null,
    groupEntryId: null,
    selectedEntryId: null,
  });
  const typeFilters = ref<EntryKind[]>(['folder', 'group', 'document', 'text']);

  const visibleEntries = computed(() =>
    entries.value.filter(entry => typeFilters.value.includes(entry.kind)),
  );

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

  return {
    entries,
    workspaceTree,
    context,
    typeFilters,
    visibleEntries,
    stats,
    loadMainList,
    loadWorkspaceTree,
  };
});
