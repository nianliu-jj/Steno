/**
 * @file Pinia 状态管理 - notes
 *
 * 覆盖 notes 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNotesStore } from './notes';
import type { Note } from '@/types/steno';

// 局部常量 db：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const db = {
  listNotes: vi.fn(),
  listPinnedNotes: vi.fn(),
  saveNote: vi.fn(),
  setNotePinned: vi.fn(),
  updatePinnedWindowConfig: vi.fn(),
  updateCanvasPosition: vi.fn(),
  deleteNote: vi.fn()
};

vi.mock('@/composables/useDb', () => ({
  useDb: () => db
}));

// 函数 makeNote：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
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
    isDraft: false,
    ...overrides
  };
}

// 测试用例：验证「notes store」场景，锁定 notes 的用户可见行为。
describe('notes store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  // 测试用例：验证「updates an existing note title from an external sync event」场景，锁定 notes 的用户可见行为。
  it('updates an existing note title from an external sync event', () => {
    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useNotesStore();
    store.notes = [makeNote({ id: 'note-1', title: '旧标题' })];

    store.syncExternalNote(makeNote({ id: 'note-1', title: '新标题' }));

    expect(store.notes).toEqual([
      expect.objectContaining({
        id: 'note-1',
        title: '新标题'
      })
    ]);
  });

  // 测试用例：验证「adds pinned external notes to the pinned cache」场景，锁定 notes 的用户可见行为。
  it('adds pinned external notes to the pinned cache', () => {
    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useNotesStore();
    // 局部常量 pinnedNote：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const pinnedNote = makeNote({ id: 'note-2', title: '置顶标题', isPinned: true });

    store.syncExternalNote(pinnedNote);

    expect(store.pinned).toEqual([
      expect.objectContaining({
        id: 'note-2',
        title: '置顶标题',
        isPinned: true
      })
    ]);
  });

  // 测试用例：验证「removes notes from pinned cache when the external note is no longer pinned」场景，锁定 notes 的用户可见行为。
  it('removes notes from pinned cache when the external note is no longer pinned', () => {
    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useNotesStore();
    store.pinned = [makeNote({ id: 'note-3', title: '曾经置顶', isPinned: true })];

    store.syncExternalNote(makeNote({ id: 'note-3', title: '取消置顶', isPinned: false }));

    expect(store.pinned).toEqual([]);
  });

  // 测试用例：验证「keeps unsaved drafts before saved notes after a draft is promoted externally」场景，锁定 notes 的用户可见行为。
  it('keeps unsaved drafts before saved notes after a draft is promoted externally', () => {
    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useNotesStore();
    store.notes = [
      makeNote({
        id: 'draft-newer',
        title: '仍未保存',
        isDraft: true,
        updatedAt: '2026-05-15T07:30:00.000Z'
      }),
      makeNote({
        id: 'draft-promoted',
        title: '准备保存',
        isDraft: true,
        updatedAt: '2026-05-15T07:20:00.000Z'
      }),
      makeNote({
        id: 'saved-old',
        title: '旧正式笔记',
        isDraft: false,
        updatedAt: '2026-05-15T07:10:00.000Z'
      })
    ];

    store.syncExternalNote(
      makeNote({
        id: 'saved-new',
        title: '刚保存的正式笔记',
        isDraft: false,
        updatedAt: '2026-05-15T07:40:00.000Z'
      })
    );
    store.purgeLocal('draft-promoted');

    expect(store.notes.map(note => note.id)).toEqual(['draft-newer', 'saved-new', 'saved-old']);
  });
});
