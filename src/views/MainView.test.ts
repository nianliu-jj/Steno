// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import MainView from './MainView.vue';
import MainViewSource from './MainView.vue?raw';
import type { Note, SaveNoteRequest } from '@/types/steno';

const openQuicknote = vi.fn(() => Promise.resolve());
const navigateTo = vi.fn();
const exportNoteMarkdown = vi.fn(() => Promise.resolve('D:/exports/note.md'));
const exportNoteHtml = vi.fn(() => Promise.resolve('D:/exports/note.html'));
const exportNotePdf = vi.fn(() => Promise.resolve('D:/exports/note.pdf'));
const listenNoteSaved = vi.fn();
const noteSavedCleanup = vi.fn();
let noteSavedHandler: ((note: Note) => void) | null = null;

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    openQuicknote,
    openCanvas: vi.fn(() => Promise.resolve()),
    openSettings: vi.fn(() => Promise.resolve()),
    closeStickyNote: vi.fn(() => Promise.resolve()),
    openStickyNote: vi.fn(() => Promise.resolve()),
  }),
}));

const loadNotes = vi.fn(() => Promise.resolve());
const loadPinned = vi.fn(() => Promise.resolve());
const notesState = ref<Note[]>([]);
const pinnedState = ref<Note[]>([]);
const loadingState = ref(false);
let saveDraftMock: Mock<(input: SaveNoteRequest) => Promise<Note | null>> = vi.fn(() => Promise.resolve(null));
let removeNoteMock = vi.fn(() => Promise.resolve());
let syncExternalNoteMock = vi.fn();

function setNotesState(next: Note[]) {
  notesState.value = [...next];
}

function setPinnedState(next: Note[]) {
  pinnedState.value = [...next];
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    get notes() {
      return notesState.value;
    },
    get pinned() {
      return pinnedState.value;
    },
    get loading() {
      return loadingState.value;
    },
    loadNotes,
    loadPinned,
    pinNote: vi.fn(() => Promise.resolve()),
    unpinNote: vi.fn(() => Promise.resolve()),
    saveDraft: (input: SaveNoteRequest) => saveDraftMock(input),
    removeNote: (...args: Parameters<typeof removeNoteMock>) => removeNoteMock(...args),
    syncExternalNote: (note: Note) => syncExternalNoteMock(note),
  }),
}));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    exportNoteMarkdown,
    exportNoteHtml,
    exportNotePdf,
  }),
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateTo,
  }),
}));

vi.mock('@/composables/useAppEvents', () => ({
  useAppEvents: () => ({
    listenNoteSaved: (...args: Parameters<typeof listenNoteSaved>) => listenNoteSaved(...args),
  }),
}));

const WrappedMainView = defineComponent({
  setup() {
    return () =>
      h(NConfigProvider, null, {
        default: () =>
          h(NMessageProvider, null, {
            default: () => h(MainView),
          }),
      });
  },
});

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    title: '默认标题',
    content: '默认正文',
    htmlContent: '<p>默认正文</p>',
    tags: [],
    isPinned: false,
    pinnedWindowConfig: null,
    canvasPosition: null,
    createdAt: '2026-05-15T07:00:00.000Z',
    updatedAt: '2026-05-15T07:05:00.000Z',
    wordCount: 4,
    ...overrides,
  };
}

