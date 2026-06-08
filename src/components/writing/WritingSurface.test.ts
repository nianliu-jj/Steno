/**
 * @file 写作表面组件 - Writing Surface
 *
 * 覆盖 Writing Surface 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import WritingSurface from './WritingSurface.vue';

// 测试用例：验证「WritingSurface」场景，锁定 Writing Surface 的用户可见行为。
describe('WritingSurface', () => {
  // 测试用例：验证「renders the mode controls and emits source-mode transitions」场景，锁定 Writing Surface 的用户可见行为。
  it('renders the mode controls and emits source-mode transitions', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WritingSurface, {
      props: {
        modelValue: '# 标题',
        mode: 'rich-readonly',
        headings: [{ id: 'heading-0', level: 1, text: '标题' }],
        outlineOpen: false,
        outlineWidth: 280,
        showFloatingOutline: true,
        showZenEntry: true
      }
    });

    await wrapper.get('[data-testid="writing-open-source"]').trigger('click');

    expect(wrapper.emitted('open-source')).toBeTruthy();
    expect(wrapper.find('[data-testid="writing-outline-fab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="writing-open-zen"]').exists()).toBe(true);
  });
});
