// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider, NPopconfirm, NRadioGroup } from 'naive-ui';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import SettingsView from './SettingsView.vue';
import SettingsViewSource from './SettingsView.vue?raw';

const { defaultReminderQuickOptions, settingsState } = vi.hoisted(() => {
  const reminderDefaults = [
    {
      id: 'after-30-minutes',
      label: '30 分钟后',
      type: 'relative',
      value: 30,
      unit: 'minute',
    },
    {
      id: 'today-16',
      label: '今天下午 4 点',
      type: 'absolute',
      value: 0,
      unit: 'minute',
      absoluteTime: '16:00',
      dayOffset: 0,
    },
  ];

  return {
    defaultReminderQuickOptions: reminderDefaults,
    settingsState: {
      themeMode: 'system',
      mainWindowShortcut: 'Ctrl+Shift+N',
      quicknoteShortcut: 'Ctrl+Shift+M',
      clipboardShortcut: 'Ctrl+Shift+V',
      searchShortcut: 'Ctrl+Shift+F',
      floatingWidth: 420,
      floatingHeight: 300,
      blurCloseDelayMs: 200,
      editorMode: 'split',
      backupEveryChanges: 10,
      todoQuickPanelEnabled: true,
      todoQuickPanelShortcut: 'Ctrl+Shift+T',
      todoQuickPanelPosition: 'bottom-right',
      todoQuickPanelLastPos: '',
      reminderQuickOptions: reminderDefaults,
    },
  };
});

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
const messageError = vi.fn();
const messageSuccess = vi.fn();
const messageInfo = vi.fn();

vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui');
  return {
    ...actual,
    useMessage: () => ({
      error: messageError,
      success: messageSuccess,
      info: messageInfo,
    }),
  };
});

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getDataPaths,
    reloadShortcuts,
  }),
}));

vi.mock('@/stores/settings', () => ({
  DEFAULT_REMINDER_QUICK_OPTIONS: defaultReminderQuickOptions,
  useSettingsStore: () => ({
    loaded: true,
    error: null,
    state: settingsState,
    load: loadSettings,
    update: updateSetting,
  }),
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateToMain,
  }),
}));

