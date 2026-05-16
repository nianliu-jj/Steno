// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive, type PropType } from 'vue';

import { THEME_MODE_CHANGED_EVENT, sharedThemeTokens } from '@/theme';

const appMocks = vi.hoisted(() => ({
  preferredDarkRef: null as { value: boolean } | null,
  tauriListen: vi.fn(),
  tauriEmit: vi.fn(),
  themeModeChangedHandler: null as ((event: { payload: { mode: 'light' | 'dark' | 'system' } }) => void) | null,
}));

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

vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue');
  appMocks.preferredDarkRef = ref(false);

  return {
    usePreferredDark: () => appMocks.preferredDarkRef,
  };
});

vi.mock('@tauri-apps/api/event', () => ({
  emit: (...args: Parameters<typeof appMocks.tauriEmit>) => appMocks.tauriEmit(...args),
  listen: (...args: Parameters<typeof appMocks.tauriListen>) => appMocks.tauriListen(...args),
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

function expectDocumentTheme(variant: 'light' | 'dark') {
  expect(document.documentElement.style.getPropertyValue('--app-bg')).toBe(
    sharedThemeTokens[variant].appBg,
  );
  expect(document.documentElement.style.getPropertyValue('--app-accent')).toBe(
    sharedThemeTokens[variant].appAccent,
  );
  expect(document.documentElement.classList.contains('dark')).toBe(variant === 'dark');
}

describe('App', () => {
  beforeEach(() => {
    uiState.mode = 'main';
    uiState.noteId = null;
    uiState.settingsOpen = false;
    uiState.closeSettings.mockClear();
    settingsState.themeMode = 'system';
    loadSettings.mockClear();
    appMocks.preferredDarkRef!.value = false;
    appMocks.themeModeChangedHandler = null;
    appMocks.tauriEmit.mockReset();
    appMocks.tauriListen.mockReset();
    appMocks.tauriListen.mockImplementation((eventName, handler) => {
      if (eventName === THEME_MODE_CHANGED_EVENT) {
        appMocks.themeModeChangedHandler = handler;
      }
      return Promise.resolve(vi.fn());
    });

    document.documentElement.classList.remove('dark');
    document.documentElement.style.removeProperty('--app-bg');
    document.documentElement.style.removeProperty('--app-accent');
  });

  it('renders a root app shell with shared theme css variables', () => {
    const wrapper = mount(App);

    const appShell = wrapper.get('[data-testid="app-shell"]');
    const style = appShell.attributes('style');

    expect(style).toContain('--app-bg:');
    expect(style).toContain('--app-accent:');
    expectDocumentTheme('light');

    wrapper.unmount();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--app-bg')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--app-accent')).toBe('');
  });

  it('restores system theme following after a forced mode is cleared by the theme change event', async () => {
    appMocks.preferredDarkRef!.value = true;
    const wrapper = mount(App);

    expect(appMocks.tauriListen).toHaveBeenCalledWith(THEME_MODE_CHANGED_EVENT, expect.any(Function));
    expect(wrapper.get('[data-testid="app-shell"]').classes()).toContain('dark');
    expect(wrapper.get('[data-testid="app-shell"]').attributes('style')).toContain(sharedThemeTokens.dark.appBg);
    expectDocumentTheme('dark');

    appMocks.themeModeChangedHandler?.({ payload: { mode: 'light' } });
    await nextTick();

    expect(settingsState.themeMode).toBe('light');
    expect(wrapper.get('[data-testid="app-shell"]').classes()).not.toContain('dark');
    expect(wrapper.get('[data-testid="app-shell"]').attributes('style')).toContain(sharedThemeTokens.light.appBg);
    expectDocumentTheme('light');

    appMocks.themeModeChangedHandler?.({ payload: { mode: 'system' } });
    await nextTick();

    expect(settingsState.themeMode).toBe('system');
    expect(wrapper.get('[data-testid="app-shell"]').classes()).toContain('dark');
    expect(wrapper.get('[data-testid="app-shell"]').attributes('style')).toContain(sharedThemeTokens.dark.appBg);
    expectDocumentTheme('dark');

    appMocks.preferredDarkRef!.value = false;
    await nextTick();

    expect(wrapper.get('[data-testid="app-shell"]').classes()).not.toContain('dark');
    expect(wrapper.get('[data-testid="app-shell"]').attributes('style')).toContain(sharedThemeTokens.light.appBg);
    expectDocumentTheme('light');

    wrapper.unmount();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--app-bg')).toBe('');
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
});
