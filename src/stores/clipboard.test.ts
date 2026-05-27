// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClipboardEntry } from '@/types/steno';
import { useClipboardStore } from './clipboard';

const listeners = new Map<string, (event: { payload: unknown }) => void>();
const listClipboardEntries = vi.fn<
  (args?: {
    limit?: number;
    contentType?: string | null;
    query?: string | null;
  }) => Promise<ClipboardEntry[]>
>();
const deleteClipboardEntry = vi.fn<(id: string) => Promise<void>>();
const clearClipboardEntries = vi.fn<() => Promise<void>>();
const copyClipboardEntry = vi.fn<(id: string) => Promise<void>>();
const pasteClipboardEntry = vi.fn<(id: string) => Promise<void>>();

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    listeners.set(event, handler);
    return () => listeners.delete(event);
  }),
}));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    listClipboardEntries,
    deleteClipboardEntry,
    clearClipboardEntries,
    copyClipboardEntry,
    pasteClipboardEntry,
  }),
}));

const textEntry: ClipboardEntry = {
  id: '1',
  contentType: 'text',
  content: 'hello',
  htmlContent: null,
  preview: 'hello',
  createdAt: '2026-05-25T00:00:00Z',
  updatedAt: '2026-05-25T00:00:00Z',
  sizeBytes: 5,
};

const urlEntry: ClipboardEntry = {
  id: '2',
  contentType: 'url',
  content: 'https://example.com',
  htmlContent: null,
  preview: 'https://example.com',
  createdAt: '2026-05-25T00:00:01Z',
  updatedAt: '2026-05-25T00:00:01Z',
  sizeBytes: 19,
};

describe('clipboard store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listeners.clear();
    listClipboardEntries.mockReset();
    deleteClipboardEntry.mockReset();
    clearClipboardEntries.mockReset();
    copyClipboardEntry.mockReset();
    pasteClipboardEntry.mockReset();
    listClipboardEntries.mockResolvedValue([textEntry, urlEntry]);
    deleteClipboardEntry.mockResolvedValue();
    clearClipboardEntries.mockResolvedValue();
    copyClipboardEntry.mockResolvedValue();
    pasteClipboardEntry.mockResolvedValue();
  });

  it('loads clipboard entries from the db adapter', async () => {
    const store = useClipboardStore();
    await store.load();

    expect(listClipboardEntries).toHaveBeenCalledWith({
      limit: 500,
      contentType: null,
      query: '',
    });
    expect(store.entries).toEqual([textEntry, urlEntry]);
  });

  it('filters entries by type and query locally', async () => {
    const store = useClipboardStore();
    await store.load();

    store.typeFilter = 'url';
    expect(store.filteredEntries).toEqual([urlEntry]);

    store.typeFilter = null;
    store.query = 'hello';
    expect(store.filteredEntries).toEqual([textEntry]);
  });

  it('syncs entries from backend events', async () => {
    const store = useClipboardStore();
    await store.startEventListeners();

    listeners.get('steno:clipboard-updated')?.({ payload: urlEntry });
    expect(store.entries[0]).toEqual(urlEntry);

    listeners.get('steno:clipboard-removed')?.({ payload: '2' });
    expect(store.entries.some(entry => entry.id === '2')).toBe(false);

    listeners.get('steno:clipboard-cleared')?.({ payload: null });
    expect(store.entries).toEqual([]);
  });

  it('delegates copy paste delete and clear operations', async () => {
    const store = useClipboardStore();
    await store.load();

    await store.copyEntry('1');
    await store.pasteEntry('1');
    await store.deleteEntry('1');
    await store.clearEntries();

    expect(copyClipboardEntry).toHaveBeenCalledWith('1');
    expect(pasteClipboardEntry).toHaveBeenCalledWith('1');
    expect(deleteClipboardEntry).toHaveBeenCalledWith('1');
    expect(clearClipboardEntries).toHaveBeenCalledOnce();
    expect(store.entries).toEqual([]);
  });
});
