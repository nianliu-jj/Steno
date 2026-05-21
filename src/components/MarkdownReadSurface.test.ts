// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import MarkdownReadSurface from './MarkdownReadSurface.vue';

describe('MarkdownReadSurface', () => {
  it('renders markdown html with heading anchors in read mode', () => {
    const wrapper = mount(MarkdownReadSurface, {
      props: {
        title: '测试文档',
        content: '# 标题\n正文\n## 二级标题',
      },
    });

    expect(wrapper.get('[data-testid="markdown-read-surface"]').text()).toContain('测试文档');
    expect(wrapper.get('.markdown-read-surface__body').html()).toContain(
      'data-heading-id="heading-1"',
    );
    expect(wrapper.get('.markdown-read-surface__body').html()).toContain(
      'data-heading-id="heading-3"',
    );
    expect(wrapper.text()).toContain('正文');
  });

  it('falls back to an untitled heading when title is empty', () => {
    const wrapper = mount(MarkdownReadSurface, {
      props: {
        title: '',
        content: '普通正文',
      },
    });

    expect(wrapper.get('.markdown-read-surface__title').text()).toBe('无标题');
  });
});
