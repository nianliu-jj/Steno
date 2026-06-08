/**
 * @file Pinia 状态管理 - clipboard
 *
 * 覆盖 clipboard 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClipboardEntry } from '@/types/steno';
import { useClipboardStore } from './clipboard';

// 局部常量 listeners：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const listeners = new Map<string, (event: { payload: unknown }) => void>();
// 局部常量 listClipboardEntries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const listClipboardEntries =
  vi.fn<(args?: { limit?: number; contentType?: string | null; query?: string | null }) => Promise<ClipboardEntry[]>>();
// 局部常量 deleteClipboardEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const deleteClipboardEntry = vi.fn<(id: string) => Promise<void>>();
// 局部常量 clearClipboardEntries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const clearClipboardEntries = vi.fn<() => Promise<void>>();
// 局部常量 copyClipboardEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const copyClipboardEntry = vi.fn<(id: string) => Promise<void>>();
// 局部常量 pasteClipboardEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const pasteClipboardEntry = vi.fn<(id: string) => Promise<void>>();
// 局部常量 addImageClipboardEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const addImageClipboardEntry = vi.fn<(dataUrl: string) => Promise<ClipboardEntry>>();

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    listeners.set(event, handler);
    return () => listeners.delete(event);
  })
}));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    listClipboardEntries,
    deleteClipboardEntry,
    clearClipboardEntries,
    copyClipboardEntry,
    pasteClipboardEntry,
    addImageClipboardEntry
  })
}));

const textEntry: ClipboardEntry = {
  id: '1',
  contentType: 'text',
  content: 'hello',
  htmlContent: null,
  preview: 'hello',
  createdAt: '2026-05-25T00:00:00Z',
  updatedAt: '2026-05-25T00:00:00Z',
  sizeBytes: 5
};

const urlEntry: ClipboardEntry = {
  id: '2',
  contentType: 'url',
  content: 'https://example.com',
  htmlContent: null,
  preview: 'https://example.com',
  createdAt: '2026-05-25T00:00:01Z',
  updatedAt: '2026-05-25T00:00:01Z',
  sizeBytes: 19
};

// 测试用例：验证「clipboard store」场景，锁定 clipboard 的用户可见行为。
describe('clipboard store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listeners.clear();
    listClipboardEntries.mockReset();
    deleteClipboardEntry.mockReset();
    clearClipboardEntries.mockReset();
    copyClipboardEntry.mockReset();
    pasteClipboardEntry.mockReset();
    addImageClipboardEntry.mockReset();
    listClipboardEntries.mockResolvedValue([textEntry, urlEntry]);
    deleteClipboardEntry.mockResolvedValue();
    clearClipboardEntries.mockResolvedValue();
    copyClipboardEntry.mockResolvedValue();
    pasteClipboardEntry.mockResolvedValue();
  });

  // 测试用例：验证「loads clipboard entries from the db adapter」场景，锁定 clipboard 的用户可见行为。
  it('loads clipboard entries from the db adapter', async () => {
    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useClipboardStore();
    await store.load();

    expect(listClipboardEntries).toHaveBeenCalledWith({
      limit: 500,
      contentType: null,
      query: ''
    });
    expect(store.entries).toEqual([textEntry, urlEntry]);
  });

  // 测试用例：验证「filters entries by type and query locally」场景，锁定 clipboard 的用户可见行为。
  it('filters entries by type and query locally', async () => {
    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useClipboardStore();
    await store.load();

    store.typeFilter = 'url';
    expect(store.filteredEntries).toEqual([urlEntry]);

    store.typeFilter = null;
    store.query = 'hello';
    expect(store.filteredEntries).toEqual([textEntry]);
  });

  // 测试用例：验证「syncs entries from backend events」场景，锁定 clipboard 的用户可见行为。
  it('syncs entries from backend events', async () => {
    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useClipboardStore();
    await store.startEventListeners();

    listeners.get('steno:clipboard-updated')?.({ payload: urlEntry });
    expect(store.entries[0]).toEqual(urlEntry);

    listeners.get('steno:clipboard-removed')?.({ payload: '2' });
    expect(store.entries.some(entry => entry.id === '2')).toBe(false);

    listeners.get('steno:clipboard-cleared')?.({ payload: null });
    expect(store.entries).toEqual([]);
  });

  // 测试用例：验证「delegates copy paste delete and clear operations」场景，锁定 clipboard 的用户可见行为。
  it('delegates copy paste delete and clear operations', async () => {
    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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

  // 测试用例：验证「adds an edited image as a new entry and upserts it locally」场景，锁定 clipboard 的用户可见行为。
  it('adds an edited image as a new entry and upserts it locally', async () => {
    const imageEntry: ClipboardEntry = {
      id: 'img-9',
      contentType: 'image',
      content: 'data:image/png;base64,iVBORw0KGgo=',
      htmlContent: null,
      preview: '图片内容',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
      sizeBytes: 40
    };
    addImageClipboardEntry.mockResolvedValue(imageEntry);

    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useClipboardStore();
    // 局部常量 result：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const result = await store.addImageEntry('data:image/png;base64,iVBORw0KGgo=');

    expect(addImageClipboardEntry).toHaveBeenCalledWith('data:image/png;base64,iVBORw0KGgo=');
    expect(result).toEqual(imageEntry);
    expect(store.entries[0]).toEqual(imageEntry);
  });

  // 测试用例：验证「收到事件时按 lastUsedAt 重排（最近使用的非置顶项排到头部）」场景，锁定 clipboard 的用户可见行为。
  it('收到事件时按 lastUsedAt 重排（最近使用的非置顶项排到头部）', async () => {
    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useClipboardStore();
    await store.startEventListeners();

    // a：updatedAt 较新但 lastUsedAt 较旧；b：updatedAt 较旧但 lastUsedAt 较新。
    const a: ClipboardEntry = {
      id: 'a',
      contentType: 'text',
      content: 'a',
      htmlContent: null,
      preview: 'a',
      createdAt: '2026-05-25T00:00:00Z',
      updatedAt: '2026-05-25T10:00:00Z',
      sizeBytes: 1,
      lastUsedAt: '2026-05-25T01:00:00Z'
    };
    const b: ClipboardEntry = {
      id: 'b',
      contentType: 'text',
      content: 'b',
      htmlContent: null,
      preview: 'b',
      createdAt: '2026-05-25T00:00:00Z',
      updatedAt: '2026-05-25T02:00:00Z',
      sizeBytes: 1,
      lastUsedAt: '2026-05-25T20:00:00Z'
    };
    listeners.get('steno:clipboard-updated')?.({ payload: a });
    listeners.get('steno:clipboard-updated')?.({ payload: b });

    // 按 lastUsedAt 排序：b（20:00）应排在 a（01:00）之前，尽管 a 的 updatedAt 更新。
    expect(store.entries.map(e => e.id)).toEqual(['b', 'a']);
  });
});
