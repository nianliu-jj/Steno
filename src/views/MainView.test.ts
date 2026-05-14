// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import MainView from './MainView.vue';
import type { Note } from '@/types/steno';

const openQuicknote = vi.fn(() => Promise.resolve());
const navigateTo = vi.fn();

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    openQuicknote,
    openCanvas: vi.fn(() => Promise.resolve()),
    openSearch: vi.fn(() => Promise.resolve()),
    openSettings: vi.fn(() => Promise.resolve()),
    closeStickyNote: vi.fn(() => Promise.resolve()),
    openStickyNote: vi.fn(() => Promise.resolve()),
  }),
}));

const loadNotes = vi.fn(() => Promise.resolve());
const loadPinned = vi.fn(() => Promise.resolve());
let notesState: Note[] = [];
let loadingState = false;

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    notes: notesState,
    loading: loadingState,
    loadNotes,
    loadPinned,
    pinNote: vi.fn(() => Promise.resolve()),
    unpinNote: vi.fn(() => Promise.resolve()),
    removeNote: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateTo,
  }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    state: {
      mainWindowShortcut: 'Ctrl+Shift+N',
      quicknoteShortcut: 'Ctrl+Shift+M',
    },
  }),
}));

const WrappedMainView = defineComponent({
  setup() {
    return () =>
      h(NConfigProvider, null, {
        default: () =>
          h(NMessageProvider, null, {
            default: () => h(MainView),
          }),
      });
  },
});

describe('MainView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    openQuicknote.mockClear();
    navigateTo.mockClear();
    loadNotes.mockClear();
    loadPinned.mockClear();
    notesState = [];
    loadingState = false;
  });

  it('does not display global shortcuts on the main page', async () => {
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    expect(wrapper.text()).not.toContain('全局快捷键');
    expect(wrapper.text()).not.toContain('Ctrl+Shift+N');
    expect(wrapper.text()).not.toContain('Ctrl+Shift+M');
    expect(wrapper.text()).not.toContain('Steno');
  });

  it('renders notes as layout v2 cards', async () => {
    notesState = [
      {
        id: 'note-1',
        title: 'Rust 生命周期笔记',
        content: '函数中的生命周期标注影响返回值的存活范围。',
        htmlContent: '<p>函数中的生命周期标注影响返回值的存活范围。</p>',
        tags: ['rust', '学习'],
        isPinned: true,
        pinnedWindowConfig: null,
        canvasPosition: null,
        createdAt: '2026-05-14T10:00:00.000Z',
        updatedAt: '2026-05-14T10:03:00.000Z',
        wordCount: 18,
      },
    ];

    const wrapper = mount(WrappedMainView);
    await flushPromises();

    expect(wrapper.find('.notes-grid').exists()).toBe(true);
    expect(wrapper.find('.note-card').text()).toContain('Rust 生命周期笔记');
    expect(wrapper.find('.note-card').text()).toContain('#rust');
  });

  it('renders the layout v2 empty state when there are no notes', async () => {
    notesState = [];

    const wrapper = mount(WrappedMainView);
    await flushPromises();

    expect(wrapper.find('.empty-state').exists()).toBe(true);
    expect(wrapper.text()).toContain('这里还空着');
  });

  it('opens the note editor in the main window when creating a note', async () => {
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    await wrapper.find('[data-action="new-note"]').trigger('click');

    expect(navigateTo).toHaveBeenCalledWith('note-editor');
    expect(openQuicknote).not.toHaveBeenCalled();
  });

  it('opens quicknote only from the quicknote action', async () => {
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    await wrapper.find('[data-action="new-quicknote"]').trigger('click');

    expect(openQuicknote).toHaveBeenCalledOnce();
  });
});
