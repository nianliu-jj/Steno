// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import PlaceholderView from './PlaceholderView.vue';

describe('PlaceholderView', () => {
  it('shows a clear coming-soon message for unfinished modules', () => {
    const wrapper = mount(PlaceholderView, {
      props: {
        title: 'OCR',
        description: '功能规划中',
      },
    });

    expect(wrapper.text()).toContain('OCR');
    expect(wrapper.text()).toContain('功能规划中');
  });
});
