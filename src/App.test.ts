// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive, ref, type PropType } from 'vue';

import { THEME_MODE_CHANGED_EVENT } from '@/theme';
import MainWorkbenchShellSource from '@/components/MainWorkbenchShell.vue?raw';

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
const darkModeRef = ref(false);
const tauriListen = vi.fn();
let themeModeChangedHandler: ((event: { payload: { mode: 'light' | 'dark' | 'system' } }) => void) | null =
  null;

vi.mock('@vueuse/core', () => ({
  useDark: () => darkModeRef,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: Parameters<typeof tauriListen>) => tauriListen(...args),
}));

vi.mock('naive-ui', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    darkTheme: {},
    NConfigProvider: defineComponent({
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
      },
      emits: ['update:show'],
      setup(props, { slots }) {
        return () =>
          props.show
            ? h('div', { 'data-testid': 'settings-modal' }, slots.default?.())
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

vi.mock('@/views/SearchView.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup: () => () => h('div', { 'data-testid': 'search-view' }),
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
    darkModeRef.value = false;
    themeModeChangedHandler = null;
    tauriListen.mockReset();
    tauriListen.mockImplementation((eventName, handler) => {
      if (eventName === THEME_MODE_CHANGED_EVENT) {
        themeModeChangedHandler = handler;
      }
      return Promise.resolve(vi.fn());
    });
  });

  it('renders a root app shell with shared theme css variables', () => {
    const wrapper = mount(App);

    const appShell = wrapper.get('[data-testid="app-shell"]');
    const style = appShell.attributes('style');

    expect(style).toContain('--app-bg:');
    expect(style).toContain('--app-accent:');
  });

  it('syncs theme mode and dark class when the theme change event is received', async () => {
    const wrapper = mount(App);

    expect(tauriListen).toHaveBeenCalledWith(THEME_MODE_CHANGED_EVENT, expect.any(Function));

    themeModeChangedHandler?.({ payload: { mode: 'dark' } });
    await nextTick();

    expect(settingsState.themeMode).toBe('dark');
    expect(wrapper.get('[data-testid="app-shell"]').classes()).toContain('dark');
  });

  it('keeps the current workbench page in the background and opens settings as an embedded modal', async () => {
    uiState.mode = 'main';
    uiState.settingsOpen = true;

    const wrapper = mount(App);

    expect(wrapper.find('[data-testid="shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="main-actions"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="shell-nav-labels"]').text()).toBe('笔记列表|画布|粘贴板|待办|截图|OCR|翻译');
    expect(wrapper.get('[data-testid="shell-nav-labels"]').text()).not.toContain('搜索');
    expect(wrapper.findAll('[data-testid="main-view"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="settings-modal"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-view-embedded"]').exists()).toBe(true);

    await wrapper.get('[data-testid="settings-view-embedded"] button').trigger('click');
    expect(uiState.closeSettings).toHaveBeenCalledOnce();
  });

  it('renders the standalone settings page when the window itself is in settings mode', () => {
    uiState.mode = 'settings';
    uiState.settingsOpen = false;

    const wrapper = mount(App);

    expect(wrapper.find('[data-testid="shell"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-modal"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-view"]').exists()).toBe(true);
  });

  it('uses shared app theme variables in the workbench shell styles', () => {
    expect(MainWorkbenchShellSource).toContain('var(--app-accent)');
    expect(MainWorkbenchShellSource).not.toContain('var(--accent)');
  });
});
