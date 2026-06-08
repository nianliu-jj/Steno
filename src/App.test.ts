/**
 * @file 前端应用入口 - App
 *
 * 覆盖 App 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Teleport, nextTick, reactive, ref, type PropType } from 'vue';

// 类型 ShellNavItem：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
type ShellNavItem = {
  label: string;
};

// 局部常量 uiState：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const uiState = reactive({
  mode: 'main',
  noteId: null as string | null,
  settingsOpen: false,
  closeSettings: vi.fn()
});

// 局部常量 settingsState：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const settingsState = reactive({
  themeMode: 'system'
});

// 局部常量 loadSettings：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const loadSettings = vi.fn(() => Promise.resolve());
// 局部常量 darkState：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const darkState = ref(false);
// 局部常量 themeModeListeners：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const themeModeListeners = new Set<(value: 'light' | 'dark' | 'system') => void>();
// 局部常量 listenThemeModeChangedMock：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const listenThemeModeChangedMock = vi.fn(async (handler: (value: 'light' | 'dark' | 'system') => void) => {
  themeModeListeners.add(handler);
  return () => {
    themeModeListeners.delete(handler);
  };
});

vi.mock('@vueuse/core', () => ({
  useDark: () => darkState
}));

vi.mock('@/composables/useAppEvents', () => ({
  useAppEvents: () => ({
    emitThemeModeChanged: vi.fn(),
    emitNoteSaved: vi.fn(),
    listenThemeModeChanged: listenThemeModeChangedMock,
    listenNoteSaved: vi.fn(async () => () => {})
  })
}));

vi.mock('naive-ui', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    darkTheme: {},
    NConfigProvider: defineComponent({
      props: {
        theme: {
          type: Object,
          default: null
        }
      },
      setup(_, { slots }) {
        return () => slots.default?.();
      }
    }),
    NMessageProvider: defineComponent({
      setup(_, { slots }) {
        return () => slots.default?.();
      }
    }),
    NModal: defineComponent({
      props: {
        show: {
          type: Boolean,
          default: false
        },
        preset: {
          type: String,
          default: undefined
        },
        maskClosable: {
          type: Boolean,
          default: true
        },
        autoFocus: {
          type: Boolean,
          default: true
        },
        to: {
          type: String,
          default: 'body'
        }
      },
      emits: ['update:show'],
      setup(props, { slots }) {
        return () =>
          props.show
            ? h(
                Teleport,
                {
                  to: props.to,
                  defer: true
                },
                [
                  h(
                    'div',
                    {
                      'data-testid': 'settings-modal',
                      'data-teleport-to': props.to
                    },
                    slots.default?.()
                  )
                ]
              )
            : null;
      }
    })
  };
});

vi.mock('@/stores/ui', () => ({
  useUiStore: () => uiState
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    state: settingsState,
    load: loadSettings
  })
}));

vi.mock('@/stores/todos', () => ({
  useTodosStore: () => ({
    startEventListeners: vi.fn(async () => {}),
    stopEventListeners: vi.fn(() => {})
  })
}));

vi.mock('@/components/MainWorkbenchShell.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      props: {
        navItems: {
          type: Array as PropType<ShellNavItem[]>,
          required: true
        }
      },
      setup(props, { slots }) {
        return () =>
          h('div', { 'data-testid': 'shell' }, [
            h('div', { 'data-testid': 'shell-nav-count' }, String(props.navItems.length)),
            h('div', { 'data-testid': 'shell-nav-labels' }, props.navItems.map(item => item.label).join('|')),
            h('div', { 'data-testid': 'shell-default' }, slots.default?.())
          ]);
      }
    })
  };
});

vi.mock('@/views/MainView.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'main-view' }, 'main-view')
    })
  };
});

vi.mock('@/views/SettingsView.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      props: {
        embedded: {
          type: Boolean,
          default: false
        }
      },
      emits: ['close'],
      setup(props, { emit }) {
        return () =>
          h('div', { 'data-testid': props.embedded ? 'settings-view-embedded' : 'settings-view' }, [
            h('span', props.embedded ? 'embedded-settings' : 'settings'),
            h('button', { onClick: () => emit('close') }, 'close-settings')
          ]);
      }
    })
  };
});

vi.mock('@/views/NoteEditorView.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'note-editor-view' })
    })
  };
});

vi.mock('@/views/CanvasView.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'canvas-view' })
    })
  };
});

vi.mock('@/views/ClipboardView.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'clipboard-view' }, 'clipboard-view')
    })
  };
});

vi.mock('@/views/StatsView.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'stats-view' }, 'stats-view')
    })
  };
});

vi.mock('@/views/PlaceholderView.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'placeholder-view' })
    })
  };
});

vi.mock('@/components/FloatingEditor.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'floating-view' })
    })
  };
});

vi.mock('@/components/StickyNote.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'sticky-view' })
    })
  };
});

vi.mock('@/views/ZenMode.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'zen-view' })
    })
  };
});

import App from './App.vue';

// 测试用例：验证「App」场景，锁定 App 的用户可见行为。
describe('App', () => {
  beforeEach(() => {
    uiState.mode = 'main';
    uiState.noteId = null;
    uiState.settingsOpen = false;
    uiState.closeSettings.mockClear();
    settingsState.themeMode = 'system';
    loadSettings.mockClear();
    darkState.value = false;
    themeModeListeners.clear();
    document.body.innerHTML = '';
    listenThemeModeChangedMock.mockClear();
    listenThemeModeChangedMock.mockImplementation(async handler => {
      themeModeListeners.add(handler);
      return () => {
        themeModeListeners.delete(handler);
      };
    });
  });

  // 测试用例：验证「keeps the current workbench page in the background and opens settings as an embedded modal」场景，锁定 App 的用户可见行为。
  it('keeps the current workbench page in the background and opens settings as an embedded modal', async () => {
    uiState.mode = 'main';
    uiState.settingsOpen = true;

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(App, {
      attachTo: document.body
    });

    expect(wrapper.find('[data-testid="shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="main-actions"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="shell-nav-labels"]').text()).toBe('笔记列表|画布|粘贴板|待办|截图|OCR|翻译');
    expect(wrapper.get('[data-testid="shell-nav-labels"]').text()).not.toContain('搜索');
    expect(wrapper.get('[data-testid="shell-nav-labels"]').text()).not.toContain('统计');
    expect(wrapper.findAll('[data-testid="main-view"]')).toHaveLength(1);
    expect(document.body.querySelector('[data-testid="settings-modal"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="settings-view-embedded"]')).not.toBeNull();

    // 局部常量 closeButton：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const closeButton = document.body.querySelector(
      '[data-testid="settings-view-embedded"] button'
    ) as HTMLButtonElement | null;
    closeButton?.click();
    await nextTick();
    expect(uiState.closeSettings).toHaveBeenCalledOnce();

    uiState.settingsOpen = false;
    await nextTick();
    wrapper.unmount();
  });

  // 测试用例：验证「renders the standalone settings page when the window itself is in settings mode」场景，锁定 App 的用户可见行为。
  it('renders the standalone settings page when the window itself is in settings mode', () => {
    uiState.mode = 'settings';
    uiState.settingsOpen = false;

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(App);

    expect(wrapper.find('[data-testid="shell"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-modal"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-view"]').exists()).toBe(true);
  });

  // 测试用例：验证「renders the clipboard view for clipboard mode instead of the placeholder」场景，锁定 App 的用户可见行为。
  it('renders the clipboard view for clipboard mode instead of the placeholder', () => {
    uiState.mode = 'clipboard';

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(App);

    expect(wrapper.find('[data-testid="shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="clipboard-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="placeholder-view"]').exists()).toBe(false);
  });

  // 测试用例：验证「renders the stats view without exposing stats in the main workbench sidebar」场景，锁定 App 的用户可见行为。
  it('renders the stats view without exposing stats in the main workbench sidebar', async () => {
    uiState.mode = 'stats';

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(App);
    await nextTick();
    await flushPromises();
    await nextTick();

    expect(wrapper.find('[data-testid="shell"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="shell-nav-labels"]').text()).toBe('笔记列表|画布|粘贴板|待办|截图|OCR|翻译');
    expect(wrapper.find('[data-testid="stats-view"]').exists()).toBe(true);
  });

  // 测试用例：验证「teleports the embedded settings modal into the themed app root instead of body」场景，锁定 App 的用户可见行为。
  it('teleports the embedded settings modal into the themed app root instead of body', async () => {
    uiState.mode = 'main';
    uiState.settingsOpen = true;

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(App, {
      attachTo: document.body
    });

    // 局部常量 appThemeRoot：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const appThemeRoot = document.body.querySelector('.app-theme-root');
    // 局部常量 modal：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const modal = document.body.querySelector('[data-testid="settings-modal"]');

    expect(modal).not.toBeNull();
    expect(modal?.getAttribute('data-teleport-to')).toBe('.app-theme-root');
    expect(appThemeRoot?.contains(modal)).toBe(true);
    expect(Array.from(document.body.children)).not.toContain(modal);

    uiState.settingsOpen = false;
    await nextTick();
    wrapper.unmount();
  });

  // 测试用例：验证「mounts shared theme vars on the app root and updates dark mode after a theme event」场景，锁定 App 的用户可见行为。
  it('mounts shared theme vars on the app root and updates dark mode after a theme event', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(App);

    expect(wrapper.get('.app-theme-root').attributes('style')).toContain('--app-bg:');
    expect(settingsState.themeMode).toBe('system');
    expect(darkState.value).toBe(false);
    expect(wrapper.get('.app-theme-root').classes()).not.toContain('dark');

    for (const listener of themeModeListeners) {
      listener('dark');
    }
    await nextTick();

    expect(settingsState.themeMode).toBe('dark');
    expect(darkState.value).toBe(true);
    expect(wrapper.get('.app-theme-root').classes()).toContain('dark');
  });

  // 测试用例：验证「preserves the latest theme event when settings load resolves afterward with stale data」场景，锁定 App 的用户可见行为。
  it('preserves the latest theme event when settings load resolves afterward with stale data', async () => {
    let resolveLoad!: () => void;
    // 局部常量 loadPromise：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const loadPromise = new Promise<void>(resolve => {
      resolveLoad = () => {
        settingsState.themeMode = 'light';
        resolve();
      };
    });

    loadSettings.mockImplementation(() => loadPromise);

    mount(App);

    for (const listener of themeModeListeners) {
      listener('dark');
    }
    await nextTick();
    expect(settingsState.themeMode).toBe('dark');

    resolveLoad();
    await loadPromise;
    await nextTick();

    expect(settingsState.themeMode).toBe('dark');
  });

  // 测试用例：验证「cleans up the theme listener even when the listen promise resolves after unmount」场景，锁定 App 的用户可见行为。
  it('cleans up the theme listener even when the listen promise resolves after unmount', async () => {
    let settleUnlisten!: (cleanup: () => void) => void;
    // 局部常量 cleanup：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const cleanup = vi.fn();
    // 局部常量 listenPromise：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const listenPromise = new Promise<() => void>(resolve => {
      settleUnlisten = resolve;
    });

    listenThemeModeChangedMock.mockImplementation(() => listenPromise);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(App);
    wrapper.unmount();

    settleUnlisten(cleanup);
    await listenPromise;
    await nextTick();

    expect(cleanup).toHaveBeenCalledOnce();
  });
});
