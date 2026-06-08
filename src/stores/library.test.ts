/**
 * @file Pinia 状态管理 - library
 *
 * 覆盖 library 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLibraryStore } from './library';
import { useSettingsStore } from './settings';

// 局部常量 db：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const db = {
  listLibraryEntries: vi.fn(),
  listWorkspaceTree: vi.fn(),
  listWorkspaces: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(() => Promise.resolve())
};

vi.mock('@/composables/useDb', () => ({
  useDb: () => db
}));

// 测试用例：验证「library store」场景，锁定 library 的用户可见行为。
describe('library store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  // 测试用例：验证「computes bottom stats from the currently visible entries only」场景，锁定 library 的用户可见行为。
  it('computes bottom stats from the currently visible entries only', async () => {
    db.listLibraryEntries.mockResolvedValue([
      { id: 'folder-1', kind: 'folder', title: 'A', previewText: '', tags: [] },
      { id: 'doc-1', kind: 'document', title: 'B', previewText: '', tags: [] },
      { id: 'group-1', kind: 'group', title: 'G', previewText: '', tags: [] },
      { id: 'text-1', kind: 'text', title: 'T', previewText: '', tags: [] }
    ]);

    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useLibraryStore();
    await store.loadMainList();

    expect(store.stats).toEqual({
      folders: 1,
      groups: 1,
      documents: 1,
      texts: 1
    });
  });

  // 测试用例：验证「hydrates type filters from settings and persists later updates」场景，锁定 library 的用户可见行为。
  it('hydrates type filters from settings and persists later updates', async () => {
    // 局部常量 settings：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const settings = useSettingsStore();
    settings.state.mainListTypeFilters = 'document,text';

    db.listLibraryEntries.mockResolvedValue([
      { id: 'folder-1', kind: 'folder', title: 'A', previewText: '', tags: [] },
      { id: 'doc-1', kind: 'document', title: 'B', previewText: '', tags: [] },
      { id: 'text-1', kind: 'text', title: 'T', previewText: '', tags: [] }
    ]);

    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useLibraryStore();
    await store.loadMainList();

    expect(store.typeFilters).toEqual(['document', 'text']);
    expect(store.visibleEntries.map(entry => entry.id)).toEqual(['doc-1', 'text-1']);

    await store.toggleTypeFilter('folder');

    expect(store.typeFilters).toEqual(['document', 'text', 'folder']);
    expect(db.setSetting).toHaveBeenCalledWith('mainListTypeFilters', 'document,text,folder');
  });
});
