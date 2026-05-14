// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import MainWorkbenchShell from './MainWorkbenchShell.vue';
import MainWorkbenchShellSource from './MainWorkbenchShell.vue?raw';

const navigateTo = vi.fn();
const navigateToMain = vi.fn();
const startDragCurrent = vi.fn();
const minimizeCurrent = vi.fn();
const toggleMaximizeCurrent = vi.fn();
const closeCurrent = vi.fn();
const loadPinned = vi.fn(() => Promise.resolve());
let pinnedNotes: Array<{
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
}> = [];

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateTo,
    navigateToMain,
  }),
}));

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    startDragCurrent,
    minimizeCurrent,
    toggleMaximizeCurrent,
    closeCurrent,
  }),
}));

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    pinned: pinnedNotes,
    loadPinned,
  }),
}));

describe('MainWorkbenchShell', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
      writable: true,
    });
    pinnedNotes = [];
    navigateTo.mockClear();
    navigateToMain.mockClear();
    startDragCurrent.mockClear();
    minimizeCurrent.mockClear();
    toggleMaximizeCurrent.mockClear();
    closeCurrent.mockClear();
    loadPinned.mockClear();
  });

  it('renders the workbench frame and slot content', () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        title: '笔记列表',
        description: '24 篇 · 本地存储',
        navItems: [{ key: 'main', label: '笔记列表', active: true }],
      },
      slots: {
        default: '<div class="page-body">body</div>',
      },
    });

    expect(wrapper.text()).toContain('笔记列表');
    expect(wrapper.text()).toContain('24 篇 · 本地存储');
    expect(wrapper.find('.page-body').exists()).toBe(true);
  });

  it('navigates from the sidebar when a nav item is clicked', async () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        title: '笔记列表',
        description: '24 篇 · 本地存储',
        navItems: [
          { key: 'main', label: '笔记列表', active: true },
          { key: 'canvas', label: '画布', active: false },
        ],
      },
    });

    await wrapper.find('[data-nav="canvas"]').trigger('click');

    expect(navigateTo).toHaveBeenCalledWith('canvas');
  });

  it('uses titlebar drag and window controls without overlapping behaviors', async () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        title: '笔记列表',
        description: '24 篇 · 本地存储',
        navItems: [{ key: 'main', label: '笔记列表', active: true }],
      },
    });

    wrapper
      .find('.workbench-titlebar')
      .element
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    await wrapper.findAll('.win-btn')[0].trigger('click');
    await wrapper.findAll('.win-btn')[1].trigger('click');
    await wrapper.findAll('.win-btn')[2].trigger('click');

    expect(startDragCurrent).toHaveBeenCalledOnce();
    expect(minimizeCurrent).toHaveBeenCalledOnce();
    expect(toggleMaximizeCurrent).toHaveBeenCalledOnce();
    expect(closeCurrent).toHaveBeenCalledOnce();
  });

  it('renders v2 titlebar controls and excludes interactive controls from drag', async () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        title: '笔记列表',
        description: '24 篇 · 本地存储',
        navItems: [{ key: 'main', label: '笔记列表', active: true }],
      },
    });

    expect(wrapper.find('.brand-mark').text()).toBe('S');
    expect(wrapper.find('.brand-name').text()).toBe('Steno');
    expect(wrapper.find('.back-btn').attributes('aria-label')).toBe('返回');
    expect(wrapper.find('.search-bar input').attributes('placeholder')).toBe(
      '搜索笔记、画布、剪贴板、待办…',
    );
    expect(wrapper.find('.kbd').text()).toBe('⌘K');
    expect(wrapper.findAll('.wc-btn')).toHaveLength(3);

    await wrapper.find('.back-btn').trigger('click');
    await wrapper.find('.search-bar input').trigger('focus');
    await wrapper.find('.search-bar input').trigger('click');

    expect(navigateToMain).toHaveBeenCalledOnce();
    expect(navigateTo).toHaveBeenCalledTimes(2);
    expect(navigateTo).toHaveBeenNthCalledWith(1, 'search');
    expect(navigateTo).toHaveBeenNthCalledWith(2, 'search');
    expect(startDragCurrent).not.toHaveBeenCalled();
  });

  it('renders rail navigation with active state, counts, and footer actions', async () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        title: '笔记列表',
        description: '24 篇 · 本地存储',
        navItems: [
          { key: 'main', label: '笔记列表', active: true, count: '24' },
          { key: 'canvas', label: '画布', active: false, count: '3' },
          { key: 'clipboard', label: '粘贴板', active: false, count: '128' },
          { key: 'todo', label: '待办', active: false, count: '7' },
          { key: 'screenshot', label: '截图', active: false, count: '⌘⇧4' },
          { key: 'ocr', label: 'OCR', active: false },
          { key: 'translate', label: '翻译', active: false },
        ],
      },
    });

    expect(wrapper.get('.workbench-root').attributes('data-rail')).toBe('expanded');
    expect(wrapper.findAll('.rail-item')).toHaveLength(7);
    expect(wrapper.get('[data-nav="main"]').classes()).toContain('rail-item--active');
    expect(wrapper.get('[data-nav="main"] .rail-label').text()).toBe('笔记列表');
    expect(wrapper.get('[data-nav="main"] .rail-count').text()).toBe('24');
    expect(wrapper.get('[data-testid="rail-settings"]').attributes('aria-label')).toBe('打开设置');
    expect(wrapper.get('[data-testid="rail-language"] .lang-badge').text()).toBe('ZH');
    expect(wrapper.get('[data-testid="rail-collapse"]').attributes('aria-expanded')).toBe('true');

    await wrapper.get('[data-nav="canvas"]').trigger('click');
    await wrapper.get('[data-testid="rail-settings"]').trigger('click');
    await wrapper.get('[data-testid="rail-language"]').trigger('click');
    await wrapper.get('[data-testid="rail-collapse"]').trigger('click');

    expect(navigateTo).toHaveBeenNthCalledWith(1, 'canvas');
    expect(navigateTo).toHaveBeenNthCalledWith(2, 'settings');
    expect(wrapper.get('[data-testid="rail-language"] .lang-badge').text()).toBe('EN');
    expect(wrapper.get('.workbench-root').attributes('data-rail')).toBe('collapsed');
    expect(wrapper.get('[data-testid="rail-collapse"]').attributes('aria-expanded')).toBe('false');

    await wrapper.get('[data-testid="rail-collapse"]').trigger('click');
    expect(wrapper.get('.workbench-root').attributes('data-rail')).toBe('expanded');
  });

  it('renders bottom pinned content from pinned notes with an empty placeholder fallback', () => {
    pinnedNotes = [
      {
        id: 'note-1',
        title: 'Rust 生命周期笔记',
        content: '函数中的生命周期标注影响返回值的存活范围',
        isPinned: true,
      },
      {
        id: 'note-2',
        title: '',
        content: 'cargo tauri build --features clipboard-watch',
        isPinned: true,
      },
    ];

    const wrapper = mount(MainWorkbenchShell, {
      props: {
        title: '笔记列表',
        description: '24 篇 · 本地存储',
        navItems: [{ key: 'main', label: '笔记列表', active: true }],
      },
    });

    expect(loadPinned).toHaveBeenCalledOnce();
    expect(wrapper.find('.bottombar').exists()).toBe(true);
    expect(wrapper.get('.pin-label').text()).toContain('置顶内容');
    expect(wrapper.findAll('.pin-chip')).toHaveLength(2);
    expect(wrapper.text()).toContain('Rust 生命周期笔记');
    expect(wrapper.text()).toContain('cargo tauri build --features clipboard-watch');
    expect(wrapper.get('.pin-tail').text()).toContain('2/5');

    pinnedNotes = [];
    const emptyWrapper = mount(MainWorkbenchShell, {
      props: {
        title: '笔记列表',
        description: '24 篇 · 本地存储',
        navItems: [{ key: 'main', label: '笔记列表', active: true }],
      },
    });

    expect(emptyWrapper.get('.pin-chip--empty').text()).toBe('暂无置顶内容');
    expect(emptyWrapper.get('.pin-tail').text()).toContain('0/5');
  });

  it('applies narrow-screen collapse behavior and keeps responsive truncation rules', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 640,
      writable: true,
    });

    const wrapper = mount(MainWorkbenchShell, {
      props: {
        title: '这是一个很长很长的主窗口标题，用来验证窄屏时的布局收缩',
        description: '这是一段很长很长的描述文案，用来验证窄屏时的布局不会发生文字重叠',
        navItems: [
          { key: 'main', label: '笔记列表', active: true, count: '24' },
          { key: 'canvas', label: '画布', active: false, count: '3' },
        ],
      },
    });

    expect(wrapper.get('.workbench-root').attributes('data-compact')).toBe('true');
    expect(wrapper.get('.workbench-root').attributes('data-rail')).toBe('collapsed');
    expect(wrapper.get('[data-testid="rail-collapse"]').attributes('aria-expanded')).toBe('false');

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
      writable: true,
    });
    window.dispatchEvent(new Event('resize'));
    await nextTick();

    expect(wrapper.get('.workbench-root').attributes('data-compact')).toBe('false');
    expect(wrapper.get('.workbench-root').attributes('data-rail')).toBe('expanded');
    expect(wrapper.get('[data-testid="rail-collapse"]').attributes('aria-expanded')).toBe('true');

    expect(MainWorkbenchShellSource).toContain('@media (max-width: 720px)');
    expect(MainWorkbenchShellSource).toContain('--rail-w: var(--rail-w-collapsed);');
    expect(MainWorkbenchShellSource).toContain('.brand-name,');
    expect(MainWorkbenchShellSource).toContain('.rail-label,');
    expect(MainWorkbenchShellSource).toContain('.rail-count');
    expect(MainWorkbenchShellSource).toContain('.workbench-page-header');
    expect(MainWorkbenchShellSource).toContain('flex-direction: column;');
    expect(MainWorkbenchShellSource).toContain('.pin-chip');
    expect(MainWorkbenchShellSource).toContain('max-width: min(240px, 60vw);');
  });
});
