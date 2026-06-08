/**
 * @file 前端视图 - Settings View
 *
 * 覆盖 Settings View 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider, NPopconfirm, NRadioGroup, NSwitch } from 'naive-ui';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import SettingsView from './SettingsView.vue';
import SettingsViewSource from './SettingsView.vue?raw';

const { defaultReminderQuickOptions, settingsState } = vi.hoisted(() => {
  // 局部常量 reminderDefaults：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const reminderDefaults = [
    {
      id: 'after-30-minutes',
      label: '30 分钟后',
      type: 'relative',
      value: 30,
      unit: 'minute'
    },
    {
      id: 'today-16',
      label: '今天下午 4 点',
      type: 'absolute',
      value: 0,
      unit: 'minute',
      absoluteTime: '16:00',
      dayOffset: 0
    }
  ];

  return {
    defaultReminderQuickOptions: reminderDefaults,
    settingsState: {
      themeMode: 'system',
      mainWindowShortcut: 'Ctrl+Shift+N',
      quicknoteShortcut: 'Ctrl+Shift+M',
      clipboardShortcut: 'Ctrl+Shift+V',
      searchShortcut: 'Ctrl+Shift+F',
      launchAtStartup: false,
      floatingWidth: 420,
      floatingHeight: 300,
      blurCloseDelayMs: 200,
      editorMode: 'split',
      backupEveryChanges: 10,
      todoQuickPanelEnabled: true,
      todoQuickPanelShortcut: 'Ctrl+Shift+T',
      todoQuickPanelPosition: 'bottom-right',
      todoQuickPanelLastPos: '',
      reminderQuickOptions: reminderDefaults
    }
  };
});

// 局部常量 getDataPaths：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const getDataPaths = vi.fn(() =>
  Promise.resolve({
    dataDir: 'D:\\Steno\\data',
    dbPath: 'D:\\Steno\\data\\steno.db',
    backupDir: 'D:\\Steno\\data\\backup'
  })
);
// 局部常量 reloadShortcuts：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const reloadShortcuts = vi.fn(() => Promise.resolve());
// 局部常量 setLaunchAtStartup：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const setLaunchAtStartup = vi.fn(() => Promise.resolve());
// 局部常量 updateSetting：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const updateSetting = vi.fn(() => Promise.resolve());
// 局部常量 loadSettings：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const loadSettings = vi.fn(() => Promise.resolve());
// 局部常量 navigateToMain：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const navigateToMain = vi.fn();
// 局部常量 emitThemeModeChanged：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const emitThemeModeChanged = vi.fn(() => Promise.resolve());
// 局部常量 messageError：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const messageError = vi.fn();
// 局部常量 messageSuccess：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const messageSuccess = vi.fn();
// 局部常量 messageInfo：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const messageInfo = vi.fn();

vi.mock('naive-ui', async () => {
  // 局部常量 actual：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui');
  return {
    ...actual,
    useMessage: () => ({
      error: messageError,
      success: messageSuccess,
      info: messageInfo
    })
  };
});

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getDataPaths,
    reloadShortcuts,
    setLaunchAtStartup
  })
}));

vi.mock('@/stores/settings', () => ({
  DEFAULT_REMINDER_QUICK_OPTIONS: defaultReminderQuickOptions,
  useSettingsStore: () => ({
    loaded: true,
    error: null,
    state: settingsState,
    load: loadSettings,
    update: updateSetting
  })
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateToMain
  })
}));

vi.mock('@/composables/useAppEvents', () => ({
  useAppEvents: () => ({
    emitThemeModeChanged,
    emitNoteSaved: vi.fn(),
    listenThemeModeChanged: vi.fn(),
    listenNoteSaved: vi.fn()
  })
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    state: {
      locale: 'zh-CN'
    }
  })
}));

// 组件定义 WrappedSettingsView：集中声明渲染入口、props 和事件响应。
const WrappedSettingsView = defineComponent({
  props: {
    embedded: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    return () =>
      h(NConfigProvider, null, {
        default: () =>
          h(NMessageProvider, null, {
            default: () => h(SettingsView, { embedded: props.embedded })
          })
      });
  }
});

// 函数 mountSettingsView：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function mountSettingsView(options?: { embedded?: boolean }) {
  return mount(WrappedSettingsView, {
    props: {
      embedded: options?.embedded ?? false
    }
  });
}

// 测试用例：验证「SettingsView」场景，锁定 Settings View 的用户可见行为。
describe('SettingsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    getDataPaths.mockClear();
    reloadShortcuts.mockClear();
    setLaunchAtStartup.mockClear();
    updateSetting.mockClear();
    loadSettings.mockClear();
    navigateToMain.mockClear();
    emitThemeModeChanged.mockClear();
    messageError.mockClear();
    messageSuccess.mockClear();
    messageInfo.mockClear();
    settingsState.reminderQuickOptions = defaultReminderQuickOptions.map(option => ({ ...option }));
  });

  // 测试用例：验证「renders the v2 header, category tabs, and footer actions」场景，锁定 Settings View 的用户可见行为。
  it('renders the v2 header, category tabs, and footer actions', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mountSettingsView();
    await flushPromises();

    expect(wrapper.get('.settings-brand__mark').text()).toBe('S');
    expect(wrapper.get('#settingsTitle').text()).toBe('设置');
    expect(wrapper.text()).toContain('所有更改自动保存');
    expect(wrapper.get('.settings-sidebar').text()).toContain('常规');
    expect(wrapper.get('.settings-sidebar').text()).toContain('外观');
    expect(wrapper.get('.settings-sidebar').text()).toContain('快捷键');
    expect(wrapper.get('.settings-sidebar').text()).toContain('提醒设置');
    expect(wrapper.get('.settings-sidebar').text()).toContain('隐私安全');
    expect(wrapper.get('.settings-sidebar').text()).toContain('存储');
    expect(wrapper.get('.settings-sidebar').text()).toContain('关于');
    expect(wrapper.find('button[aria-label="关闭设置"]').exists()).toBe(true);
    expect(wrapper.get('.settings-save-hint').text()).toContain('所有更改自动保存到本地');
  });

  // 测试用例：验证「renders the reminders section between todo and privacy tabs」场景，锁定 Settings View 的用户可见行为。
  it('renders the reminders section between todo and privacy tabs', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mountSettingsView();
    await flushPromises();

    // 局部常量 tabText：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const tabText = wrapper.get('.settings-sidebar').text();
    expect(tabText.indexOf('待办浮窗')).toBeLessThan(tabText.indexOf('提醒设置'));
    expect(tabText.indexOf('提醒设置')).toBeLessThan(tabText.indexOf('隐私安全'));

    await wrapper.get('[data-testid="settings-tab-reminders"]').trigger('click');

    expect(wrapper.text()).toContain('提醒设置');
    expect(wrapper.findAll('.reminder-option-row')).toHaveLength(2);
    expect((wrapper.get('[data-testid="reminder-option-label-0"] input').element as HTMLInputElement).value).toBe(
      '30 分钟后'
    );
    expect((wrapper.get('[data-testid="reminder-option-label-1"] input').element as HTMLInputElement).value).toBe(
      '今天下午 4 点'
    );
    expect(wrapper.find('[data-testid="reminder-option-add"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="reminder-options-reset"]').exists()).toBe(true);
  });

  // 测试用例：验证「persists reminder option add, delete, and restore actions」场景，锁定 Settings View 的用户可见行为。
  it('persists reminder option add, delete, and restore actions', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
          unit: 'minute'
        })
      ])
    );

    await wrapper.get('[data-testid="reminder-option-delete-0"]').trigger('click');
    expect(updateSetting).toHaveBeenLastCalledWith('reminderQuickOptions', [defaultReminderQuickOptions[1]]);

    wrapper.findComponent(NPopconfirm).vm.$emit('positive-click');
    expect(updateSetting).toHaveBeenLastCalledWith('reminderQuickOptions', defaultReminderQuickOptions);
  });

  // 测试用例：验证「switches between storage, shortcuts, and privacy sections」场景，锁定 Settings View 的用户可见行为。
  it('switches between storage, shortcuts, and privacy sections', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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

  // 测试用例：验证「renders storage paths in plain code blocks without highlight warnings」场景，锁定 Settings View 的用户可见行为。
  it('renders storage paths in plain code blocks without highlight warnings', async () => {
    // 局部常量 error：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mountSettingsView();
    await flushPromises();
    await wrapper.get('[data-testid="settings-tab-storage"]').trigger('click');

    // 局部常量 pathNodes：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const pathNodes = wrapper.findAll('code.settings-path-value');
    expect(pathNodes).toHaveLength(3);
    expect(wrapper.text()).toContain('D:\\Steno\\data');
    expect(wrapper.text()).toContain('D:\\Steno\\data\\steno.db');
    expect(wrapper.text()).toContain('D:\\Steno\\data\\backup');
    expect(error.mock.calls.some(args => args.join(' ').includes('hljs is not set'))).toBe(false);

    error.mockRestore();
  });

  // 测试用例：验证「emits close in embedded mode from the header close button」场景，锁定 Settings View 的用户可见行为。
  it('emits close in embedded mode from the header close button', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mountSettingsView({ embedded: true });
    await flushPromises();

    // 局部常量 view：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const view = wrapper.findComponent(SettingsView);

    await wrapper.get('button[aria-label="关闭设置"]').trigger('click');

    expect(view.emitted('close')).toHaveLength(1);
    expect(navigateToMain).not.toHaveBeenCalled();
  });

  // 测试用例：验证「broadcasts the saved theme mode from the appearance tab」场景，锁定 Settings View 的用户可见行为。
  it('broadcasts the saved theme mode from the appearance tab', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mountSettingsView();
    await flushPromises();

    await wrapper.get('[data-testid="settings-tab-appearance"]').trigger('click');
    await wrapper.findComponent(NRadioGroup).vm.$emit('update:value', 'dark');
    await flushPromises();

    expect(updateSetting).toHaveBeenCalledWith('themeMode', 'dark');
    expect(emitThemeModeChanged).toHaveBeenCalledWith('dark');
  });

  // 测试用例：验证「does not broadcast theme mode when saving the appearance setting fails」场景，锁定 Settings View 的用户可见行为。
  it('does not broadcast theme mode when saving the appearance setting fails', async () => {
    updateSetting.mockRejectedValueOnce(new Error('save failed'));

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mountSettingsView();
    await flushPromises();

    await wrapper.get('[data-testid="settings-tab-appearance"]').trigger('click');
    await wrapper.findComponent(NRadioGroup).vm.$emit('update:value', 'dark');
    await flushPromises();

    expect(updateSetting).toHaveBeenCalledWith('themeMode', 'dark');
    expect(emitThemeModeChanged).not.toHaveBeenCalled();
  });

  // 测试用例：验证「does not report theme persistence failure when only broadcasting the theme event fails」场景，锁定 Settings View 的用户可见行为。
  it('does not report theme persistence failure when only broadcasting the theme event fails', async () => {
    // 局部常量 error：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    emitThemeModeChanged.mockRejectedValueOnce(new Error('broadcast failed'));

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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

  // 测试用例：验证「persists launch at startup from the general section」场景，锁定 Settings View 的用户可见行为。
  it('persists launch at startup from the general section', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mountSettingsView();
    await flushPromises();

    // 局部常量 startupSwitch：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const startupSwitch = wrapper.findComponent(NSwitch);
    startupSwitch.vm.$emit('update:value', true);
    await flushPromises();

    expect(updateSetting).toHaveBeenCalledWith('launchAtStartup', true);
    expect(setLaunchAtStartup).toHaveBeenCalledWith(true);
    expect(messageSuccess).toHaveBeenCalledWith('已开启开机自启动');
  });

  // 测试用例：验证「opens a shortcut dialog on double click and captures a clipboard shortcut there」场景，锁定 Settings View 的用户可见行为。
  it('opens a shortcut dialog on double click and captures a clipboard shortcut there', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mountSettingsView();
    await flushPromises();

    await wrapper.get('[data-testid="settings-tab-shortcuts"]').trigger('click');
    // 局部常量 capture：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const capture = wrapper.get('[data-testid="clipboard-shortcut-capture"]');

    expect(capture.find('input').exists()).toBe(false);
    await capture.trigger('dblclick');
    expect(wrapper.get('[data-testid="shortcut-capture-dialog"]').text()).toContain('更换快捷键');

    await wrapper.get('[data-testid="shortcut-capture-dialog"]').trigger('keydown', {
      key: 'B',
      ctrlKey: true,
      shiftKey: true
    });
    await flushPromises();

    expect(updateSetting).toHaveBeenCalledWith('clipboardShortcut', 'Ctrl+Shift+B');
    expect(reloadShortcuts).toHaveBeenCalledOnce();
    expect(messageSuccess).toHaveBeenCalledWith('已更新「粘贴板快捷键」');
  });

  // 测试用例：验证「does not save shortcuts with more than three pressed keys」场景，锁定 Settings View 的用户可见行为。
  it('does not save shortcuts with more than three pressed keys', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mountSettingsView();
    await flushPromises();

    await wrapper.get('[data-testid="settings-tab-shortcuts"]').trigger('click');
    await wrapper.get('[data-testid="main-shortcut-capture"]').trigger('dblclick');

    await wrapper.get('[data-testid="shortcut-capture-dialog"]').trigger('keydown', {
      key: 'B',
      ctrlKey: true,
      altKey: true,
      shiftKey: true
    });
    await flushPromises();

    expect(updateSetting).not.toHaveBeenCalledWith('mainWindowShortcut', 'Ctrl+Alt+Shift+B');
    expect(reloadShortcuts).not.toHaveBeenCalled();
    expect(messageInfo).toHaveBeenCalledWith('快捷键最多支持 3 个按键');
    expect(wrapper.find('[data-testid="shortcut-capture-dialog"]').exists()).toBe(true);
  });

  // 测试用例：验证「keeps the v2 panel sizing, dark theme hook, and narrow-screen responsive rules」场景，锁定 Settings View 的用户可见行为。
  it('keeps the v2 panel sizing, dark theme hook, and narrow-screen responsive rules', () => {
    expect(SettingsViewSource).toContain('width: min(1060px, calc(100vw - 32px));');
    expect(SettingsViewSource).toContain('height: min(660px, calc(100vh - 48px));');
    expect(SettingsViewSource).toContain(':global(.dark) .settings-panel');
    expect(SettingsViewSource).toContain('@media (max-width: 800px)');
  });
});
