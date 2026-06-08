/**
 * @file 前端通用组件 - Canvas
 *
 * 覆盖 Canvas 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import Canvas from './Canvas.vue';
import type { Note } from '@/types/steno';

// 局部常量 navigateToZenFromCanvas：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const navigateToZenFromCanvas = vi.fn();
// 局部常量 updateCanvasPosition：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const updateCanvasPosition = vi.fn(() => Promise.resolve());

const note: Note = {
  id: 'note-1',
  title: '画布笔记',
  content: '正文',
  htmlContent: '<p>正文</p>',
  tags: [],
  isPinned: false,
  pinnedWindowConfig: null,
  canvasPosition: { x: 0, y: 0, scale: 1 },
  createdAt: '2026-05-13T00:00:00.000Z',
  updatedAt: '2026-05-13T00:00:00.000Z',
  wordCount: 2,
  isDraft: false
};

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    notes: [note],
    updateCanvasPosition
  })
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateToZenFromCanvas
  })
}));

// 测试用例：验证「Canvas」场景，锁定 Canvas 的用户可见行为。
describe('Canvas', () => {
  // 测试用例：验证「opens the note in Zen mode when a canvas card is double-clicked」场景，锁定 Canvas 的用户可见行为。
  it('opens the note in Zen mode when a canvas card is double-clicked', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(Canvas, {
      attachTo: document.body,
      global: {
        stubs: {
          NInput: { template: '<input />' },
          NTag: { template: '<span><slot /></span>' }
        }
      }
    });
    await flushPromises();

    await wrapper.find('.canvas-card').trigger('dblclick');

    expect(navigateToZenFromCanvas).toHaveBeenCalledWith('note-1');
  });
});
