// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import CanvasView from './CanvasView.vue';

const loadNotes = vi.fn(() => Promise.resolve());

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    loadNotes,
  }),
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateToMain: vi.fn(),
  }),
}));

vi.mock('@/components/Canvas.vue', () => ({
  default: { template: '<div class="mock-canvas">canvas</div>' },
}));

describe('CanvasView', () => {
  it('renders canvas inside the shared workbench without its own page header', async () => {
    const wrapper = mount(CanvasView);
    await flushPromises();

    expect(wrapper.find('.canvas-page-header').exists()).toBe(false);
    expect(wrapper.find('.canvas-page-body').exists()).toBe(true);
    expect(wrapper.find('.mock-canvas').exists()).toBe(true);
  });
});
