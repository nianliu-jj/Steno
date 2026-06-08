/**
 * @file Vue 组合式逻辑 - use Draggable Resizable
 *
 * 覆盖 use Draggable Resizable 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { describe, expect, it } from 'vitest';

import { useDraggableResizable } from './useDraggableResizable';

// 函数 make：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function make() {
  return useDraggableResizable({
    initialX: 100,
    initialY: 80,
    initialWidth: 760,
    initialHeight: 580,
    minWidth: 480,
    minHeight: 420
  });
}

// 测试用例：验证「useDraggableResizable」场景，锁定 use Draggable Resizable 的用户可见行为。
describe('useDraggableResizable', () => {
  // 测试用例：验证「moves by delta」场景，锁定 use Draggable Resizable 的用户可见行为。
  it('moves by delta', () => {
    // 局部常量 m：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const m = make();
    m.moveBy(20, -10);
    expect(m.x.value).toBe(120);
    expect(m.y.value).toBe(70);
  });

  // 测试用例：验证「clamps resize to min bounds」场景，锁定 use Draggable Resizable 的用户可见行为。
  it('clamps resize to min bounds', () => {
    // 局部常量 m：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const m = make();
    m.resizeBy(-9999, -9999);
    expect(m.width.value).toBe(480);
    expect(m.height.value).toBe(420);
  });

  // 测试用例：验证「clamps resize to max after setMaxSize」场景，锁定 use Draggable Resizable 的用户可见行为。
  it('clamps resize to max after setMaxSize', () => {
    // 局部常量 m：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const m = make();
    m.setMaxSize(1000, 800);
    m.resizeBy(9999, 9999);
    expect(m.width.value).toBe(1000);
    expect(m.height.value).toBe(800);
  });
});
