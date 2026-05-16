// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';

import StickyNote from './StickyNote.vue';
import type { Note, SaveNoteRequest } from '@/types/steno';

const getNote = vi.fn<() => Promise<Note | null>>();
const saveDraft = vi.fn<(payload: SaveNoteRequest) => Promise<void>>(() => Promise.resolve());
const updatePinnedConfig = vi.fn(() => Promise.resolve());
const unpinNote = vi.fn(() => Promise.resolve());
const startDragCurrent = vi.fn(() => Promise.resolve());
const setCurrentSize = vi.fn(() => Promise.resolve());
const setCurrentPosition = vi.fn(() => Promise.resolve());
const closeStickyNote = vi.fn(() => Promise.resolve());
const closeCurrent = vi.fn(() => Promise.resolve());
const hideCurrent = vi.fn(() => Promise.resolve());

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getNote,
  }),
}));

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    saveDraft,
    updatePinnedConfig,
    unpinNote,
  }),
}));

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    startDragCurrent,
    setCurrentSize,
    setCurrentPosition,
    closeStickyNote,
    closeCurrent,
    hideCurrent,
  }),
}));

vi.mock('@/composables/useMarkdown', () => ({
  useMarkdown: () => ({
    renderHtml: (value: string) => `<p>${value}</p>`,
  }),
}));

vi.mock('@/components/MarkdownEditor.vue', () => ({
  default: defineComponent({
    name: 'MarkdownEditorStub',
    props: {
      modelValue: {
        type: String,
        required: true,
      },
      autofocus: Boolean,
      placeholder: String,
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      const model = computed({
        get: () => props.modelValue,
        set: value => emit('update:modelValue', value),
      });

      return () =>
        h('textarea', {
          class: 'md-editor__textarea',
          value: model.value,
          placeholder: props.placeholder,
          onInput: (event: Event) => {
            model.value = (event.target as HTMLTextAreaElement).value;
          },
        });
    },
  }),
}));

const WrappedStickyNote = defineComponent({
  setup() {
    return () =>
      h(NConfigProvider, null, {
        default: () =>
          h(NMessageProvider, null, {
            default: () => h(StickyNote, { noteId: 'sticky-note-1' }),
          }),
      });
  },
});

function createNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'sticky-note-1',
    title: '置顶便签',
    content: '第一行',
    htmlContent: '<p>第一行</p>',
    tags: ['sticky'],
    isPinned: true,
    pinnedWindowConfig: {
      width: 280,
      height: 220,
      opacity: 1,
      color: '#fff7cc',
      fontSize: 14,
    },
    canvasPosition: null,
    createdAt: '2026-05-15T07:00:00.000Z',
    updatedAt: '2026-05-15T07:05:00.000Z',
    wordCount: 3,
    ...overrides,
  };
}

async function mountStickyNote() {
  const wrapper = mount(WrappedStickyNote);
  await flushPromises();
  return wrapper;
}