describe('MainView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setNotesState([]);
    setPinnedState([]);
    loadingState.value = false;
    saveDraftMock = vi.fn(() => Promise.resolve(null));
    removeNoteMock = vi.fn(() => Promise.resolve());
    syncExternalNoteMock = vi.fn();
    openQuicknote.mockClear();
    navigateTo.mockClear();
    loadNotes.mockClear();
    loadPinned.mockClear();
    listenNoteSaved.mockReset();
    noteSavedCleanup.mockReset();
    noteSavedCleanup.mockImplementation(() => undefined);
    noteSavedHandler = null;
    listenNoteSaved.mockImplementation((handler: (note: Note) => void) => {
      noteSavedHandler = handler;
      return Promise.resolve(noteSavedCleanup);
    });
    exportNoteMarkdown.mockClear();
    exportNoteHtml.mockClear();
    exportNotePdf.mockReset();
    exportNotePdf.mockResolvedValue('D:/exports/note.pdf');
  });

  it('renders notes as layout v2 cards', async () => {
    setNotesState([
      {
        id: 'note-1',
        title: 'Rust 生命周期笔记',
        content: '函数中的生命周期标注影响返回值的存活范围。',
        htmlContent: '<p>函数中的生命周期标注影响返回值的存活范围。</p>',
        tags: ['rust', '学习'],
        isPinned: true,
        pinnedWindowConfig: null,
        canvasPosition: null,
        createdAt: '2026-05-14T10:00:00.000Z',
        updatedAt: '2026-05-14T10:03:00.000Z',
        wordCount: 18,
      },
    ]);

    const wrapper = mount(WrappedMainView);
    await flushPromises();

    expect(wrapper.find('.notes-grid').exists()).toBe(true);
    expect(wrapper.findAll('.note-card')).toHaveLength(1);
    expect(wrapper.find('.note-card').text()).toContain('Rust 生命周期笔记');
    expect(wrapper.find('.empty-state').exists()).toBe(false);
  });

  it('maps note store fields to title, preview, tags, updated time, and pin marker', async () => {
    const updatedAt = new Date().toISOString();
    setNotesState([
      {
        id: 'note-2',
        title: '',
        content: '# 标题\n**加粗内容** 与 [链接](https://example.com) 以及第三个标签',
        htmlContent: '<h1>标题</h1><p><strong>加粗内容</strong> 与 <a href="https://example.com">链接</a></p>',
        tags: ['alpha', 'beta', 'gamma'],
        isPinned: true,
        pinnedWindowConfig: null,
        canvasPosition: null,
        createdAt: '2026-05-14T09:00:00.000Z',
        updatedAt,
        wordCount: 24,
      },
    ]);

    const expectedTime = new Date(updatedAt).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const wrapper = mount(WrappedMainView);
    await flushPromises();

    const card = wrapper.get('.note-card');

    expect(card.find('h3').text()).toBe('无标题');
    expect(card.find('.note-pin').exists()).toBe(true);
    expect(card.find('p').text()).toContain('标题');
    expect(card.find('p').text()).toContain('加粗内容');
    expect(card.find('p').text()).toContain('链接');
    expect(card.find('.note-card-tags').text()).toContain('#alpha');
    expect(card.find('.note-card-tags').text()).toContain('#beta');
    expect(card.find('.note-card-tags').text()).not.toContain('#gamma');
    expect(card.find('.note-card-content').text()).toContain(expectedTime);
  });

  it('renders the layout v2 empty state when there are no notes', async () => {
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    expect(wrapper.find('.empty-state').exists()).toBe(true);
    expect(wrapper.find('.empty-illus').exists()).toBe(true);
    expect(wrapper.text()).toContain('这里还空着');
    expect(wrapper.text()).toContain('第一条笔记从一次复制开始');
    expect(wrapper.text()).toContain('⌥ S');
    expect(wrapper.text()).toContain('⌘ N');
    expect(wrapper.text()).toContain('⌘ K');
    expect(wrapper.find('.empty-primary').text()).toContain('新建笔记');
    expect(wrapper.find('.notes-grid').exists()).toBe(false);
    const mainRoot = wrapper.get('.main-root');
    expect(mainRoot.element.firstElementChild).toBe(wrapper.get('.main-toolbar').element);
    expect(mainRoot.element.lastElementChild).toBe(wrapper.get('.empty-state').element);
    expect(MainViewSource).toContain('.main-root');
    expect(MainViewSource).toContain('padding: 18px 20px 20px;');
    expect(MainViewSource).toContain('padding: 14px 14px 16px;');
    expect(loadNotes).toHaveBeenCalledWith(50);
    expect(loadPinned).toHaveBeenCalled();
  });

  it('opens the note editor from the empty-state new note entry', async () => {
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    await wrapper.get('.empty-primary').trigger('click');

    expect(navigateTo).toHaveBeenCalledWith('note-editor');
    expect(openQuicknote).not.toHaveBeenCalled();
  });

  it('renders the main toolbar by default and keeps action behavior working', async () => {
    setNotesState([
      {
        id: 'note-3',
        title: '带操作区的笔记',
        content: '用于验证页面操作区按钮密度与入口位置。',
        htmlContent: '<p>用于验证页面操作区按钮密度与入口位置。</p>',
        tags: ['ui'],
        isPinned: false,
        pinnedWindowConfig: null,
        canvasPosition: null,
        createdAt: '2026-05-14T09:00:00.000Z',
        updatedAt: '2026-05-14T10:30:00.000Z',
        wordCount: 18,
      },
    ]);

    const wrapper = mount(WrappedMainView);
    await flushPromises();

    expect(wrapper.find('.main-toolbar').exists()).toBe(true);
    expect(wrapper.get('[data-testid="main-filter"]').text()).toContain('筛选');
    expect(wrapper.get('[data-testid="main-new-note"]').text()).toContain('新建笔记');
    expect(wrapper.get('[data-testid="main-new-quicknote"]').text()).toContain('速记');
    expect(wrapper.find('.notes-grid').exists()).toBe(true);
    expect(wrapper.find('.empty-state').exists()).toBe(false);

    await wrapper.get('[data-testid="main-new-note"]').trigger('click');
    await wrapper.get('[data-testid="main-new-quicknote"]').trigger('click');

    expect(navigateTo).toHaveBeenCalledWith('note-editor');
    expect(openQuicknote).toHaveBeenCalledOnce();
  });

  it('filters notes by multiple tag checkboxes including untagged notes', async () => {
    setNotesState([
      makeNote({ id: 'a', title: 'Alpha', tags: ['work'] }),
      makeNote({ id: 'b', title: 'Beta', tags: ['life', 'work'] }),
      makeNote({ id: 'c', title: 'Gamma', tags: [] }),
    ]);

    const wrapper = mount(WrappedMainView);
    await flushPromises();

    await wrapper.get('[data-testid="main-filter"]').trigger('click');
    expect(wrapper.get('[data-testid="filter-menu"]').text()).toContain('按标签筛选');
    expect(wrapper.get('[data-testid="filter-select-all"]').text()).toContain('全部笔记');
    expect(wrapper.get('[data-testid="filter-select-all"]').text()).toContain('3');
    expect((wrapper.get('[data-testid="filter-select-all"] input').element as HTMLInputElement).checked).toBe(true);
    expect(wrapper.get('[data-testid="filter-option-work"]').text()).toContain('#work');
    expect(wrapper.get('[data-testid="filter-option-work"]').text()).toContain('2');
    expect(wrapper.get('[data-testid="filter-option-life"]').text()).toContain('#life');
    expect(wrapper.get('[data-testid="filter-option-life"]').text()).toContain('1');
    expect(wrapper.get('[data-testid="filter-option-untagged"]').text()).toContain('无标签');
    expect(wrapper.get('[data-testid="filter-option-untagged"]').text()).toContain('1');
    expect(wrapper.get('[data-testid="filter-stat"]').text()).toBe('3 / 3 篇');

    await wrapper.get('[data-testid="filter-option-life"] input').setValue(true);
    expect(wrapper.findAll('.note-card').map(card => card.text())).toEqual([
      expect.stringContaining('Beta'),
    ]);
    expect((wrapper.get('[data-testid="filter-select-all"] input').element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.get('[data-testid="filter-stat"]').text()).toBe('1 / 3 篇');

    await wrapper.get('[data-testid="filter-option-untagged"] input').setValue(true);
    const cardTexts = wrapper.findAll('.note-card').map(card => card.text());
    expect(cardTexts).toEqual([
      expect.stringContaining('Beta'),
      expect.stringContaining('Gamma'),
    ]);
    expect(wrapper.get('[data-testid="filter-stat"]').text()).toBe('2 / 3 篇');

    await wrapper.get('[data-testid="filter-clear"]').trigger('click');
    expect(wrapper.findAll('.note-card')).toHaveLength(3);
    expect((wrapper.get('[data-testid="filter-select-all"] input').element as HTMLInputElement).checked).toBe(true);

    await wrapper.get('[data-testid="filter-option-work"] input').setValue(true);
    await wrapper.get('[data-testid="filter-apply"]').trigger('click');
    expect(wrapper.find('[data-testid="filter-menu"]').exists()).toBe(false);
  });

  it('prevents the default context menu and disables document actions on blank area', async () => {
    setNotesState([makeNote({ id: 'note-ctx', title: '右键文档', tags: ['ctx'] })]);
    const preventDefault = vi.fn();
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    await wrapper.get('.main-root').trigger('contextmenu', {
      preventDefault,
      clientX: 80,
      clientY: 90,
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(wrapper.find('[data-testid="note-context-menu"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="context-new"]').attributes('aria-disabled')).toBe('false');
    expect(wrapper.get('[data-testid="context-edit"]').attributes('aria-disabled')).toBe('true');
    expect(wrapper.get('[data-testid="context-tags"]').attributes('aria-disabled')).toBe('true');
    expect(wrapper.get('[data-testid="context-export"]').attributes('aria-disabled')).toBe('true');
    expect(wrapper.get('[data-testid="context-rename"]').attributes('aria-disabled')).toBe('true');
    expect(wrapper.get('[data-testid="context-delete"]').attributes('aria-disabled')).toBe('true');
  });

  it('enables note context actions and calls new, edit, export, rename, tag, print, and delete handlers', async () => {
    saveDraftMock = vi.fn((input: SaveNoteRequest) =>
      Promise.resolve(makeNote({
        id: input.id,
        title: input.title ?? '右键文档',
        content: input.content,
        tags: input.tags,
      })),
    );
    removeNoteMock = vi.fn(() => Promise.resolve());
    exportNotePdf.mockRejectedValue(new Error('PDF 不可用'));
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    setNotesState([makeNote({ id: 'note-ctx', title: '右键文档', tags: ['old'], content: '正文' })]);

    const wrapper = mount(WrappedMainView);
    await flushPromises();
    await wrapper.get('.note-card').trigger('contextmenu', { preventDefault: vi.fn(), clientX: 120, clientY: 140 });

    await wrapper.get('[data-testid="context-new"]').trigger('click');
    expect(navigateTo).toHaveBeenCalledWith('note-editor');

    await wrapper.get('.note-card').trigger('contextmenu', { preventDefault: vi.fn(), clientX: 120, clientY: 140 });
    expect(wrapper.get('[data-testid="context-edit"]').attributes('aria-disabled')).toBe('false');
    await wrapper.get('[data-testid="context-edit"]').trigger('click');
    expect(navigateTo).toHaveBeenCalledWith('note-editor', 'note-ctx');

    await wrapper.get('.note-card').trigger('contextmenu', { preventDefault: vi.fn(), clientX: 120, clientY: 140 });
    await wrapper.get('[data-testid="context-tags"]').trigger('click');
    await wrapper.get('[data-testid="main-tag-input-0"] input').setValue('updated');
    await wrapper.get('[data-testid="main-tag-add"]').trigger('click');
    await wrapper.get('[data-testid="main-tag-input-1"] input').setValue('temporary');
    await wrapper.get('[data-testid="main-tag-delete-1"]').trigger('click');
    await wrapper.get('[data-testid="main-tag-add"]').trigger('click');
    await wrapper.get('[data-testid="main-tag-input-1"] input').setValue('new');
    await wrapper.get('[data-testid="main-tags-confirm"]').trigger('click');
    expect(saveDraftMock).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'note-ctx',
      title: '右键文档',
      content: '正文',
      tags: ['updated', 'new'],
    }));

    await wrapper.get('.note-card').trigger('contextmenu', { preventDefault: vi.fn(), clientX: 120, clientY: 140 });
    await wrapper.get('[data-testid="context-rename"]').trigger('click');
    await wrapper.get('[data-testid="main-rename-input"] input').setValue('新标题');
    await wrapper.get('[data-testid="main-rename-confirm"]').trigger('click');
    expect(saveDraftMock).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'note-ctx',
      title: '新标题',
    }));

    await wrapper.get('.note-card').trigger('contextmenu', { preventDefault: vi.fn(), clientX: 120, clientY: 140 });
    await wrapper.get('[data-testid="context-export"]').trigger('click');
    await wrapper.get('[data-testid="context-export-markdown"]').trigger('click');
    await wrapper.get('[data-testid="context-export-html"]').trigger('click');
    await wrapper.get('[data-testid="context-export-pdf"]').trigger('click');
    expect(exportNoteMarkdown).toHaveBeenCalledWith('note-ctx');
    expect(exportNoteHtml).toHaveBeenCalledWith('note-ctx');
    expect(exportNotePdf).toHaveBeenCalledWith('note-ctx');

    await wrapper.get('[data-testid="context-print"]').trigger('click');
    expect(print).toHaveBeenCalledOnce();

    await wrapper.get('.note-card').trigger('contextmenu', { preventDefault: vi.fn(), clientX: 120, clientY: 140 });
    await wrapper.get('[data-testid="context-delete"]').trigger('click');
    expect(removeNoteMock).toHaveBeenCalledWith('note-ctx');

    print.mockRestore();
  });

  it('calls syncExternalNote when a note-saved event arrives', async () => {
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    const savedNote = makeNote({ id: 'note-saved', title: '跨窗口新标题' });
    noteSavedHandler?.(savedNote);
    await flushPromises();

    expect(listenNoteSaved).toHaveBeenCalledOnce();
    expect(syncExternalNoteMock).toHaveBeenCalledWith(savedNote);

    wrapper.unmount();
  });

  it('replays load-period note-saved updates after the initial load resolves', async () => {
    setNotesState([makeNote({ id: 'note-1', title: '旧标题' })]);
    const initialLoad = createDeferred<void>();
    loadNotes.mockImplementationOnce(() => {
      loadingState.value = true;
      return initialLoad.promise.finally(() => {
        setNotesState([makeNote({ id: 'note-1', title: '旧标题' })]);
        loadingState.value = false;
      });
    });
    syncExternalNoteMock = vi.fn((note: Note) => {
      setNotesState([note]);
    });

    const wrapper = mount(WrappedMainView);
    await flushPromises();

    expect(wrapper.get('.note-card h3').text()).toBe('旧标题');

    noteSavedHandler?.(makeNote({ id: 'note-1', title: '新标题' }));
    await flushPromises();

    expect(wrapper.get('.note-card h3').text()).toBe('新标题');

    initialLoad.resolve();
    await flushPromises();

    expect(wrapper.get('.note-card h3').text()).toBe('新标题');
    expect(syncExternalNoteMock).toHaveBeenCalledTimes(2);
  });

  it('cleans up the note-saved listener when the listener promise resolves after unmount', async () => {
    const listenerRegistration = createDeferred<() => void>();
    listenNoteSaved.mockImplementationOnce((handler: (note: Note) => void) => {
      noteSavedHandler = handler;
      return listenerRegistration.promise;
    });

    const wrapper = mount(WrappedMainView);
    await Promise.resolve();

    wrapper.unmount();
    expect(noteSavedCleanup).not.toHaveBeenCalled();

    listenerRegistration.resolve(noteSavedCleanup);
    await flushPromises();

    expect(noteSavedCleanup).toHaveBeenCalledOnce();
  });

  it('logs an error when note-saved listener registration fails', async () => {
    const error = new Error('listen failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listenNoteSaved.mockImplementationOnce(() => Promise.reject(error));

    mount(WrappedMainView);
    await flushPromises();

    expect(consoleError).toHaveBeenCalledWith(
      '[main] failed to listen for note save events:',
      error,
    );

    consoleError.mockRestore();
  });

  it('declares readable local colors for the light tag and rename dialogs', () => {
    expect(MainViewSource).toContain('class="main-dialog-cancel"');
    expect(MainViewSource).toContain('class="main-tag-input"');
    expect(MainViewSource).toContain('class="main-rename-dialog-input"');
    expect(MainViewSource).toContain('--n-text-color: #2a2a2a');
    expect(MainViewSource).toContain('--n-placeholder-color: #8a7c70');
    expect(MainViewSource).toContain('--n-color: #fffdf9');
    expect(MainViewSource).toContain('-webkit-text-fill-color: #2a2a2a');
    expect(MainViewSource).toContain('--n-text-color: #6f5c4c');
    expect(MainViewSource).toContain('--n-color-hover: rgba(55, 46, 36, 0.08)');
  });
});
