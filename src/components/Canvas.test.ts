// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import Canvas from './Canvas.vue';
import type { Note } from '@/types/steno';

const navigateToZenFromCanvas = vi.fn();
const updateCanvasPosition = vi.fn(() => Promise.resolve());

const note: Note = {
  id: 'note-1',
  title: '画布笔记',
  content: '正文',
  htmlContent: '<p>正文</p>',
  tags: [],
  isPinned: false,
  pinnedWindowConfig: null,
  canvasPosition: { x: 0, y: 0, scale: 1 },
  createdAt: '2026-05-13T00:00:00.000Z',
  updatedAt: '2026-05-13T00:00:00.000Z',
  wordCount: 2,
};

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    notes: [note],
    updateCanvasPosition,
  }),
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateToZenFromCanvas,
  }),
}));

describe('Canvas', () => {
  it('opens the note in Zen mode when a canvas card is double-clicked', async () => {
    const wrapper = mount(Canvas, {
      attachTo: document.body,
      global: {
        stubs: {
          NInput: { template: '<input />' },
          NTag: { template: '<span><slot /></span>' },
        },
      },
    });
    await flushPromises();

    await wrapper.find('.canvas-card').trigger('dblclick');

    expect(navigateToZenFromCanvas).toHaveBeenCalledWith('note-1');
  });
});
