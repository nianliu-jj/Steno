// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import StickyNote from './StickyNote.vue';
import StickyNoteSource from './StickyNote.vue?raw';
import type { Note, SaveNoteRequest } from '@/types/steno';

const autosaveStatus = ref<'idle' | 'scheduled' | 'saving' | 'saved' | 'error'>('idle');
const autosaveSavedAt = ref<Date | null>(null);
const scheduleAutosave = vi.fn();
const flushAutosave = vi.fn(() => Promise.resolve());
const emitNoteSaved = vi.fn();

const getNote = vi.fn<() => Promise<Note | null>>();
const saveDraft = vi.fn<(payload: SaveNoteRequest) => Promise<Note | null>>();
const updatePinnedConfig = vi.fn(() => Promise.resolve());
const unpinNote = vi.fn(() => Promise.resolve());
const startDragCurrent = vi.fn(() => Promise.resolve());
const setCurrentSize = vi.fn(() => Promise.resolve());
const setCurrentPosition = vi.fn(() => Promise.resolve());
const closeStickyNote = vi.fn(() => Promise.resolve());
const closeCurrent = vi.fn(() => Promise.resolve());
const hideCurrent = vi.fn(() => Promise.resolve());

vi.mock('@/composables/useAutosave', () => ({
  useAutosave: () => ({
    status: autosaveStatus,
    savedAt: autosaveSavedAt,
    error: { value: null },
    scheduleSave: scheduleAutosave,
    flushSave: flushAutosave,
  }),
}));

vi.mock('@/composables/useMarkdown', () => ({
  useMarkdown: () => ({
    renderHtml: (value: string) => `<p>${value}</p>`,
    countWords: () => 11,
  }),
}));

vi.mock('@/composables/useAppEvents', () => ({
  useAppEvents: () => ({
    emitNoteSaved,
    emitThemeModeChanged: vi.fn(),
    listenNoteSaved: vi.fn(),
    listenThemeModeChanged: vi.fn(),
  }),
}));

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

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'sticky-note-1',
    title: '置顶便签',
    content: '第一行\n第二行',
    htmlContent: '<p>第一行</p><p>第二行</p>',
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
    wordCount: 11,
    ...overrides,
  };
}

async function mountStickyNote() {
  const wrapper = mount(WrappedStickyNote);
  await flushPromises();
  saveDraft.mockClear();
  flushAutosave.mockClear();
  emitNoteSaved.mockClear();
  return wrapper;
}

describe('StickyNote', () => {
  beforeEach(() => {
    autosaveStatus.value = 'idle';
    autosaveSavedAt.value = null;
    scheduleAutosave.mockClear();
    flushAutosave.mockClear();
    emitNoteSaved.mockClear();
    getNote.mockReset();
    saveDraft.mockReset();
    updatePinnedConfig.mockClear();
    unpinNote.mockClear();
    startDragCurrent.mockClear();
    setCurrentSize.mockClear();
    setCurrentPosition.mockClear();
    closeStickyNote.mockClear();
    closeCurrent.mockClear();
    hideCurrent.mockClear();

    getNote.mockResolvedValue(makeNote());
    saveDraft.mockImplementation(async payload =>
      makeNote({
        title: payload.title ?? '',
        content: payload.content,
        updatedAt: '2026-05-16T10:00:00.000Z',
      }),
    );
  });

  it('默认以只读标题展示态渲染', async () => {
    const wrapper = await mountStickyNote();

    expect(wrapper.get('[data-testid="sticky-title-text"]').text()).toBe('置顶便签');
    expect(wrapper.find('[data-testid="sticky-title-input"] input').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sticky-title-edit"]').exists()).toBe(true);
  });

  it('点击标题编辑图标后进入编辑态', async () => {
    const wrapper = await mountStickyNote();

    await wrapper.get('[data-testid="sticky-title-edit"]').trigger('click');

    expect(wrapper.find('[data-testid="sticky-title-text"]').exists()).toBe(false);
    const input = wrapper.get('[data-testid="sticky-title-input"] input').element as HTMLInputElement;
    expect(input.value).toBe('置顶便签');
    expect(wrapper.find('[data-testid="sticky-title-save"]').exists()).toBe(true);
  });

  it('标题输入框 blur 时提交保存并广播 note-saved', async () => {
    const wrapper = await mountStickyNote();

    await wrapper.get('[data-testid="sticky-title-edit"]').trigger('click');
    const input = wrapper.get('[data-testid="sticky-title-input"] input');
    await input.setValue('新的置顶标题');
    await input.trigger('blur');
    await flushPromises();

    expect(flushAutosave).toHaveBeenCalledOnce();
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: 'sticky-note-1',
      title: '新的置顶标题',
      content: '第一行\n第二行',
      isPinned: true,
    }));
    expect(flushAutosave.mock.invocationCallOrder[0]).toBeLessThan(saveDraft.mock.invocationCallOrder[0]);
    expect(emitNoteSaved).toHaveBeenCalledWith(expect.objectContaining({
      id: 'sticky-note-1',
      title: '新的置顶标题',
    }));
    expect(wrapper.get('[data-testid="sticky-title-text"]').text()).toBe('新的置顶标题');
  });

  it('Escape 取消标题编辑并恢复原标题', async () => {
    const wrapper = await mountStickyNote();

    await wrapper.get('[data-testid="sticky-title-edit"]').trigger('click');
    const input = wrapper.get('[data-testid="sticky-title-input"] input');
    await input.setValue('临时标题');
    await input.trigger('keydown', { key: 'Escape' });
    await flushPromises();

    expect(saveDraft).not.toHaveBeenCalled();
    expect(emitNoteSaved).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="sticky-title-text"]').text()).toBe('置顶便签');
  });

  it('底部不再渲染颜色选择器和透明度滑块', async () => {
    const wrapper = await mountStickyNote();

    expect(wrapper.find('.sticky-color-picker').exists()).toBe(false);
    expect(wrapper.find('.sticky-opacity').exists()).toBe(false);
    expect(StickyNoteSource).not.toContain('NColorPicker');
    expect(StickyNoteSource).not.toContain('NSlider');
  });

  it('底部右侧显示字数、行数和保存状态文案', async () => {
    autosaveStatus.value = 'saved';
    autosaveSavedAt.value = new Date('2026-05-16T10:00:00.000Z');

    const wrapper = await mountStickyNote();
    const statusBar = wrapper.get('[data-testid="sticky-status-bar"]').text();

    expect(statusBar).toContain('11 字');
    expect(statusBar).toContain('2 行');
    expect(statusBar).toContain('已保存');
    expect(statusBar).toMatch(/10:00|18:00/);
    expect(StickyNoteSource).toContain('var(--app-surface)');
    expect(StickyNoteSource).toContain('var(--app-fg)');
  });
});
