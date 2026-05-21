// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import DocumentOutlineTree from './DocumentOutlineTree.vue';

describe('DocumentOutlineTree', () => {
  it('renders nested outline nodes and emits select on click', async () => {
    const wrapper = mount(DocumentOutlineTree, {
      props: {
        nodes: [
          {
            id: 'heading-1',
            text: '一级标题',
            level: 1,
            line: 1,
            children: [
              {
                id: 'heading-2',
                text: '二级标题',
                level: 2,
                line: 2,
                children: [],
              },
            ],
          },
        ],
      },
    });

    expect(wrapper.text()).toContain('一级标题');
    expect(wrapper.text()).toContain('二级标题');

    await wrapper.get('[data-testid="outline-node-heading-2"]').trigger('click');

    expect(wrapper.emitted('select')).toEqual([
      [
        {
          id: 'heading-2',
          text: '二级标题',
          level: 2,
          line: 2,
          children: [],
        },
      ],
    ]);
  });

  it('renders an empty hint when no headings are available', () => {
    const wrapper = mount(DocumentOutlineTree, {
      props: {
        nodes: [],
      },
    });

    expect(wrapper.get('[data-testid="outline-empty"]').text()).toContain('暂无大纲');
  });
});
