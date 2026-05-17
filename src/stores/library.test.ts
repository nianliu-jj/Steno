// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLibraryStore } from './library';

const db = {
  listLibraryEntries: vi.fn(),
  listWorkspaceTree: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(() => Promise.resolve()),
};

vi.mock('@/composables/useDb', () => ({
  useDb: () => db,
}));

describe('library store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('computes bottom stats from the currently visible entries only', async () => {
    db.listLibraryEntries.mockResolvedValue([
      { id: 'folder-1', kind: 'folder', title: 'A', previewText: '', tags: [] },
      { id: 'doc-1', kind: 'document', title: 'B', previewText: '', tags: [] },
      { id: 'group-1', kind: 'group', title: 'G', previewText: '', tags: [] },
      { id: 'text-1', kind: 'text', title: 'T', previewText: '', tags: [] },
    ]);

    const store = useLibraryStore();
    await store.loadMainList();

    expect(store.stats).toEqual({
      folders: 1,
      groups: 1,
      documents: 1,
      texts: 1,
    });
  });
});
