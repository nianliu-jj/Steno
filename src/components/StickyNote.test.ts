// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import StickyNote from './StickyNote.vue';
import type { Note } from '@/types/steno';

const getNote = vi.fn<() => Promise<Note | null>>();
const saveDraft = vi.fn(() => Promise.resolve());
const updatePinnedConfig = vi.fn(() => Promise.resolve());
const unpinNote = vi.fn(() => Promise.resolve());
const startDragCurrent = vi.fn(() => Promise.resolve());
const setCurrentSize = vi.fn(() => Promise.resolve());
const setCurrentPosition = vi.fn(() => Promise.resolve());
const closeStickyNote = vi.fn(() => Promise.resolve());
const closeCurrent = vi.fn(() => Promise.resolve());
const hideCurrent = vi.fn(() => Promise.resolve());

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getNote,
  }),
}));

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    saveDraft,
    updatePinnedConfig,
    unpinNote,
  }),
}));

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    startDragCurrent,
    setCurrentSize,
    setCurrentPosition,
    closeStickyNote,
    closeCurrent,
    hideCurrent,
  }),
}));

const WrappedStickyNote = defineComponent({
  setup() {
    return () =>
      h(NConfigProvider, null, {
        default: () =>
          h(NMessageProvider, null, {
            default: () => h(StickyNote, { noteId: 'sticky-note-1' }),
          }),
      });
  },
});

describe('StickyNote', () => {
  beforeEach(() => {
    getNote.mockReset();
    saveDraft.mockClear();
    updatePinnedConfig.mockClear();
    unpinNote.mockClear();
    startDragCurrent.mockClear();
    setCurrentSize.mockClear();
    setCurrentPosition.mockClear();
    closeStickyNote.mockClear();
    closeCurrent.mockClear();
    hideCurrent.mockClear();

    getNote.mockResolvedValue({
      id: 'sticky-note-1',
      title: '置顶便签',
      content: '用于验证颜色选择器挂载。',
      htmlContent: '<p>用于验证颜色选择器挂载。</p>',
      tags: ['sticky'],
      isPinned: true,
      pinnedWindowConfig: {
        width: 280,
        height: 220,
        opacity: 1,
        color: '#fff7cc',
        fontSize: 14,
      },
      canvasPosition: null,
      createdAt: '2026-05-15T07:00:00.000Z',
      updatedAt: '2026-05-15T07:05:00.000Z',
      wordCount: 11,
    });
  });

  it('mounts the sticky color picker without extraneous class warnings', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(WrappedStickyNote);
    await flushPromises();

    expect(wrapper.find('.sticky-root').exists()).toBe(true);
    expect(wrapper.find('.sticky-color-picker').exists()).toBe(true);
    expect(
      error.mock.calls.some(args =>
        args.join(' ').includes('Extraneous non-props attributes (class) were passed to component'),
      ),
    ).toBe(false);

    error.mockRestore();
  });
});
