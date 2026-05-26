// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Teleport, nextTick, reactive, ref, type PropType } from 'vue';

type ShellNavItem = {
  label: string;
};

const uiState = reactive({
  mode: 'main',
  noteId: null as string | null,
  settingsOpen: false,
  closeSettings: vi.fn(),
});

const settingsState = reactive({
  themeMode: 'system',
});

const loadSettings = vi.fn(() => Promise.resolve());
const darkState = ref(false);
const themeModeListeners = new Set<(value: 'light' | 'dark' | 'system') => void>();
const listenThemeModeChangedMock = vi.fn(
  async (handler: (value: 'light' | 'dark' | 'system') => void) => {
    themeModeListeners.add(handler);
    return () => {
      themeModeListeners.delete(handler);
    };
  },
);

vi.mock('@vueuse/core', () => ({
  useDark: () => darkState,
}));

vi.mock('@/composables/useAppEvents', () => ({
  useAppEvents: () => ({
    emitThemeModeChanged: vi.fn(),
    emitNoteSaved: vi.fn(),
    listenThemeModeChanged: listenThemeModeChangedMock,
    listenNoteSaved: vi.fn(async () => () => {}),
  }),
}));

vi.mock('naive-ui', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    darkTheme: {},
    NConfigProvider: defineComponent({
      props: {
        theme: {
          type: Object,
          default: null,
        },
      },
      setup(_, { slots }) {
        return () => slots.default?.();
      },
    }),
    NMessageProvider: defineComponent({
      setup(_, { slots }) {
        return () => slots.default?.();
      },
    }),
    NModal: defineComponent({
      props: {
        show: {
          type: Boolean,
          default: false,
        },
        preset: {
          type: String,
          default: undefined,
        },
        maskClosable: {
          type: Boolean,
          default: true,
        },
        autoFocus: {
          type: Boolean,
          default: true,
        },
        to: {
          type: String,
          default: 'body',
        },
      },
      emits: ['update:show'],
      setup(props, { slots }) {
        return () =>
          props.show
            ? h(
                Teleport,
                {
                  to: props.to,
                  defer: true,
                },
                [
                h(
                  'div',
                  {
                    'data-testid': 'settings-modal',
                    'data-teleport-to': props.to,
                  },
                  slots.default?.(),
                ),
                ],
              )
            : null;
      },
    }),
  };
});

vi.mock('@/stores/ui', () => ({
  useUiStore: () => uiState,
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    state: settingsState,
    load: loadSettings,
  }),
}));

vi.mock('@/stores/todos', () => ({
  useTodosStore: () => ({
    startEventListeners: vi.fn(async () => {}),
    stopEventListeners: vi.fn(() => {}),
  }),
}));

vi.mock('@/components/MainWorkbenchShell.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      props: {
        navItems: {
          type: Array as PropType<ShellNavItem[]>,
          required: true,
        },
      },
      setup(props, { slots }) {
        return () =>
          h('div', { 'data-testid': 'shell' }, [
            h('div', { 'data-testid': 'shell-nav-count' }, String(props.navItems.length)),
            h(
              'div',
              { 'data-testid': 'shell-nav-labels' },
              props.navItems.map(item => item.label).join('|'),
            ),
            h('div', { 'data-testid': 'shell-default' }, slots.default?.()),
          ]);
      },
    }),
  };
});

vi.mock('@/views/MainView.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'main-view' }, 'main-view'),
    }),
  };
});

vi.mock('@/views/SettingsView.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      props: {
        embedded: {
          type: Boolean,
          default: false,
        },
      },
      emits: ['close'],
      setup(props, { emit }) {
        return () =>
          h('div', { 'data-testid': props.embedded ? 'settings-view-embedded' : 'settings-view' }, [
            h('span', props.embedded ? 'embedded-settings' : 'settings'),
            h('button', { onClick: () => emit('close') }, 'close-settings'),
          ]);
      },
    }),
  };
});

