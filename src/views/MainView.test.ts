// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import MainWorkbenchShell from '@/components/MainWorkbenchShell.vue';
import MainView from './MainView.vue';
import type { Note } from '@/types/steno';

const openQuicknote = vi.fn(() => Promise.resolve());
const navigateTo = vi.fn();

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    openQuicknote,
    openCanvas: vi.fn(() => Promise.resolve()),
    openSearch: vi.fn(() => Promise.resolve()),
    openSettings: vi.fn(() => Promise.resolve()),
    closeStickyNote: vi.fn(() => Promise.resolve()),
    openStickyNote: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock('@/views/SettingsView.vue', () => ({
  default: defineComponent({
    emits: ['close'],
    setup(_, { emit }) {
      return () =>
        h('div', { 'data-testid': 'settings-panel' }, [
          h('span', '设置面板'),
          h('button', { onClick: () => emit('close') }, '关闭'),
        ]);
    },
  }),
}));

const loadNotes = vi.fn(() => Promise.resolve());
const loadPinned = vi.fn(() => Promise.resolve());
let notesState: Note[] = [];
let loadingState = false;

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    notes: notesState,
    pinned: [],
    loading: loadingState,
    loadNotes,
    loadPinned,
    pinNote: vi.fn(() => Promise.resolve()),
    unpinNote: vi.fn(() => Promise.resolve()),
    removeNote: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateTo,
  }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    state: {
      mainWindowShortcut: 'Ctrl+Shift+N',
      quicknoteShortcut: 'Ctrl+Shift+M',
    },
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

const WrappedMainViewWithShell = defineComponent({
  setup() {
    return () =>
      h(NConfigProvider, null, {
        default: () =>
          h(NMessageProvider, null, {
            default: () =>
              h(
                MainWorkbenchShell,
                {
                  title: '笔记列表',
                  description: '最近笔记与快捷入口',
                  navItems: [{ key: 'main', label: '笔记列表', active: true }],
                },
                {
                  actions: () => h(MainView, { compactActions: true }),
                  default: () => h('div', 'stub'),
                },
              ),
          }),
      });
  },
});

describe('MainView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    notesState = [];
    loadingState = false;
    openQuicknote.mockClear();
    navigateTo.mockClear();
    loadNotes.mockClear();
    loadPinned.mockClear();
  });

  it('does not display global shortcuts on the main page', async () => {
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    expect(wrapper.text()).not.toContain('全局快捷键');
    expect(wrapper.text()).not.toContain('Ctrl+Shift+N');
    expect(wrapper.text()).not.toContain('Ctrl+Shift+M');
    expect(wrapper.text()).not.toContain('Steno');
  });

  it('renders notes as layout v2 cards', async () => {
    notesState = [
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
    ];

    const wrapper = mount(WrappedMainView);
    await flushPromises();

    expect(wrapper.find('.notes-grid').exists()).toBe(true);
    expect(wrapper.findAll('.note-card')).toHaveLength(1);
    expect(wrapper.find('.note-card').text()).toContain('Rust 生命周期笔记');
    expect(wrapper.find('.empty-state').exists()).toBe(false);
  });

  it('maps note store fields to title, preview, tags, updated time, and pin marker', async () => {
    const updatedAt = '2026-05-14T10:03:00.000Z';
    notesState = [
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
    ];

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
    expect(card.find('.note-tags').text()).toContain('#alpha');
    expect(card.find('.note-tags').text()).toContain('#beta');
    expect(card.find('.note-tags').text()).not.toContain('#gamma');
    expect(card.find('.note-foot').text()).toContain(expectedTime);
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
  });

  it('opens the note editor from the empty-state new note entry', async () => {
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    await wrapper.get('.empty-primary').trigger('click');

    expect(navigateTo).toHaveBeenCalledWith('note-editor');
    expect(openQuicknote).not.toHaveBeenCalled();
  });

  it('renders compact action controls for filter, new note, and quicknote access', async () => {
    notesState = [
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
    ];

    const wrapper = mount(WrappedMainViewWithShell);
    await flushPromises();

    expect(wrapper.get('[data-testid="main-filter"]').text()).toContain('筛选');
    expect(wrapper.get('[data-testid="main-new-note"]').text()).toContain('新建笔记');
    expect(wrapper.get('[data-testid="main-new-quicknote"]').text()).toContain('速记');

    await wrapper.get('[data-testid="main-new-note"]').trigger('click');
    await wrapper.get('[data-testid="main-new-quicknote"]').trigger('click');

    expect(navigateTo).toHaveBeenCalledWith('note-editor');
    expect(openQuicknote).toHaveBeenCalledOnce();
  });
});
