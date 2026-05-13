// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import MainView from './MainView.vue';

vi.mock('@vueuse/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@vueuse/core')>();
  return {
    ...actual,
    useDark: vi.fn(() => false),
    useToggle: vi.fn(() => vi.fn()),
  };
});

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    openZen: vi.fn(() => Promise.resolve()),
    openCanvas: vi.fn(() => Promise.resolve()),
    openSearch: vi.fn(() => Promise.resolve()),
    openSettings: vi.fn(() => Promise.resolve()),
    closeStickyNote: vi.fn(() => Promise.resolve()),
    openStickyNote: vi.fn(() => Promise.resolve()),
  }),
}));

const loadNotes = vi.fn(() => Promise.resolve());
const loadPinned = vi.fn(() => Promise.resolve());

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    notes: [],
    loading: false,
    loadNotes,
    loadPinned,
    pinNote: vi.fn(() => Promise.resolve()),
    unpinNote: vi.fn(() => Promise.resolve()),
    removeNote: vi.fn(() => Promise.resolve()),
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
    loadNotes.mockClear();
    loadPinned.mockClear();
  });

  it('does not display global shortcuts on the main page', async () => {
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    expect(wrapper.text()).not.toContain('全局快捷键');
    expect(wrapper.text()).not.toContain('Ctrl+Shift+N');
    expect(wrapper.text()).not.toContain('Ctrl+Shift+M');
  });
});
