// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MainWorkbenchShell from './MainWorkbenchShell.vue';

const navigateTo = vi.fn();
const navigateToMain = vi.fn();

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateTo,
    navigateToMain,
  }),
}));

describe('MainWorkbenchShell', () => {
  beforeEach(() => {
    navigateTo.mockClear();
    navigateToMain.mockClear();
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
});
