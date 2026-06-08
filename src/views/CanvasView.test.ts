/**
 * @file 前端视图 - Canvas View
 *
 * 覆盖 Canvas View 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import CanvasView from './CanvasView.vue';

// 局部常量 loadNotes：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const loadNotes = vi.fn(() => Promise.resolve());

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    loadNotes
  })
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateToMain: vi.fn()
  })
}));

vi.mock('@/components/Canvas.vue', () => ({
  default: { template: '<div class="mock-canvas">canvas</div>' }
}));

// 测试用例：验证「CanvasView」场景，锁定 Canvas View 的用户可见行为。
describe('CanvasView', () => {
  // 测试用例：验证「renders canvas inside the shared workbench without its own page header」场景，锁定 Canvas View 的用户可见行为。
  it('renders canvas inside the shared workbench without its own page header', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(CanvasView);
    await flushPromises();

    expect(wrapper.find('.canvas-page-header').exists()).toBe(false);
    expect(wrapper.find('.canvas-page-body').exists()).toBe(true);
    expect(wrapper.find('.mock-canvas').exists()).toBe(true);
  });
});
