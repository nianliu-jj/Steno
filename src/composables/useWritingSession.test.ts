// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import { useWritingSession } from './useWritingSession';

const getEditorEntry = vi.fn(
  (): Promise<Record<string, unknown> | null> => Promise.resolve(null),
);
const getNote = vi.fn(() => Promise.resolve(null));
const saveDocumentEntry = vi.fn(() => Promise.resolve({ id: 'doc-1' }));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getEditorEntry,
    getNote,
    saveDocumentEntry,
  }),
}));

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    saveDraft: vi.fn(() => Promise.resolve(null)),
  }),
}));

vi.mock('@/stores/library', () => ({
  useLibraryStore: () => ({
    context: {
      workspaceId: 'workspace-1',
      folderEntryId: 'folder-1',
      groupEntryId: null,
      selectedEntryId: null,
    },
  }),
}));

vi.mock('@/composables/useMarkdown', () => ({
  useMarkdown: () => ({
    countWords: (content: string) => content.length,
  }),
}));

vi.mock('@/composables/useAutosave', () => ({
  useAutosave: (saver: (payload: unknown) => Promise<unknown>) => ({
    status: { value: 'idle' },
    savedAt: { value: null },
    error: { value: null },
    scheduleSave: (payload: unknown) => void saver(payload),
    flushSave: vi.fn(() => Promise.resolve()),
  }),
}));

const Harness = defineComponent({
  setup() {
    const session = useWritingSession(ref('note-1'));
    return { session };
  },
  render() {
    return h('div', { 'data-mode': this.session.mode.value });
  },
});

const NewDocumentHarness = defineComponent({
  setup() {
    const session = useWritingSession(ref(null));
    return { session };
  },
  render() {
    return h('div');
  },
});

describe('useWritingSession', () => {
  it('returns to rich-edit after readonly -> source -> close-source transitions', async () => {
    const wrapper = mount(Harness);
    await flushPromises();

    const vm = wrapper.vm as unknown as {
      $: { setupState: { session: ReturnType<typeof useWritingSession> } };
    };
    const session = vm.$.setupState.session;

    session.toggleReadonly();
    expect(session.mode.value).toBe('rich-readonly');

    session.openSource();
    expect(session.mode.value).toBe('source-edit');

    session.closeSource();
    expect(session.mode.value).toBe('rich-edit');
  });

  it('uses the current workspace context to save a new document session', async () => {
    const wrapper = mount(NewDocumentHarness);
    await flushPromises();

    const vm = wrapper.vm as unknown as {
      $: { setupState: { session: ReturnType<typeof useWritingSession> } };
    };
    const session = vm.$.setupState.session;

    session.content.value = '文档正文';
    await flushPromises();

    expect(saveDocumentEntry).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-1',
      folderEntryId: 'folder-1',
      content: '文档正文',
    }));
  });

  it('打开已有笔记但未修改时不触发保存，真实修改后才保存', async () => {
    saveDocumentEntry.mockClear();
    getEditorEntry.mockResolvedValueOnce({
      id: 'note-1',
      title: '标题',
      content: '正文',
      tags: ['a'],
      kind: 'document',
      workspaceId: 'ws-1',
      parentId: null,
    });

    const wrapper = mount(Harness);
    await flushPromises();

    const vm = wrapper.vm as unknown as {
      $: { setupState: { session: ReturnType<typeof useWritingSession> } };
    };
    const session = vm.$.setupState.session;

    // hydrate 回填内容，但未发生真实修改：不应触发保存（不 bump updated_at）
    expect(session.content.value).toBe('正文');
    expect(saveDocumentEntry).not.toHaveBeenCalled();

    // 真实修改后才保存
    session.content.value = '正文已修改';
    await flushPromises();
    expect(saveDocumentEntry).toHaveBeenCalledWith(expect.objectContaining({
      content: '正文已修改',
    }));
  });
});