vi.mock('@/composables/useAppEvents', () => ({
  useAppEvents: () => ({
    emitThemeModeChanged,
    emitNoteSaved: vi.fn(),
    listenThemeModeChanged: vi.fn(),
    listenNoteSaved: vi.fn(),
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
    messageError.mockClear();
    messageSuccess.mockClear();
    messageInfo.mockClear();
    settingsState.reminderQuickOptions = defaultReminderQuickOptions.map(option => ({ ...option }));
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
    expect(wrapper.get('.settings-tabs').text()).toContain('提醒设置');
    expect(wrapper.get('.settings-tabs').text()).toContain('隐私安全');
    expect(wrapper.get('.settings-tabs').text()).toContain('存储');
    expect(wrapper.get('.settings-tabs').text()).toContain('关于');
    expect(wrapper.find('button[aria-label="关闭设置"]').exists()).toBe(true);
    expect(wrapper.get('.settings-panel__footer').text()).toContain('取消');
    expect(wrapper.get('.settings-panel__footer').text()).toContain('重置');
    expect(wrapper.get('.settings-panel__footer').text()).toContain('确认');
    expect(wrapper.get('.settings-save-hint').text()).toContain('所有更改自动保存到本地');
  });

  it('renders the reminders section between todo and privacy tabs', async () => {
    const wrapper = mountSettingsView();
    await flushPromises();

    const tabText = wrapper.get('.settings-tabs').text();
    expect(tabText.indexOf('待办浮窗')).toBeLessThan(tabText.indexOf('提醒设置'));
    expect(tabText.indexOf('提醒设置')).toBeLessThan(tabText.indexOf('隐私安全'));

    await wrapper.get('[data-testid="settings-tab-reminders"]').trigger('click');

    expect(wrapper.text()).toContain('提醒设置');
    expect(wrapper.findAll('.reminder-option-row')).toHaveLength(2);
    expect((wrapper.get('[data-testid="reminder-option-label-0"] input').element as HTMLInputElement).value).toBe(
      '30 分钟后',
    );
    expect((wrapper.get('[data-testid="reminder-option-label-1"] input').element as HTMLInputElement).value).toBe(
      '今天下午 4 点',
    );
    expect(wrapper.find('[data-testid="reminder-option-add"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="reminder-options-reset"]').exists()).toBe(true);
  });

  it('persists reminder option add, delete, and restore actions', async () => {
    const wrapper = mountSettingsView();
    await flushPromises();
    await wrapper.get('[data-testid="settings-tab-reminders"]').trigger('click');

    await wrapper.get('[data-testid="reminder-option-add"]').trigger('click');
    expect(updateSetting).toHaveBeenLastCalledWith(
      'reminderQuickOptions',
      expect.arrayContaining([
        expect.objectContaining({
          label: '15 分钟后',
          type: 'relative',
          value: 15,
          unit: 'minute',
        }),
      ]),
    );

    await wrapper.get('[data-testid="reminder-option-delete-0"]').trigger('click');
    expect(updateSetting).toHaveBeenLastCalledWith(
      'reminderQuickOptions',
      [defaultReminderQuickOptions[1]],
    );

    wrapper.findComponent(NPopconfirm).vm.$emit('positive-click');
    expect(updateSetting).toHaveBeenLastCalledWith(
      'reminderQuickOptions',
      defaultReminderQuickOptions,
    );
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
    expect(wrapper.text()).toContain('粘贴板');
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

  it('broadcasts the saved theme mode from the appearance tab', async () => {
    const wrapper = mountSettingsView();
    await flushPromises();

    await wrapper.get('[data-testid="settings-tab-appearance"]').trigger('click');
    await wrapper.findComponent(NRadioGroup).vm.$emit('update:value', 'dark');
    await flushPromises();

    expect(updateSetting).toHaveBeenCalledWith('themeMode', 'dark');
    expect(emitThemeModeChanged).toHaveBeenCalledWith('dark');
  });

  it('does not broadcast theme mode when saving the appearance setting fails', async () => {
    updateSetting.mockRejectedValueOnce(new Error('save failed'));

    const wrapper = mountSettingsView();
    await flushPromises();

    await wrapper.get('[data-testid="settings-tab-appearance"]').trigger('click');
    await wrapper.findComponent(NRadioGroup).vm.$emit('update:value', 'dark');
    await flushPromises();

    expect(updateSetting).toHaveBeenCalledWith('themeMode', 'dark');
    expect(emitThemeModeChanged).not.toHaveBeenCalled();
  });

  it('does not report theme persistence failure when only broadcasting the theme event fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    emitThemeModeChanged.mockRejectedValueOnce(new Error('broadcast failed'));

    const wrapper = mountSettingsView();
    await flushPromises();

    await wrapper.get('[data-testid="settings-tab-appearance"]').trigger('click');
    await wrapper.findComponent(NRadioGroup).vm.$emit('update:value', 'dark');
    await flushPromises();

    expect(updateSetting).toHaveBeenCalledWith('themeMode', 'dark');
    expect(emitThemeModeChanged).toHaveBeenCalledWith('dark');
    expect(messageError).not.toHaveBeenCalledWith(expect.stringContaining('主题保存失败'));
    expect(error).toHaveBeenCalled();

    error.mockRestore();
  });

  it('saves the clipboard shortcut and reloads global shortcuts', async () => {
    const wrapper = mountSettingsView();
    await flushPromises();

    await wrapper.get('[data-testid="settings-tab-shortcuts"]').trigger('click');
    const input = wrapper.get('[data-testid="clipboard-shortcut-input"] input');
    await input.setValue('Alt+C');
    await input.trigger('keydown.enter');
    await flushPromises();

    expect(updateSetting).toHaveBeenCalledWith('clipboardShortcut', 'Alt+C');
    expect(reloadShortcuts).toHaveBeenCalledOnce();
    expect(messageSuccess).toHaveBeenCalledWith('已更新「粘贴板快捷键」');
  });

  it('keeps the v2 panel sizing, dark theme hook, and narrow-screen responsive rules', () => {
    expect(SettingsViewSource).toContain('width: min(920px, calc(100vw - 32px));');
    expect(SettingsViewSource).toContain('height: min(660px, calc(100vh - 48px));');
    expect(SettingsViewSource).toContain(':global(.dark) .settings-panel');
    expect(SettingsViewSource).toContain('@media (max-width: 720px)');
  });
});
