// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import MainWorkbenchShell from './MainWorkbenchShell.vue';

const navigateTo = vi.fn();
const navigateToMain = vi.fn();
const startDragCurrent = vi.fn();
const minimizeCurrent = vi.fn();
const toggleMaximizeCurrent = vi.fn();
const closeCurrent = vi.fn();

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

const loadPinned = vi.fn(() => Promise.resolve());

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    pinned: [],
    loadPinned,
  }),
}));

vi.mock('@/views/SettingsView.vue', () => ({
  default: defineComponent({
    emits: ['close'],
    setup(_, { emit }) {
      return () =>
        h('div', { 'data-testid': 'settings-panel' }, [
          h('span', '设置面板'),
          h('button', { type: 'button', onClick: () => emit('close') }, '关闭'),
        ]);
    },
  }),
}));

describe('MainWorkbenchShell', () => {
  beforeEach(() => {
    navigateTo.mockClear();
    navigateToMain.mockClear();
    startDragCurrent.mockClear();
    minimizeCurrent.mockClear();
    toggleMaximizeCurrent.mockClear();
    closeCurrent.mockClear();
    loadPinned.mockClear();
  });

  it('renders layout v2 regions with rail and bottom pinned strip', () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        title: '笔记列表',
        description: '24 篇 · 本地存储',
        navItems: [
          { key: 'main', label: '笔记列表', count: '24', active: true },
          { key: 'canvas', label: '画布', count: '3', active: false },
        ],
      },
      slots: {
        default: '<div data-testid="page-body">body</div>',
      },
    });

    expect(wrapper.find('.app').exists()).toBe(true);
    expect(wrapper.find('.topbar').exists()).toBe(true);
    expect(wrapper.find('.rail').exists()).toBe(true);
    expect(wrapper.find('.main').exists()).toBe(true);
    expect(wrapper.find('.bottombar').exists()).toBe(true);
    expect(wrapper.text()).toContain('笔记列表');
    expect(wrapper.text()).toContain('24 篇 · 本地存储');
    expect(wrapper.text()).toContain('Steno');
    expect(wrapper.text()).toContain('置顶内容');
    expect(wrapper.get('[data-testid="page-body"]').text()).toBe('body');
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

  it('collapses and expands the rail without changing the active page', async () => {
    const wrapper = mount(MainWorkbenchShell, {
      props: {
        title: '笔记列表',
        description: '24 篇 · 本地存储',
        navItems: [{ key: 'main', label: '笔记列表', count: '24', active: true }],
      },
    });

    await wrapper.get('[data-testid="rail-collapse"]').trigger('click');
    expect(wrapper.get('.app').attributes('data-rail')).toBe('collapsed');

    await wrapper.get('[data-testid="rail-collapse"]').trigger('click');
    expect(wrapper.get('.app').attributes('data-rail')).toBe('expanded');
  });

  it('opens settings from the rail footer', async () => {
    const wrapper = mount(MainWorkbenchShell, {
      attachTo: document.body,
      props: {
        title: '笔记列表',
        description: '24 篇 · 本地存储',
        navItems: [{ key: 'main', label: '笔记列表', active: true }],
      },
    });

    await wrapper.get('[data-testid="rail-settings"]').trigger('click');

    expect(document.body.textContent).toContain('设置面板');

    wrapper.unmount();
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
});
