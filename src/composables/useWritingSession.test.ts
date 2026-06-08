/**
 * @file Vue 组合式逻辑 - use Writing Session
 *
 * 覆盖 use Writing Session 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import { useWritingSession } from './useWritingSession';

// 局部常量 getEditorEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const getEditorEntry = vi.fn((): Promise<Record<string, unknown> | null> => Promise.resolve(null));
// 局部常量 getNote：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const getNote = vi.fn(() => Promise.resolve(null));
// 局部常量 saveDocumentEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const saveDocumentEntry = vi.fn(() => Promise.resolve({ id: 'doc-1' }));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getEditorEntry,
    getNote,
    saveDocumentEntry
  })
}));

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    saveDraft: vi.fn(() => Promise.resolve(null))
  })
}));

vi.mock('@/stores/library', () => ({
  useLibraryStore: () => ({
    context: {
      workspaceId: 'workspace-1',
      folderEntryId: 'folder-1',
      groupEntryId: null,
      selectedEntryId: null
    }
  })
}));

vi.mock('@/composables/useMarkdown', () => ({
  useMarkdown: () => ({
    countWords: (content: string) => content.length
  })
}));

vi.mock('@/composables/useAutosave', () => ({
  useAutosave: (saver: (payload: unknown) => Promise<unknown>) => ({
    status: { value: 'idle' },
    savedAt: { value: null },
    error: { value: null },
    scheduleSave: (payload: unknown) => void saver(payload),
    flushSave: vi.fn(() => Promise.resolve())
  })
}));

// 组件定义 Harness：集中声明渲染入口、props 和事件响应。
const Harness = defineComponent({
  setup() {
    // 局部常量 session：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const session = useWritingSession(ref('note-1'));
    return { session };
  },
  render() {
    return h('div', { 'data-mode': this.session.mode.value });
  }
});

// 组件定义 NewDocumentHarness：集中声明渲染入口、props 和事件响应。
const NewDocumentHarness = defineComponent({
  setup() {
    // 局部常量 session：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const session = useWritingSession(ref(null));
    return { session };
  },
  render() {
    return h('div');
  }
});

// 测试用例：验证「useWritingSession」场景，锁定 use Writing Session 的用户可见行为。
describe('useWritingSession', () => {
  // 测试用例：验证「returns to rich-edit after readonly -> source -> close-source transitions」场景，锁定 use Writing Session 的用户可见行为。
  it('returns to rich-edit after readonly -> source -> close-source transitions', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(Harness);
    await flushPromises();

    // 局部常量 vm：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const vm = wrapper.vm as unknown as {
      $: { setupState: { session: ReturnType<typeof useWritingSession> } };
    };
    // 局部常量 session：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const session = vm.$.setupState.session;

    session.toggleReadonly();
    expect(session.mode.value).toBe('rich-readonly');

    session.openSource();
    expect(session.mode.value).toBe('source-edit');

    session.closeSource();
    expect(session.mode.value).toBe('rich-edit');
  });

  // 测试用例：验证「uses the current workspace context to save a new document session」场景，锁定 use Writing Session 的用户可见行为。
  it('uses the current workspace context to save a new document session', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(NewDocumentHarness);
    await flushPromises();

    // 局部常量 vm：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const vm = wrapper.vm as unknown as {
      $: { setupState: { session: ReturnType<typeof useWritingSession> } };
    };
    // 局部常量 session：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const session = vm.$.setupState.session;

    session.content.value = '文档正文';
    await flushPromises();

    expect(saveDocumentEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        folderEntryId: 'folder-1',
        content: '文档正文'
      })
    );
  });

  // 测试用例：验证「打开已有笔记但未修改时不触发保存，真实修改后才保存」场景，锁定 use Writing Session 的用户可见行为。
  it('打开已有笔记但未修改时不触发保存，真实修改后才保存', async () => {
    saveDocumentEntry.mockClear();
    getEditorEntry.mockResolvedValueOnce({
      id: 'note-1',
      title: '标题',
      content: '正文',
      tags: ['a'],
      kind: 'document',
      workspaceId: 'ws-1',
      parentId: null
    });

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(Harness);
    await flushPromises();

    // 局部常量 vm：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const vm = wrapper.vm as unknown as {
      $: { setupState: { session: ReturnType<typeof useWritingSession> } };
    };
    // 局部常量 session：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const session = vm.$.setupState.session;

    // hydrate 回填内容，但未发生真实修改：不应触发保存（不 bump updated_at）
    expect(session.content.value).toBe('正文');
    expect(saveDocumentEntry).not.toHaveBeenCalled();

    // 真实修改后才保存
    session.content.value = '正文已修改';
    await flushPromises();
    expect(saveDocumentEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '正文已修改'
      })
    );
  });
});