vi.mock('@/views/NoteEditorView.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'note-editor-view' }),
    }),
  };
});

vi.mock('@/views/CanvasView.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'canvas-view' }),
    }),
  };
});

vi.mock('@/views/ClipboardView.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'clipboard-view' }, 'clipboard-view'),
    }),
  };
});

vi.mock('@/views/PlaceholderView.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'placeholder-view' }),
    }),
  };
});

vi.mock('@/components/FloatingEditor.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'floating-view' }),
    }),
  };
});

vi.mock('@/components/StickyNote.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'sticky-view' }),
    }),
  };
});

vi.mock('@/views/ZenMode.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'zen-view' }),
    }),
  };
});

import App from './App.vue';

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

  it('keeps the current workbench page in the background and opens settings as an embedded modal', async () => {
    uiState.mode = 'main';
    uiState.settingsOpen = true;

    const wrapper = mount(App, {
      attachTo: document.body,
    });

    expect(wrapper.find('[data-testid="shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="main-actions"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="shell-nav-labels"]').text()).toBe('笔记列表|画布|粘贴板|待办|截图|OCR|翻译');
    expect(wrapper.get('[data-testid="shell-nav-labels"]').text()).not.toContain('搜索');
    expect(wrapper.findAll('[data-testid="main-view"]')).toHaveLength(1);
    expect(document.body.querySelector('[data-testid="settings-modal"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="settings-view-embedded"]')).not.toBeNull();

    const closeButton = document.body.querySelector(
      '[data-testid="settings-view-embedded"] button',
    ) as HTMLButtonElement | null;
    closeButton?.click();
    await nextTick();
    expect(uiState.closeSettings).toHaveBeenCalledOnce();

    uiState.settingsOpen = false;
    await nextTick();
    wrapper.unmount();
  });

  it('renders the standalone settings page when the window itself is in settings mode', () => {
    uiState.mode = 'settings';
    uiState.settingsOpen = false;

    const wrapper = mount(App);

    expect(wrapper.find('[data-testid="shell"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-modal"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-view"]').exists()).toBe(true);
  });

  it('renders the clipboard view for clipboard mode instead of the placeholder', () => {
    uiState.mode = 'clipboard';

    const wrapper = mount(App);

    expect(wrapper.find('[data-testid="shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="clipboard-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="placeholder-view"]').exists()).toBe(false);
  });

  it('teleports the embedded settings modal into the themed app root instead of body', async () => {
    uiState.mode = 'main';
    uiState.settingsOpen = true;

    const wrapper = mount(App, {
      attachTo: document.body,
    });

    const appThemeRoot = document.body.querySelector('.app-theme-root');
    const modal = document.body.querySelector('[data-testid="settings-modal"]');

    expect(modal).not.toBeNull();
    expect(modal?.getAttribute('data-teleport-to')).toBe('.app-theme-root');
    expect(appThemeRoot?.contains(modal)).toBe(true);
    expect(Array.from(document.body.children)).not.toContain(modal);

    uiState.settingsOpen = false;
    await nextTick();
    wrapper.unmount();
  });

  it('mounts shared theme vars on the app root and updates dark mode after a theme event', async () => {
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

  it('preserves the latest theme event when settings load resolves afterward with stale data', async () => {
    let resolveLoad!: () => void;
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

  it('cleans up the theme listener even when the listen promise resolves after unmount', async () => {
    let settleUnlisten!: (cleanup: () => void) => void;
    const cleanup = vi.fn();
    const listenPromise = new Promise<() => void>(resolve => {
      settleUnlisten = resolve;
    });

    listenThemeModeChangedMock.mockImplementation(
      () => listenPromise,
    );

    const wrapper = mount(App);
    wrapper.unmount();

    settleUnlisten(cleanup);
    await listenPromise;
    await nextTick();

    expect(cleanup).toHaveBeenCalledOnce();
  });
});
