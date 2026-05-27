// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';

import MainWorkbenchShell from './MainWorkbenchShell.vue';
import MainWorkbenchShellSource from './MainWorkbenchShell.vue?raw';

const navigateTo = vi.fn();
const navigateToMain = vi.fn();
const startDragCurrent = vi.fn();
const minimizeCurrent = vi.fn();
const toggleMaximizeCurrent = vi.fn();
const closeCurrent = vi.fn();
const openQuicknote = vi.fn(() => Promise.resolve());
const settingsState = reactive({
  mainSidebarWidth: 220,
  mainSidebarCollapsed: false,
});

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateTo,
    navigateToMain,
  }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    state: settingsState,
  }),
}));

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    startDragCurrent,
    minimizeCurrent,
    toggleMaximizeCurrent,
    closeCurrent,
    openQuicknote,
  }),
}));

describe('MainWorkbenchShell', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
      writable: true,
    });
    navigateTo.mockClear();
    navigateToMain.mockClear();
    startDragCurrent.mockClear();
    minimizeCurrent.mockClear();
    toggleMaximizeCurrent.mockClear();
    closeCurrent.mockClear();
    openQuicknote.mockClear();
    settingsState.mainSidebarWidth = 220;
    settingsState.mainSidebarCollapsed = false;
  });

  it('renders the workbench frame and slot content', () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        navItems: [{ key: 'main', label: '笔记列表', active: true }],
      },
      slots: {
        default: '<div class="page-body">body</div>',
      },
    });

    expect(wrapper.find('.workbench-page-header').exists()).toBe(false);
    expect(wrapper.find('.bottombar').exists()).toBe(false);
    expect(wrapper.find('.page-body').exists()).toBe(true);
  });

  it('navigates from the sidebar main item with navigateToMain and other items with navigateTo', async () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        navItems: [
          { key: 'main', label: '笔记列表', active: true },
          { key: 'canvas', label: '画布', active: false },
        ],
      },
    });

    await wrapper.find('[data-nav="main"]').trigger('click');
    await wrapper.find('[data-nav="canvas"]').trigger('click');

    expect(navigateToMain).toHaveBeenCalledOnce();
    expect(navigateToMain).toHaveBeenCalledWith();
    expect(navigateTo).toHaveBeenCalledWith('canvas');
  });

  it('marks the custom titlebar as a native drag region and keeps window controls interactive', async () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        navItems: [{ key: 'main', label: '笔记列表', active: true }],
      },
    });

    await wrapper.findAll('.win-btn')[0].trigger('click');
    await wrapper.findAll('.win-btn')[1].trigger('click');
    await wrapper.findAll('.win-btn')[2].trigger('click');

    expect(wrapper.get('.workbench-titlebar').attributes('data-tauri-drag-region')).toBe('true');
    expect(wrapper.get('.topbar-brand').attributes('data-tauri-drag-region')).toBe('true');
    expect(wrapper.get('.topbar-center').attributes('data-tauri-drag-region')).toBe('true');
    expect(wrapper.get('.workbench-window-controls').attributes('data-tauri-drag-region')).toBe(
      'false',
    );
    expect(startDragCurrent).not.toHaveBeenCalled();
    expect(minimizeCurrent).toHaveBeenCalledOnce();
    expect(toggleMaximizeCurrent).toHaveBeenCalledOnce();
    expect(closeCurrent).toHaveBeenCalledOnce();
  });

  it('keeps Windows titlebar controls on the right and centers the feature search', () => {
    expect(MainWorkbenchShellSource).toContain(
      'grid-template-columns: var(--rail-w) minmax(0, 1fr) auto;',
    );
    expect(MainWorkbenchShellSource).toContain('justify-content: center;');
    expect(MainWorkbenchShellSource).toContain('justify-self: end;');
  });

  it('renders v2 titlebar controls and excludes interactive controls from drag', async () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        navItems: [{ key: 'main', label: '笔记列表', active: true }],
      },
    });

    expect(wrapper.find('.brand-mark').text()).toBe('S');
    expect(wrapper.find('.brand-name').text()).toBe('Steno');
    expect(wrapper.find('.back-btn').exists()).toBe(false);
    expect(wrapper.find('[data-testid="feature-search-input"]').attributes('placeholder')).toBe(
      '搜索功能、设置…',
    );
    expect(wrapper.find('.kbd').exists()).toBe(false);
    expect(wrapper.findAll('.wc-btn')).toHaveLength(3);

    expect(navigateToMain).not.toHaveBeenCalled();
    expect(navigateTo).not.toHaveBeenCalled();
    expect(startDragCurrent).not.toHaveBeenCalled();
  });

  it('opens the feature menu when focusing the search input and filters by query', async () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        navItems: [{ key: 'main', label: '笔记列表', active: true }],
      },
    });

    expect(wrapper.find('[data-testid="feature-search-menu"]').exists()).toBe(false);

    await wrapper.get('[data-testid="feature-search-input"]').trigger('focus');
    expect(wrapper.find('[data-testid="feature-search-menu"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="feature-search-item-nav-main"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="feature-search-item-nav-canvas"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="feature-search-item-action-settings"]').exists()).toBe(true);

    await wrapper
      .get('[data-testid="feature-search-input"]')
      .setValue('设置');
    expect(wrapper.find('[data-testid="feature-search-item-action-settings"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="feature-search-item-nav-canvas"]').exists()).toBe(false);

    await wrapper.get('[data-testid="feature-search-input"]').setValue('absolutely-no-match');
    expect(wrapper.find('[data-testid="feature-search-empty"]').exists()).toBe(true);
  });

  it('routes feature menu entries to navigateTo, navigateToMain, and openQuicknote', async () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        navItems: [{ key: 'main', label: '笔记列表', active: true }],
      },
    });

    await wrapper.get('[data-testid="feature-search-input"]').trigger('focus');
    await wrapper.get('[data-testid="feature-search-item-action-settings"]').trigger('click');
    expect(navigateTo).toHaveBeenCalledWith('settings');

    await wrapper.get('[data-testid="feature-search-input"]').trigger('focus');
    await wrapper.get('[data-testid="feature-search-item-action-new-note"]').trigger('click');
    expect(navigateTo).toHaveBeenCalledWith('note-editor');

    await wrapper.get('[data-testid="feature-search-input"]').trigger('focus');
    await wrapper.get('[data-testid="feature-search-item-nav-main"]').trigger('click');
    expect(navigateToMain).toHaveBeenCalled();

    await wrapper.get('[data-testid="feature-search-input"]').trigger('focus');
    await wrapper.get('[data-testid="feature-search-item-nav-stats"]').trigger('click');
    expect(navigateTo).toHaveBeenCalledWith('stats');

    await wrapper.get('[data-testid="feature-search-input"]').trigger('focus');
    await wrapper.get('[data-testid="feature-search-item-action-new-quicknote"]').trigger('click');
    expect(openQuicknote).toHaveBeenCalledOnce();
  });

  it('renders rail navigation with active state, counts, and footer actions', async () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        navItems: [
          { key: 'main', label: '笔记列表', active: true, count: '24' },
          { key: 'canvas', label: '画布', active: false, count: '3' },
          { key: 'clipboard', label: '粘贴板', active: false, count: '128' },
          { key: 'todo', label: '待办', active: false, count: '7' },
          { key: 'stats', label: '统计', active: false },
          { key: 'screenshot', label: '截图', active: false, count: '⌘⇧4' },
          { key: 'ocr', label: 'OCR', active: false },
          { key: 'translate', label: '翻译', active: false },
        ],
      },
    });

    expect(wrapper.get('.workbench-root').attributes('data-rail')).toBe('expanded');
    expect(wrapper.findAll('.rail-item')).toHaveLength(8);
    expect(wrapper.get('[data-nav="main"]').classes()).toContain('rail-item--active');
    expect(wrapper.get('[data-nav="main"] .rail-label').text()).toBe('笔记列表');
    expect(wrapper.get('[data-nav="main"] .rail-count').text()).toBe('24');
    expect(wrapper.get('[data-testid="rail-settings"]').attributes('aria-label')).toBe('打开设置');
    expect(wrapper.get('[data-testid="rail-collapse"]').attributes('aria-expanded')).toBe('true');

    await wrapper.get('[data-nav="canvas"]').trigger('click');
    await wrapper.get('[data-nav="stats"]').trigger('click');
    await wrapper.get('[data-testid="rail-settings"]').trigger('click');
    await wrapper.get('[data-testid="rail-collapse"]').trigger('click');

    expect(navigateTo).toHaveBeenNthCalledWith(1, 'canvas');
    expect(navigateTo).toHaveBeenNthCalledWith(2, 'stats');
    expect(navigateTo).toHaveBeenNthCalledWith(3, 'settings');
    expect(wrapper.get('.workbench-root').attributes('data-rail')).toBe('collapsed');
    expect(wrapper.get('[data-testid="rail-collapse"]').attributes('aria-expanded')).toBe('false');

    await wrapper.get('[data-testid="rail-collapse"]').trigger('click');
    expect(wrapper.get('.workbench-root').attributes('data-rail')).toBe('expanded');
  });

  it('hides the main resize handle when the rail is collapsed', async () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        navItems: [{ key: 'main', label: '笔记列表', active: true }],
      },
    });

    expect(wrapper.find('[data-testid="workbench-rail-resize"]').exists()).toBe(true);

    await wrapper.get('[data-testid="rail-collapse"]').trigger('click');

    expect(wrapper.find('[data-testid="workbench-rail-resize"]').exists()).toBe(false);
  });

  it('does not load pinned notes or render legacy footer chrome', () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        navItems: [{ key: 'main', label: '笔记列表', active: true }],
      },
    });

    expect(wrapper.find('.bottombar').exists()).toBe(false);
    expect(wrapper.find('.pin-chip').exists()).toBe(false);
    expect(wrapper.find('.workbench-page-header').exists()).toBe(false);
  });

  it('applies narrow-screen collapse behavior and keeps responsive truncation rules', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 640,
      writable: true,
    });

    const wrapper = mount(MainWorkbenchShell, {
      props: {
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
    expect(MainWorkbenchShellSource).not.toContain('.workbench-page-header');
    expect(MainWorkbenchShellSource).not.toContain('.pin-chip');
    expect(MainWorkbenchShellSource).toContain('.workbench-content');
    expect(MainWorkbenchShellSource).toContain('overflow: auto;');
  });
});
