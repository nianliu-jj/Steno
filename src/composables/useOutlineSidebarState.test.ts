// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOutlineSidebarState } from './useOutlineSidebarState';

const update = vi.fn(() => Promise.resolve());

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    state: {
      noteEditorOutlineWidth: 280,
      noteEditorOutlineOpen: false,
      zenOutlineWidth: 300,
      zenOutlineOpen: true,
    },
    update,
  }),
}));

describe('useOutlineSidebarState', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    update.mockClear();
  });

  it('collapses when dragged below the threshold', () => {
    const state = useOutlineSidebarState('note-editor');
    state.setWidth(72);

    expect(state.open.value).toBe(false);
    expect(state.canResize.value).toBe(false);
  });
});
