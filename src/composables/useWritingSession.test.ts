// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import { useWritingSession } from './useWritingSession';

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getNote: vi.fn(() => Promise.resolve(null)),
  }),
}));

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    saveDraft: vi.fn(() => Promise.resolve(null)),
  }),
}));

vi.mock('@/composables/useMarkdown', () => ({
  useMarkdown: () => ({
    countWords: (content: string) => content.length,
  }),
}));

vi.mock('@/composables/useAutosave', () => ({
  useAutosave: () => ({
    status: { value: 'idle' },
    savedAt: { value: null },
    error: { value: null },
    scheduleSave: vi.fn(),
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
});
