// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsStore } from './settings';

const getSetting = vi.fn(async (key: string) => ({
  noteEditorOutlineWidth: '312',
  noteEditorOutlineOpen: 'true',
  zenOutlineWidth: '280',
  zenOutlineOpen: 'false',
}[key] ?? null));

const setSetting = vi.fn(() => Promise.resolve());

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({ getSetting, setSetting }),
}));

describe('settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    getSetting.mockClear();
    setSetting.mockClear();
  });

  it('decodes outline width and open state from settings rows', async () => {
    const settings = useSettingsStore();
    await settings.load();

    expect(settings.state.noteEditorOutlineWidth).toBe(312);
    expect(settings.state.noteEditorOutlineOpen).toBe(true);
    expect(settings.state.zenOutlineWidth).toBe(280);
    expect(settings.state.zenOutlineOpen).toBe(false);
  });
});
