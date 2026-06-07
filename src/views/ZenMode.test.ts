// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import ZenMode from './ZenMode.vue';
import ZenModeSource from './ZenMode.vue?raw';

const exitZen = vi.fn();
const navigateToMain = vi.fn();
const getNote = vi.fn(() => Promise.resolve(null));
const saveDraft = vi.fn(() => Promise.resolve(null));
const getEditorEntry = vi.fn(() => Promise.resolve(null));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getEditorEntry,
    getNote,
    exportNoteMarkdown: vi.fn(),
    exportNotePdf: vi.fn(),
  }),
}));

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    saveDraft,
  }),
}));

vi.mock('@/stores/library', () => ({
  useLibraryStore: () => ({
    context: {
      workspaceId: null,
      folderEntryId: null,
      groupEntryId: null,
      selectedEntryId: null,
    },
  }),
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    noteId: 'note-1',
    exitZen,
    navigateToMain,
  }),
}));

vi.mock('@/composables/useMarkdown', () => ({
  useMarkdown: () => ({
    countWords: (content: string) => content.length,
  }),
}));

vi.mock('@/components/MarkdownEditor.vue', () => ({
  default: defineComponent({
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup(props: { modelValue?: string }, { expose }) {
      expose({ focus: vi.fn(), scrollToLine: vi.fn() });
      return () => h('textarea', { value: props.modelValue });
    },
  }),
}));

vi.mock('@/components/writing/WritingSurface.vue', () => ({
  default: {
    props: ['mode', 'headings', 'outlineOpen', 'outlineWidth'],
    emits: ['open-source', 'close-source', 'toggle-readonly', 'toggle-outline'],
    template: '<div data-testid="zen-writing-surface">{{ mode }}</div>',
  },
}));

vi.mock('@/composables/useOutlineSidebarState', () => ({
  useOutlineSidebarState: () => ({
    open: { value: true },
    width: { value: 300 },
    toggle: vi.fn(),
    setWidth: vi.fn(),
  }),
}));

vi.mock('@/components/DocumentOutlineTree.vue', () => ({
  default: {
    props: ['nodes'],
    emits: ['select'],
    template: `
      <aside data-testid="zen-outline">
        <button
          v-for="node in nodes"
          :key="node.id"
          :data-testid="'zen-outline-node-' + node.id"
          @click="$emit('select', node)"
        >
          {{ node.text }}
        </button>
      </aside>
    `,
  },
}));

const WrappedZenMode = defineComponent({
  setup() {
    return () =>
      h(NConfigProvider, null, {
        default: () =>
          h(NMessageProvider, null, {
            default: () => h(ZenMode),
          }),
      });
  },
});

describe('ZenMode', () => {
  it.skip('renders the shared writing surface with the Zen outline sidebar enabled', async () => {
    const wrapper = mount(WrappedZenMode);
    await flushPromises();

    expect(wrapper.get('[data-testid="zen-writing-surface"]').text()).toBe('rich-edit');
    expect(ZenModeSource).toContain('data-testid="zen-outline-shell"');
  });

  it('echoes the current note content into the editor when entered with a note id', async () => {
    getNote.mockResolvedValueOnce({
      id: 'note-1',
      title: 'Zen 标题',
      content: '# 回显内容\n正文',
      tags: [],
      isPinned: false,
      pinnedWindowConfig: null,
      canvasPosition: null,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      wordCount: 4,
      isDraft: false,
    } as never);

    const wrapper = mount(WrappedZenMode);
    await flushPromises();

    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toContain('回显内容');
  });

  it('delegates exit routing to the ui store', async () => {
    const wrapper = mount(WrappedZenMode);
    await flushPromises();

    await wrapper.find('.zen-exit').trigger('click');

    expect(exitZen).toHaveBeenCalledOnce();
    expect(navigateToMain).not.toHaveBeenCalled();
  });

  it('renders the outline sidebar after toggling the FAB', async () => {
    const wrapper = mount(WrappedZenMode);
    await flushPromises();

    expect(wrapper.find('[data-testid="zen-outline"]').exists()).toBe(false);

    await wrapper.find('[data-testid="zen-outline-toggle"]').trigger('click');

    expect(wrapper.find('[data-testid="zen-outline-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="zen-outline"]').exists()).toBe(true);
  });
});
