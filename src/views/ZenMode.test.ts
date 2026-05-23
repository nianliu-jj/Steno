// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import ZenMode from './ZenMode.vue';

const exitZen = vi.fn();
const navigateToMain = vi.fn();
const getNote = vi.fn(() => Promise.resolve(null));
const saveDraft = vi.fn(() => Promise.resolve(null));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
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
  default: { template: '<textarea />' },
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
