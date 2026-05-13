// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import MainWorkbenchShell from './MainWorkbenchShell.vue';

describe('MainWorkbenchShell', () => {
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
});
