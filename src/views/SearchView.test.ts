// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import SearchView from './SearchView.vue';

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    listNotes: vi.fn(() => Promise.resolve([])),
    searchNotes: vi.fn(() => Promise.resolve([])),
    exportNoteMarkdown: vi.fn(),
    exportNotePdf: vi.fn(),
  }),
}));

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    openZen: vi.fn(() => Promise.resolve()),
    openStickyNote: vi.fn(() => Promise.resolve()),
    closeStickyNote: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    pinNote: vi.fn(() => Promise.resolve()),
    unpinNote: vi.fn(() => Promise.resolve()),
    removeNote: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateToMain: vi.fn(),
  }),
}));

const WrappedSearchView = defineComponent({
  setup() {
    return () =>
      h(NConfigProvider, null, {
        default: () =>
          h(NMessageProvider, null, {
            default: () => h(SearchView),
          }),
      });
  },
});

describe('SearchView', () => {
  it('does not render a dedicated return header inside the workbench content', async () => {
    const wrapper = mount(WrappedSearchView);
    await flushPromises();

    expect(wrapper.text()).not.toContain('返回');
    expect(wrapper.find('input').exists()).toBe(true);
  });
});
