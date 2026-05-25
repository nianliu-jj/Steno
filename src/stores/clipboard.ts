import { listen } from '@tauri-apps/api/event';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { useDb } from '@/composables/useDb';
import type { ClipboardContentType, ClipboardEntry } from '@/types/steno';

const UPDATED_EVENT = 'steno:clipboard-updated';
const REMOVED_EVENT = 'steno:clipboard-removed';
const CLEARED_EVENT = 'steno:clipboard-cleared';

export const useClipboardStore = defineStore('clipboard', () => {
  const db = useDb();
  const entries = ref<ClipboardEntry[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const query = ref('');
  const typeFilter = ref<ClipboardContentType | null>(null);
  const listenersStarted = ref(false);
  const unlisteners: Array<() => void> = [];

  const filteredEntries = computed(() => {
    const term = query.value.trim().toLowerCase();
    return entries.value.filter(entry => {
      if (typeFilter.value && entry.contentType !== typeFilter.value) return false;
      if (!term) return true;
      return `${entry.preview} ${entry.content}`.toLowerCase().includes(term);
    });
  });

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      entries.value = await db.listClipboardEntries({
        limit: 200,
        contentType: typeFilter.value,
        query: query.value,
      });
    } catch (e) {
      error.value = String(e);
      entries.value = [];
    } finally {
      loading.value = false;
    }
  }

  function upsertLocal(entry: ClipboardEntry) {
    entries.value = [entry, ...entries.value.filter(item => item.id !== entry.id)].slice(0, 200);
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

  return {
    entries,
    loading,
    error,
    query,
    typeFilter,
    filteredEntries,
    load,
    startEventListeners,
    stopEventListeners,
    copyEntry,
    deleteEntry,
    clearEntries,
  };
});
