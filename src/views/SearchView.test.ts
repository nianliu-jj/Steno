// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import SearchView from './SearchView.vue';
import type { Note } from '@/types/steno';

const listNotes = vi.fn(() => Promise.resolve([] as Note[]));
const searchNotes = vi.fn(() => Promise.resolve([] as Note[]));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    listNotes,
    searchNotes,
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

  it('renders result action buttons through Naive UI without unresolved component warnings', async () => {
    listNotes.mockResolvedValueOnce([
      {
        id: 'note-1',
        title: '搜索结果',
        content: '用于验证搜索结果动作按钮。',
        htmlContent: '<p>用于验证搜索结果动作按钮。</p>',
        tags: ['search'],
        isPinned: false,
        pinnedWindowConfig: null,
        canvasPosition: null,
        createdAt: '2026-05-15T07:00:00.000Z',
        updatedAt: '2026-05-15T07:05:00.000Z',
        wordCount: 12,
      },
    ]);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(WrappedSearchView);
    await flushPromises();

    expect(wrapper.find('.search-item').exists()).toBe(true);
    expect(wrapper.findAll('.search-item-actions button').length).toBeGreaterThan(0);
    expect(
      error.mock.calls.some(args => args.join(' ').includes('Failed to resolve component: NButton')),
    ).toBe(false);

    error.mockRestore();
  });
});
