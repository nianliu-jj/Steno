// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import { THEME_MODE_CHANGED_EVENT } from '@/theme';
import SettingsView from './SettingsView.vue';
import SettingsViewSource from './SettingsView.vue?raw';

const getDataPaths = vi.fn(() =>
  Promise.resolve({
    dataDir: 'D:\\Steno\\data',
    dbPath: 'D:\\Steno\\data\\steno.db',
    backupDir: 'D:\\Steno\\data\\backup',
  }),
);
const reloadShortcuts = vi.fn(() => Promise.resolve());
const updateSetting = vi.fn(() => Promise.resolve());
const loadSettings = vi.fn(() => Promise.resolve());
const navigateToMain = vi.fn();
const emitThemeModeChanged = vi.fn(() => Promise.resolve());

vi.mock('@tauri-apps/api/event', () => ({
  emit: (...args: Parameters<typeof emitThemeModeChanged>) => emitThemeModeChanged(...args),
}));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getDataPaths,
    reloadShortcuts,
  }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    loaded: true,
    error: null,
    state: {
      themeMode: 'system',
      mainWindowShortcut: 'Ctrl+Shift+N',
      quicknoteShortcut: 'Ctrl+Shift+M',
      searchShortcut: 'Ctrl+Shift+F',
      floatingWidth: 420,
      floatingHeight: 300,
      blurCloseDelayMs: 200,
      editorMode: 'split',
      backupEveryChanges: 10,
    },
    load: loadSettings,
    update: updateSetting,
  }),
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateToMain,
  }),
}));

const WrappedSettingsView = defineComponent({
  props: {
    embedded: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    return () =>
      h(NConfigProvider, null, {
        default: () =>
          h(NMessageProvider, null, {
            default: () => h(SettingsView, { embedded: props.embedded }),
          }),
      });
  },
});

function mountSettingsView(options?: { embedded?: boolean }) {
  return mount(WrappedSettingsView, {
    props: {
      embedded: options?.embedded ?? false,
    },
  });
}

describe('SettingsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    getDataPaths.mockClear();
    reloadShortcuts.mockClear();
    updateSetting.mockClear();
    loadSettings.mockClear();
    navigateToMain.mockClear();
    emitThemeModeChanged.mockClear();
  });

  it('renders the v2 header, category tabs, and footer actions', async () => {
    const wrapper = mountSettingsView();
    await flushPromises();

    expect(wrapper.get('.settings-brand__mark').text()).toBe('S');
    expect(wrapper.get('#settingsTitle').text()).toBe('设置');
    expect(wrapper.text()).toContain('所有更改自动保存');
    expect(wrapper.get('.settings-tabs').text()).toContain('常规');
    expect(wrapper.get('.settings-tabs').text()).toContain('外观');
    expect(wrapper.get('.settings-tabs').text()).toContain('快捷键');
    expect(wrapper.get('.settings-tabs').text()).toContain('隐私安全');
    expect(wrapper.get('.settings-tabs').text()).toContain('存储');
    expect(wrapper.get('.settings-tabs').text()).toContain('关于');
    expect(wrapper.find('button[aria-label="关闭设置"]').exists()).toBe(true);
    expect(wrapper.get('.settings-panel__footer').text()).toContain('取消');
    expect(wrapper.get('.settings-panel__footer').text()).toContain('重置');
    expect(wrapper.get('.settings-panel__footer').text()).toContain('确认');
    expect(wrapper.get('.settings-save-hint').text()).toContain('所有更改自动保存到本地');
  });

  it('switches between storage, shortcuts, and privacy sections', async () => {
    const wrapper = mountSettingsView();
    await flushPromises();

    await wrapper.get('[data-testid="settings-tab-storage"]').trigger('click');
    expect(wrapper.text()).toContain('数据目录');
    expect(wrapper.text()).toContain('数据库文件');
    expect(wrapper.text()).toContain('备份目录');
    expect(wrapper.text()).toContain('累计修改次数触发备份');

    await wrapper.get('[data-testid="settings-tab-shortcuts"]').trigger('click');
    expect(wrapper.text()).toContain('主窗口');
    expect(wrapper.text()).toContain('速记浮窗');
    expect(wrapper.text()).toContain('搜索');

    await wrapper.get('[data-testid="settings-tab-privacy"]').trigger('click');
    expect(wrapper.text()).toContain('数据库加密');
    expect(wrapper.text()).toContain('敏感内容过滤');
    expect(wrapper.text()).toContain('应用排除名单');
    expect(wrapper.text()).toContain('规划中');
    expect(wrapper.text()).toContain('只读');
  });

  it('renders storage paths in plain code blocks without highlight warnings', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mountSettingsView();
    await flushPromises();
    await wrapper.get('[data-testid="settings-tab-storage"]').trigger('click');

    const pathNodes = wrapper.findAll('code.settings-path-value');
    expect(pathNodes).toHaveLength(3);
    expect(wrapper.text()).toContain('D:\\Steno\\data');
    expect(wrapper.text()).toContain('D:\\Steno\\data\\steno.db');
    expect(wrapper.text()).toContain('D:\\Steno\\data\\backup');
    expect(error.mock.calls.some(args => args.join(' ').includes('hljs is not set'))).toBe(false);

    error.mockRestore();
  });

  it('emits close in embedded mode from the header close button, cancel, and confirm', async () => {
    const wrapper = mountSettingsView({ embedded: true });
    await flushPromises();

    const view = wrapper.findComponent(SettingsView);

    await wrapper.get('button[aria-label="关闭设置"]').trigger('click');
    await wrapper.get('.settings-panel__footer button:first-child').trigger('click');
    await wrapper.get('.settings-panel__footer button:last-child').trigger('click');

    expect(view.emitted('close')).toHaveLength(3);
    expect(navigateToMain).not.toHaveBeenCalled();
  });

  it('broadcasts theme mode changes after the setting is saved', async () => {
    const wrapper = mountSettingsView();
    await flushPromises();

    await wrapper.get('[data-testid="settings-tab-appearance"]').trigger('click');
    await wrapper.get('input[value="dark"]').setValue();
    await flushPromises();

    expect(updateSetting).toHaveBeenCalledWith('themeMode', 'dark');
    expect(emitThemeModeChanged).toHaveBeenCalledWith(THEME_MODE_CHANGED_EVENT, { mode: 'dark' });
  });

  it('keeps the v2 panel sizing, dark theme hook, and narrow-screen responsive rules', () => {
    expect(SettingsViewSource).toContain('width: min(920px, calc(100vw - 32px));');
    expect(SettingsViewSource).toContain('height: min(660px, calc(100vh - 48px));');
    expect(SettingsViewSource).toContain(':global(.dark) .settings-panel');
    expect(SettingsViewSource).toContain('@media (max-width: 720px)');
  });
});
