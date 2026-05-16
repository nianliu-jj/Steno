// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';

import StickyNote from './StickyNote.vue';
import type { Note, SaveNoteRequest } from '@/types/steno';

const getNote = vi.fn<() => Promise<Note | null>>();
const saveDraft = vi.fn<(payload: SaveNoteRequest) => Promise<Note | null>>(payload =>
  Promise.resolve(createNote({
    title: payload.title ?? '置顶便签',
    content: payload.content,
    tags: payload.tags,
    pinnedWindowConfig: payload.pinnedWindowConfig ?? createNote().pinnedWindowConfig,
  })),
);
const updatePinnedConfig = vi.fn(() => Promise.resolve());
const unpinNote = vi.fn(() => Promise.resolve());
const startDragCurrent = vi.fn(() => Promise.resolve());
const setCurrentSize = vi.fn(() => Promise.resolve());
const setCurrentPosition = vi.fn(() => Promise.resolve());
const closeStickyNote = vi.fn(() => Promise.resolve());
const closeCurrent = vi.fn(() => Promise.resolve());
const hideCurrent = vi.fn(() => Promise.resolve());

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
    countWords: (value: string) => value.replace(/\n/g, '').length,
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

  it('标题编辑态按 Enter 会提交保存', async () => {
    const wrapper = await mountStickyNote();

    await wrapper.find('[data-testid="title-edit-button"]').trigger('click');
    await wrapper.find('[data-testid="title-input"]').setValue('回车保存');
    await wrapper.find('[data-testid="title-input"]').trigger('keydown', {
      key: 'Enter',
      code: 'Enter',
    });
    await flushPromises();

    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: 'sticky-note-1',
      title: '回车保存',
    }));
    expect(wrapper.find('[data-testid="title-text"]').text()).toBe('回车保存');
  });

  it('标题编辑态按 Esc 会取消修改并恢复原标题', async () => {
    const wrapper = await mountStickyNote();

    await wrapper.find('[data-testid="title-edit-button"]').trigger('click');
    await wrapper.find('[data-testid="title-input"]').setValue('Esc 取消');
    await wrapper.find('[data-testid="title-input"]').trigger('keydown', {
      key: 'Escape',
      code: 'Escape',
    });
    await flushPromises();

    expect(saveDraft).not.toHaveBeenCalledWith(expect.objectContaining({
      title: 'Esc 取消',
    }));
    expect(wrapper.find('[data-testid="title-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="title-text"]').text()).toBe('置顶便签');
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

  it('标题未修改时点击保存也会先 flush 正文 autosave', async () => {
    vi.useFakeTimers();
    getNote.mockResolvedValue(createNote({ content: '旧正文' }));

    const wrapper = await mountStickyNote();

    await wrapper.find('.sticky-content').trigger('dblclick');
    await wrapper.find('.md-editor__textarea').setValue('旧正文\n新增一行');

    await wrapper.find('[data-testid="title-edit-button"]').trigger('click');
    await wrapper.find('[data-testid="title-save-button"]').trigger('click');
    await flushPromises();

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft.mock.calls[0]?.[0]).toMatchObject({
      id: 'sticky-note-1',
      title: '置顶便签',
      content: '旧正文\n新增一行',
    });
    expect(wrapper.find('[data-testid="title-input"]').exists()).toBe(false);
  });

  it('正文 autosave 已在保存中时，标题保存会排队等待前一个保存完成', async () => {
    vi.useFakeTimers();
    const firstSave = createDeferred<Note | null>();
    saveDraft
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementation(() => Promise.resolve(null));

    const wrapper = await mountStickyNote();

    await wrapper.find('.sticky-content').trigger('dblclick');
    await wrapper.find('.md-editor__textarea').setValue('第一行\n第二行');
    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(saveDraft).toHaveBeenCalledTimes(1);

    await wrapper.find('[data-testid="title-edit-button"]').trigger('click');
    await wrapper.find('[data-testid="title-input"]').setValue('排队标题');
    const saveClick = wrapper.find('[data-testid="title-save-button"]').trigger('click');
    await flushPromises();

    expect(saveDraft).toHaveBeenCalledTimes(1);

    firstSave.resolve(null);
    await saveClick;
    await flushPromises();

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft.mock.calls[1]?.[0]).toMatchObject({
      id: 'sticky-note-1',
      title: '排队标题',
      content: '第一行\n第二行',
    });
  });

  it('标题保存进行中时，后续正文 autosave 仍会携带新标题，避免标题回退', async () => {
    vi.useFakeTimers();
    const titleSave = createDeferred<Note | null>();
    saveDraft
      .mockImplementationOnce(() => titleSave.promise)
      .mockImplementation(() => Promise.resolve(null));

    const wrapper = await mountStickyNote();

    await wrapper.find('[data-testid="title-edit-button"]').trigger('click');
    await wrapper.find('[data-testid="title-input"]').setValue('不会回退的标题');
    const saveClick = wrapper.find('[data-testid="title-save-button"]').trigger('click');
    await flushPromises();

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft.mock.calls[0]?.[0]).toMatchObject({
      id: 'sticky-note-1',
      title: '不会回退的标题',
      content: '第一行',
    });

    await wrapper.find('.sticky-content').trigger('dblclick');
    await wrapper.find('.md-editor__textarea').setValue('第一行\n后续正文');
    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(saveDraft).toHaveBeenCalledTimes(1);

    titleSave.resolve(null);
    await saveClick;
    await flushPromises();

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft.mock.calls[1]?.[0]).toMatchObject({
      id: 'sticky-note-1',
      title: '不会回退的标题',
      content: '第一行\n后续正文',
    });
  });

  it('标题保存等待 flush 期间再次编辑正文，后续 autosave 也会携带新标题', async () => {
    vi.useFakeTimers();
    const firstSave = createDeferred<Note | null>();
    saveDraft
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementation(() => Promise.resolve(null));

    const wrapper = await mountStickyNote();

    await wrapper.find('.sticky-content').trigger('dblclick');
    await wrapper.find('.md-editor__textarea').setValue('第一行\n旧待保存');

    await wrapper.find('[data-testid="title-edit-button"]').trigger('click');
    await wrapper.find('[data-testid="title-input"]').setValue('flush 前锁定标题');
    const saveClick = wrapper.find('[data-testid="title-save-button"]').trigger('click');
    await flushPromises();

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft.mock.calls[0]?.[0]).toMatchObject({
      id: 'sticky-note-1',
      title: '置顶便签',
      content: '第一行\n旧待保存',
    });

    await wrapper.find('.md-editor__textarea').setValue('第一行\n旧待保存\n继续写');
    vi.advanceTimersByTime(1000);
    await flushPromises();

    firstSave.resolve(null);
    await saveClick;
    await flushPromises();

    expect(saveDraft).toHaveBeenCalledTimes(3);
    expect(saveDraft.mock.calls[1]?.[0]).toMatchObject({
      id: 'sticky-note-1',
      title: 'flush 前锁定标题',
      content: '第一行\n旧待保存\n继续写',
    });
    expect(saveDraft.mock.calls[2]?.[0]).toMatchObject({
      id: 'sticky-note-1',
      title: 'flush 前锁定标题',
      content: '第一行\n旧待保存\n继续写',
    });
  });

  it('标题保存失败后，如果排队中的正文 autosave 成功落库新标题，会同步修正本地标题状态', async () => {
    vi.useFakeTimers();
    const titleSave = createDeferred<Note | null>();
    saveDraft
      .mockImplementationOnce(() => titleSave.promise)
      .mockImplementation(payload =>
        Promise.resolve(createNote({
          title: payload.title ?? '置顶便签',
          content: payload.content,
          tags: payload.tags,
          pinnedWindowConfig: payload.pinnedWindowConfig ?? createNote().pinnedWindowConfig,
        })),
      );

    const wrapper = await mountStickyNote();

    await wrapper.find('[data-testid="title-edit-button"]').trigger('click');
    await wrapper.find('[data-testid="title-input"]').setValue('失败后由正文追平');
    const saveClick = wrapper.find('[data-testid="title-save-button"]').trigger('click');
    await flushPromises();

    await wrapper.find('.sticky-content').trigger('dblclick');
    await wrapper.find('.md-editor__textarea').setValue('第一行\n正文追平标题');
    await wrapper.find('[data-testid="title-input"]').trigger('blur');
    vi.advanceTimersByTime(1000);
    await flushPromises();

    titleSave.reject(new Error('title save failed'));
    await saveClick;
    await flushPromises();

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft.mock.calls[1]?.[0]).toMatchObject({
      id: 'sticky-note-1',
      title: '失败后由正文追平',
      content: '第一行\n正文追平标题',
    });

    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(wrapper.find('[data-testid="title-text"]').text()).toBe('失败后由正文追平');
    expect(wrapper.find('[data-testid="footer-meta"]').text()).toContain('已保存');
  });

  it('如果等待 flush 期间排队的正文 autosave 先成功，后续标题保存失败不会把状态打回 error', async () => {
    vi.useFakeTimers();
    const firstSave = createDeferred<Note | null>();
    saveDraft
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(payload =>
        Promise.resolve(createNote({
          title: payload.title ?? '置顶便签',
          content: payload.content,
          tags: payload.tags,
          pinnedWindowConfig: payload.pinnedWindowConfig ?? createNote().pinnedWindowConfig,
        })),
      )
      .mockImplementationOnce(() => Promise.reject(new Error('late title failure')));

    const wrapper = await mountStickyNote();

    await wrapper.find('.sticky-content').trigger('dblclick');
    await wrapper.find('.md-editor__textarea').setValue('第一行\n旧待保存');

    await wrapper.find('[data-testid="title-edit-button"]').trigger('click');
    await wrapper.find('[data-testid="title-input"]').setValue('失败不能覆盖已保存');
    const saveClick = wrapper.find('[data-testid="title-save-button"]').trigger('click');
    await flushPromises();

    await wrapper.find('.md-editor__textarea').setValue('第一行\n旧待保存\n继续写');
    await wrapper.find('[data-testid="title-input"]').trigger('blur');
    vi.advanceTimersByTime(1000);
    await flushPromises();

    firstSave.resolve(createNote({
      title: '置顶便签',
      content: '第一行\n旧待保存',
    }));
    await saveClick;
    await flushPromises();

    expect(saveDraft).toHaveBeenCalledTimes(3);
    expect(saveDraft.mock.calls[1]?.[0]).toMatchObject({
      id: 'sticky-note-1',
      title: '失败不能覆盖已保存',
      content: '第一行\n旧待保存\n继续写',
    });
    expect(saveDraft.mock.calls[2]?.[0]).toMatchObject({
      id: 'sticky-note-1',
      title: '失败不能覆盖已保存',
      content: '第一行\n旧待保存\n继续写',
    });
    expect(wrapper.find('[data-testid="title-text"]').text()).toBe('失败不能覆盖已保存');
    expect(wrapper.find('[data-testid="footer-meta"]').text()).toContain('已保存');
    expect(wrapper.find('[data-testid="footer-meta"]').text()).not.toContain('保存失败');
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

  it('footer 在只读态和正文编辑态都仅保留字号控制与统计信息', async () => {
    const wrapper = await mountStickyNote();

    const assertFooter = () => {
      const footer = wrapper.find('.sticky-footer');
      const buttons = footer.findAll('button');

      expect(buttons).toHaveLength(1);
      expect(buttons[0]?.classes()).toContain('sticky-styler-btn');
      expect(footer.find('[data-testid="footer-meta"]').exists()).toBe(true);
      expect(footer.text()).not.toContain('完成');
      expect(footer.find('.sticky-done-btn').exists()).toBe(false);
    };

    assertFooter();

    await wrapper.find('.sticky-content').trigger('dblclick');
    await flushPromises();

    assertFooter();
  });

  it('消费共享主题变量，而不是 color 或 opacity 配置驱动视觉', () => {
    const source = readFileSync('src/components/StickyNote.vue', 'utf8');

    expect(source).toContain('var(--app-surface)');
    expect(source).toContain('var(--app-text)');
    expect(source).toContain('var(--app-border)');
    expect(source).toContain('var(--app-text-muted)');
    expect(source).not.toContain("'--sticky-bg': config.value.color");
    expect(source).not.toContain("'--sticky-opacity': String(config.value.opacity)");
  });
});
