// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';

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

vi.mock('@vueuse/core', () => ({
  useDark: () => ({ value: false }),
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
        title: {
          type: String,
          required: true,
        },
        description: {
          type: String,
          required: true,
        },
      },
      setup(props, { slots }) {
        return () =>
          h('div', { 'data-testid': 'shell', 'data-title': props.title }, [
            h('div', { 'data-testid': 'shell-actions' }, slots.actions?.()),
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
      props: {
        compactActions: {
          type: Boolean,
          default: false,
        },
      },
      setup(props) {
        return () =>
          h(
            'div',
            {
              'data-testid': props.compactActions ? 'main-actions' : 'main-view',
            },
            props.compactActions ? 'main-actions' : 'main-view',
          );
      },
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
  });

  it('keeps the current workbench page in the background and opens settings as an embedded modal', async () => {
    uiState.mode = 'main';
    uiState.settingsOpen = true;

    const wrapper = mount(App);

    expect(wrapper.find('[data-testid="shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="main-actions"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="main-view"]').exists()).toBe(true);
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
