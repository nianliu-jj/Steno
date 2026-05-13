// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import SettingsView from './SettingsView.vue';

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: 'main' }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

const getDataPaths = vi.fn(() =>
  Promise.resolve({
    dataDir: 'D:\\Steno\\data',
    dbPath: 'D:\\Steno\\data\\steno.db',
    backupDir: 'D:\\Steno\\data\\backup',
  }),
);

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getDataPaths,
    reloadShortcuts: vi.fn(() => Promise.resolve()),
  }),
}));

const updateSetting = vi.fn(() => Promise.resolve());
const loadSettings = vi.fn(() => Promise.resolve());

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    loaded: true,
    error: null,
    state: {
      themeMode: 'system',
      mainWindowShortcut: 'Ctrl+Shift+N',
      quicknoteShortcut: 'Ctrl+Shift+M',
      searchShortcut: 'Ctrl+Shift+F',
      floatingWidth: 400,
      floatingHeight: 300,
      blurCloseDelayMs: 200,
      editorMode: 'split',
      backupEveryChanges: 10,
    },
    load: loadSettings,
    update: updateSetting,
  }),
}));

const WrappedSettingsView = defineComponent({
  setup() {
    return () =>
      h(NConfigProvider, null, {
        default: () =>
          h(NMessageProvider, null, {
            default: () => h(SettingsView),
          }),
      });
  },
});

describe('SettingsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    getDataPaths.mockClear();
    updateSetting.mockClear();
    loadSettings.mockClear();
  });

  it('does not ask Naive UI code blocks for highlight.js when rendering paths', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(WrappedSettingsView);
    await flushPromises();

    expect(wrapper.text()).toContain('D:\\Steno\\data');
    const messages = error.mock.calls.map(args => args.join(' '));
    error.mockRestore();
    expect(messages.some(message => message.includes('hljs is not set'))).toBe(false);
  });
});
