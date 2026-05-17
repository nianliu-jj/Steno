// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import StickyNote from './StickyNote.vue';
import StickyNoteSource from './StickyNote.vue?raw';
import type { Note } from '@/types/steno';

const { emitNoteSaved } = vi.hoisted(() => ({
  emitNoteSaved: vi.fn(() => Promise.resolve()),
}));

const getNote = vi.fn<() => Promise<Note | null>>();
const saveDraft = vi.fn<(input: unknown) => Promise<Note | null>>();
const updatePinnedConfig = vi.fn(() => Promise.resolve());
const unpinNote = vi.fn(() => Promise.resolve());
const startDragCurrent = vi.fn(() => Promise.resolve());
const setCurrentSize = vi.fn(() => Promise.resolve());
const setCurrentPosition = vi.fn(() => Promise.resolve());
const closeStickyNote = vi.fn(() => Promise.resolve());
const closeCurrent = vi.fn(() => Promise.resolve());
const hideCurrent = vi.fn(() => Promise.resolve());

const baseNote: Note = {
  id: 'sticky-note-1',
  title: '置顶便签',
  content: '一二三四五\n六七八九',
  htmlContent: '<p>一二三四五</p><p>六七八九</p>',
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
  wordCount: 9,
};

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

vi.mock('@/composables/useAppEvents', () => ({
  emitNoteSaved,
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
    saveDraft.mockReset();
    updatePinnedConfig.mockClear();
    unpinNote.mockClear();
    emitNoteSaved.mockClear();
    startDragCurrent.mockClear();
    setCurrentSize.mockClear();
    setCurrentPosition.mockClear();
    closeStickyNote.mockClear();
    closeCurrent.mockClear();
    hideCurrent.mockClear();

    getNote.mockResolvedValue(baseNote);
    saveDraft.mockResolvedValue(baseNote);
  });

  it('renders a read-only title view, removes legacy color controls, and shows footer stats', async () => {
    const wrapper = mount(WrappedStickyNote);
    await flushPromises();

    expect(wrapper.get('[data-testid="sticky-title-text"]').text()).toBe('置顶便签');
    expect(wrapper.find('[data-testid="sticky-title-input"]').exists()).toBe(false);
    expect(wrapper.find('.sticky-color-picker').exists()).toBe(false);
    expect(wrapper.find('.sticky-opacity').exists()).toBe(false);
    expect(wrapper.get('[data-testid="sticky-footer-status"]').text()).toContain('9 字 · 2 行');
    expect(StickyNoteSource).toContain('var(--sticky-surface)');
    expect(StickyNoteSource).not.toContain("'#fff7cc'");
  });

  it('saves the edited title on blur and broadcasts the saved note', async () => {
    saveDraft.mockResolvedValueOnce({
      ...baseNote,
      title: '新的速记标题',
    });

    const wrapper = mount(WrappedStickyNote);
    await flushPromises();

    await wrapper.get('[data-testid="sticky-title-edit"]').trigger('click');
    await wrapper.get('[data-testid="sticky-title-input"] input').setValue('新的速记标题');
    await wrapper.get('[data-testid="sticky-title-input"] input').trigger('blur');
    await flushPromises();

    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sticky-note-1', title: '新的速记标题' }),
    );
    expect(emitNoteSaved).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sticky-note-1', title: '新的速记标题' }),
    );
    expect(wrapper.get('[data-testid="sticky-footer-status"]').text()).toContain('已保存');
  });

  it('restores the saved title when escape cancels title editing', async () => {
    const wrapper = mount(WrappedStickyNote);
    await flushPromises();

    await wrapper.get('[data-testid="sticky-title-edit"]').trigger('click');
    const input = wrapper.get('[data-testid="sticky-title-input"] input');
    await input.setValue('不会保存的标题');
    await input.trigger('keydown', { key: 'Escape' });
    await flushPromises();

    expect(saveDraft).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="sticky-title-text"]').text()).toBe('置顶便签');
  });
});
