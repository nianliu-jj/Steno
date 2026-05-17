// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref, type PropType } from 'vue';

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
const darkRef = ref(false);
const themeModeListeners: Array<(mode: 'light' | 'dark' | 'system') => void> = [];

vi.mock('@vueuse/core', () => ({
  useDark: () => darkRef,
}));

vi.mock('@/composables/useAppEvents', () => ({
  listenThemeModeChanged: vi.fn(async (handler: (mode: 'light' | 'dark' | 'system') => void) => {
    themeModeListeners.push(handler);
    return () => {
      const index = themeModeListeners.indexOf(handler);
      if (index >= 0) {
        themeModeListeners.splice(index, 1);
      }
    };
  }),
  emitThemeModeChanged: vi.fn(() => Promise.resolve()),
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
    darkRef.value = false;
    themeModeListeners.splice(0, themeModeListeners.length);
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

  it('updates dark mode when a theme event is received from another window', async () => {
    mount(App);

    expect(darkRef.value).toBe(false);

    themeModeListeners[0]?.('dark');
    await Promise.resolve();

    expect(darkRef.value).toBe(true);
  });
});
