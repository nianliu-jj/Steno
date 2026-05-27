import { listen } from '@tauri-apps/api/event';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import { useDb } from '@/composables/useDb';
import { useSettingsStore } from '@/stores/settings';
import type { ClipboardContentType, ClipboardEntry } from '@/types/steno';

const UPDATED_EVENT = 'steno:clipboard-updated';
const REMOVED_EVENT = 'steno:clipboard-removed';
const CLEARED_EVENT = 'steno:clipboard-cleared';

export const useClipboardStore = defineStore('clipboard', () => {
  const db = useDb();
  const settings = useSettingsStore();
  const entries = ref<ClipboardEntry[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const query = ref('');
  const typeFilter = ref<ClipboardContentType | null>(null);
  const listenersStarted = ref(false);
  const unlisteners: Array<() => void> = [];
  const page = ref(1);
  const totalCount = ref(0);

  const filteredEntries = computed(() => {
    const term = query.value.trim().toLowerCase();
    return entries.value.filter(entry => {
      if (typeFilter.value && entry.contentType !== typeFilter.value) return false;
      if (!term) return true;
      return `${entry.preview} ${entry.content}`.toLowerCase().includes(term);
    });
  });

  const pageSize = computed(() => settings.state.clipboardPageSize);

  const pagedEntries = computed(() => {
    const start = (page.value - 1) * pageSize.value;
    return filteredEntries.value.slice(start, start + pageSize.value);
  });

  const totalPages = computed(() =>
    Math.max(1, Math.ceil(filteredEntries.value.length / pageSize.value)),
  );

  function setPage(newPage: number) {
    page.value = Math.max(1, Math.min(newPage, totalPages.value));
  }

  function setPageSize(size: number) {
    settings.state.clipboardPageSize = size;
    page.value = 1;
  }

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      const all = await db.listClipboardEntries({
        limit: 500,
        contentType: typeFilter.value,
        query: query.value,
      });
      entries.value = all;
      totalCount.value = all.length;
      if (page.value > totalPages.value) {
        page.value = totalPages.value;
      }
    } catch (e) {
      error.value = String(e);
      entries.value = [];
    } finally {
      loading.value = false;
    }
  }

  function upsertLocal(entry: ClipboardEntry) {
    const updated = [entry, ...entries.value.filter(item => item.id !== entry.id)];
    updated.sort((a, b) => {
      const aPin = a.pinnedAt ?? '';
      const bPin = b.pinnedAt ?? '';
      if (aPin !== bPin) return bPin.localeCompare(aPin);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    entries.value = updated.slice(0, 500);
  }

  async function startEventListeners() {
    if (listenersStarted.value) return;
    listenersStarted.value = true;
    try {
      unlisteners.push(
        await listen<ClipboardEntry>(UPDATED_EVENT, event => {
          upsertLocal(event.payload);
        }),
      );
      unlisteners.push(
        await listen<string>(REMOVED_EVENT, event => {
          entries.value = entries.value.filter(entry => entry.id !== event.payload);
        }),
      );
      unlisteners.push(
        await listen(CLEARED_EVENT, () => {
          entries.value = [];
        }),
      );
    } catch (e) {
      listenersStarted.value = false;
      error.value = String(e);
    }
  }

  function stopEventListeners() {
    while (unlisteners.length) {
      unlisteners.pop()?.();
    }
    listenersStarted.value = false;
  }

  async function copyEntry(id: string) {
    await db.copyClipboardEntry(id);
  }

  async function deleteEntry(id: string) {
    await db.deleteClipboardEntry(id);
    entries.value = entries.value.filter(entry => entry.id !== id);
  }

  async function clearEntries() {
    await db.clearClipboardEntries();
    entries.value = [];
  }

  async function updateEntry(id: string, content: string, htmlContent?: string | null) {
    const entry = await db.updateClipboardEntry({ id, content, htmlContent });
    upsertLocal(entry);
    return entry;
  }

  async function pinEntry(id: string) {
    const entry = await db.pinClipboardEntry(id);
    upsertLocal(entry);
    return entry;
  }

  async function unpinEntry(id: string) {
    const entry = await db.unpinClipboardEntry(id);
    upsertLocal(entry);
    return entry;
  }

  watch([query, typeFilter], () => {
    page.value = 1;
  });

  return {
    entries,
    loading,
    error,
    query,
    typeFilter,
    filteredEntries,
    pagedEntries,
    page,
    pageSize,
    totalPages,
    totalCount,
    load,
    setPage,
    setPageSize,
    startEventListeners,
    stopEventListeners,
    copyEntry,
    deleteEntry,
    clearEntries,
    updateEntry,
    pinEntry,
    unpinEntry,
  };
});