describe('StickyNote', () => {
  beforeEach(() => {
    vi.useRealTimers();
    getNote.mockReset();
    saveDraft.mockClear();
    updatePinnedConfig.mockClear();
    unpinNote.mockClear();
    startDragCurrent.mockClear();
    setCurrentSize.mockClear();
    setCurrentPosition.mockClear();
    closeStickyNote.mockClear();
    closeCurrent.mockClear();
    hideCurrent.mockClear();
    getNote.mockResolvedValue(createNote());
  });

  it('默认只读显示标题，点击编辑按钮才进入编辑态', async () => {
    const wrapper = await mountStickyNote();

    expect(wrapper.find('[data-testid="title-text"]').text()).toBe('置顶便签');
    expect(wrapper.find('[data-testid="title-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="title-edit-button"] svg').exists()).toBe(true);

    await wrapper.find('[data-testid="title-edit-button"]').trigger('click');

    expect(wrapper.find('[data-testid="title-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="title-save-button"] svg').exists()).toBe(true);
  });

  it('标题输入失焦或点击 header 空白会取消修改并恢复原标题，不触发标题保存', async () => {
    const wrapper = await mountStickyNote();

    await wrapper.find('[data-testid="title-edit-button"]').trigger('click');
    const input = wrapper.find('[data-testid="title-input"]');
    await input.setValue('临时标题');
    await input.trigger('blur');
    await flushPromises();

    const payloads = saveDraft.mock.calls.map(([payload]) => payload as SaveNoteRequest | undefined);

    expect(wrapper.find('[data-testid="title-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="title-text"]').text()).toBe('置顶便签');
    expect(payloads.some(payload => payload?.title === '临时标题')).toBe(false);

    await wrapper.find('[data-testid="title-edit-button"]').trigger('click');
    const secondInput = wrapper.find('[data-testid="title-input"]');
    await secondInput.setValue('点空白取消');
    wrapper.find('.sticky-header').element.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    await flushPromises();

    expect(wrapper.find('[data-testid="title-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="title-text"]').text()).toBe('置顶便签');
    const nextPayloads = saveDraft.mock.calls.map(([payload]) => payload as SaveNoteRequest | undefined);
    expect(nextPayloads.some(payload => payload?.title === '点空白取消')).toBe(false);
    expect(startDragCurrent).toHaveBeenCalledTimes(1);
  });

  it('保存标题前会先 flush 正文 autosave，再用新标题调用 saveDraft', async () => {
    vi.useFakeTimers();
    getNote.mockResolvedValue(createNote({ content: '旧正文' }));

    const wrapper = await mountStickyNote();

    await wrapper.find('.sticky-content').trigger('dblclick');
    const editor = wrapper.find('.md-editor__textarea');
    await editor.setValue('旧正文\n新增一行');

    await wrapper.find('[data-testid="title-edit-button"]').trigger('click');
    const titleInput = wrapper.find('[data-testid="title-input"]');
    await titleInput.setValue('新标题');
    await wrapper.find('[data-testid="title-save-button"]').trigger('click');
    await flushPromises();

    const firstPayload = saveDraft.mock.calls[0]?.[0] as SaveNoteRequest | undefined;
    const secondPayload = saveDraft.mock.calls[1]?.[0] as SaveNoteRequest | undefined;

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(firstPayload).toMatchObject({
      id: 'sticky-note-1',
      title: '置顶便签',
      content: '旧正文\n新增一行',
    });
    expect(secondPayload).toMatchObject({
      id: 'sticky-note-1',
      title: '新标题',
      content: '旧正文\n新增一行',
    });
  });

  it('底部右侧显示字数、行数和保存状态，空内容至少显示 1 行', async () => {
    getNote.mockResolvedValue(createNote({ content: '', htmlContent: '', wordCount: 0 }));
    const wrapper = await mountStickyNote();

    const footerMeta = wrapper.find('[data-testid="footer-meta"]').text();

    expect(footerMeta).toBe('0 字 / 1 行 / 未修改');
  });

  it('标题保存后正文再次编辑时，底部状态会重新反映 autosave 实时状态', async () => {
    vi.useFakeTimers();
    const wrapper = await mountStickyNote();

    await wrapper.find('[data-testid="title-edit-button"]').trigger('click');
    await wrapper.find('[data-testid="title-input"]').setValue('新标题');
    await wrapper.find('[data-testid="title-save-button"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="footer-meta"]').text()).toContain('已保存');

    await wrapper.find('.sticky-content').trigger('dblclick');
    await wrapper.find('.md-editor__textarea').setValue('第一行\n第二行');
    await flushPromises();

    expect(wrapper.find('[data-testid="footer-meta"]').text()).toBe('6 字 / 2 行 / 编辑中');

    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(wrapper.find('[data-testid="footer-meta"]').text()).toBe('6 字 / 2 行 / 已保存');
  });

  it('底部不再渲染颜色选择器和亮度滑块', async () => {
    const wrapper = await mountStickyNote();

    expect(wrapper.find('.sticky-color-picker').exists()).toBe(false);
    expect(wrapper.find('.sticky-opacity').exists()).toBe(false);
  });

  it('消费共享主题变量，而不是 color 或 opacity 配置驱动视觉', () => {
    const source = readFileSync('src/components/StickyNote.vue', 'utf8');

    expect(source).toContain('var(--app-surface)');
    expect(source).toContain('var(--app-fg)');
    expect(source).toContain('var(--app-border)');
    expect(source).toMatch(/var\(--app-(text-muted|muted)\)/);
    expect(source).not.toContain("'--sticky-bg': config.value.color");
    expect(source).not.toContain("'--sticky-opacity': String(config.value.opacity)");
  });
});
