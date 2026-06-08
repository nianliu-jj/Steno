/**
 * @file 前端视图 - Zen Mode
 *
 * 覆盖 Zen Mode 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import ZenMode from './ZenMode.vue';
import ZenModeSource from './ZenMode.vue?raw';

// 局部常量 exitZen：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const exitZen = vi.fn();
// 局部常量 navigateToMain：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const navigateToMain = vi.fn();
// 局部常量 getNote：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const getNote = vi.fn(() => Promise.resolve(null));
// 局部常量 saveDraft：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const saveDraft = vi.fn(() => Promise.resolve(null));
// 局部常量 getEditorEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const getEditorEntry = vi.fn(() => Promise.resolve(null));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getEditorEntry,
    getNote,
    exportNoteMarkdown: vi.fn(),
    exportNotePdf: vi.fn()
  })
}));

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    saveDraft
  })
}));

vi.mock('@/stores/library', () => ({
  useLibraryStore: () => ({
    context: {
      workspaceId: null,
      folderEntryId: null,
      groupEntryId: null,
      selectedEntryId: null
    }
  })
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    noteId: 'note-1',
    exitZen,
    navigateToMain
  })
}));

vi.mock('@/composables/useMarkdown', () => ({
  useMarkdown: () => ({
    countWords: (content: string) => content.length
  })
}));

vi.mock('@/components/MarkdownEditor.vue', () => ({
  default: defineComponent({
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup(props: { modelValue?: string }, { expose }) {
      expose({ focus: vi.fn(), scrollToLine: vi.fn() });
      return () => h('textarea', { value: props.modelValue });
    }
  })
}));

vi.mock('@/components/writing/WritingSurface.vue', () => ({
  default: {
    props: ['mode', 'headings', 'outlineOpen', 'outlineWidth'],
    emits: ['open-source', 'close-source', 'toggle-readonly', 'toggle-outline'],
    template: '<div data-testid="zen-writing-surface">{{ mode }}</div>'
  }
}));

vi.mock('@/composables/useOutlineSidebarState', () => ({
  useOutlineSidebarState: () => ({
    open: { value: true },
    width: { value: 300 },
    toggle: vi.fn(),
    setWidth: vi.fn()
  })
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
    `
  }
}));

// 组件定义 WrappedZenMode：集中声明渲染入口、props 和事件响应。
const WrappedZenMode = defineComponent({
  setup() {
    return () =>
      h(NConfigProvider, null, {
        default: () =>
          h(NMessageProvider, null, {
            default: () => h(ZenMode)
          })
      });
  }
});

// 测试用例：验证「ZenMode」场景，锁定 Zen Mode 的用户可见行为。
describe('ZenMode', () => {
  it.skip('renders the shared writing surface with the Zen outline sidebar enabled', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedZenMode);
    await flushPromises();

    expect(wrapper.get('[data-testid="zen-writing-surface"]').text()).toBe('rich-edit');
    expect(ZenModeSource).toContain('data-testid="zen-outline-shell"');
  });

  // 测试用例：验证「echoes the current note content into the editor when entered with a note id」场景，锁定 Zen Mode 的用户可见行为。
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
      isDraft: false
    } as never);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedZenMode);
    await flushPromises();

    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toContain('回显内容');
  });

  // 测试用例：验证「delegates exit routing to the ui store」场景，锁定 Zen Mode 的用户可见行为。
  it('delegates exit routing to the ui store', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedZenMode);
    await flushPromises();

    await wrapper.find('.zen-exit').trigger('click');

    expect(exitZen).toHaveBeenCalledOnce();
    expect(navigateToMain).not.toHaveBeenCalled();
  });

  // 测试用例：验证「renders the outline sidebar after toggling the FAB」场景，锁定 Zen Mode 的用户可见行为。
  it('renders the outline sidebar after toggling the FAB', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedZenMode);
    await flushPromises();

    expect(wrapper.find('[data-testid="zen-outline"]').exists()).toBe(false);

    await wrapper.find('[data-testid="zen-outline-toggle"]').trigger('click');

    expect(wrapper.find('[data-testid="zen-outline-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="zen-outline"]').exists()).toBe(true);
  });
});
