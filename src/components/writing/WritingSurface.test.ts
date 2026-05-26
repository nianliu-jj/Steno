// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import WritingSurface from './WritingSurface.vue';

describe('WritingSurface', () => {
  it('renders the mode controls and emits source-mode transitions', async () => {
    const wrapper = mount(WritingSurface, {
      props: {
        modelValue: '# 标题',
        mode: 'rich-readonly',
        headings: [{ id: 'heading-0', level: 1, text: '标题' }],
        outlineOpen: false,
        outlineWidth: 280,
        showFloatingOutline: true,
        showZenEntry: true,
      },
    });

    await wrapper.get('[data-testid="writing-open-source"]').trigger('click');

    expect(wrapper.emitted('open-source')).toBeTruthy();
    expect(wrapper.find('[data-testid="writing-outline-fab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="writing-open-zen"]').exists()).toBe(true);
  });
});
