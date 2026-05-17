import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNotesStore } from './notes';
import type { Note } from '@/types/steno';

const db = {
  listNotes: vi.fn(),
  listPinnedNotes: vi.fn(),
  saveNote: vi.fn(),
  setNotePinned: vi.fn(),
  updatePinnedWindowConfig: vi.fn(),
  updateCanvasPosition: vi.fn(),
  deleteNote: vi.fn(),
};

vi.mock('@/composables/useDb', () => ({
  useDb: () => db,
}));

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    title: '默认标题',
    content: '默认正文',
    htmlContent: '<p>默认正文</p>',
    tags: [],
    isPinned: false,
    pinnedWindowConfig: null,
    canvasPosition: null,
    createdAt: '2026-05-15T07:00:00.000Z',
    updatedAt: '2026-05-15T07:05:00.000Z',
    wordCount: 4,
    ...overrides,
  };
}

describe('notes store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('updates an existing note title from an external sync event', () => {
    const store = useNotesStore();
    store.notes = [makeNote({ id: 'note-1', title: '旧标题' })];

    store.syncExternalNote(makeNote({ id: 'note-1', title: '新标题' }));

    expect(store.notes).toEqual([
      expect.objectContaining({
        id: 'note-1',
        title: '新标题',
      }),
    ]);
  });

  it('adds pinned external notes to the pinned cache', () => {
    const store = useNotesStore();
    const pinnedNote = makeNote({ id: 'note-2', title: '置顶标题', isPinned: true });

    store.syncExternalNote(pinnedNote);

    expect(store.pinned).toEqual([
      expect.objectContaining({
        id: 'note-2',
        title: '置顶标题',
        isPinned: true,
      }),
    ]);
  });

  it('removes notes from pinned cache when the external note is no longer pinned', () => {
    const store = useNotesStore();
    store.pinned = [makeNote({ id: 'note-3', title: '曾经置顶', isPinned: true })];

    store.syncExternalNote(makeNote({ id: 'note-3', title: '取消置顶', isPinned: false }));

    expect(store.pinned).toEqual([]);
  });
});
