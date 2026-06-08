/**
 * @file Vue 组合式逻辑 - use Resizable Pane
 *
 * 覆盖 use Resizable Pane 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { describe, expect, it } from 'vitest';

import { useResizablePane } from './useResizablePane';

// 测试用例：验证「useResizablePane」场景，锁定 use Resizable Pane 的用户可见行为。
describe('useResizablePane', () => {
  // 测试用例：验证「collapses when dragged to the icon threshold and restores after expand」场景，锁定 use Resizable Pane 的用户可见行为。
  it('collapses when dragged to the icon threshold and restores after expand', () => {
    // 局部常量 pane：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const pane = useResizablePane({
      initialWidth: 220,
      minWidth: 58,
      maxWidth: 320,
      collapseThreshold: 72
    });

    pane.setWidth(68);
    expect(pane.collapsed.value).toBe(true);
    expect(pane.width.value).toBe(58);

    pane.expand();
    expect(pane.collapsed.value).toBe(false);
    expect(pane.width.value).toBe(220);
  });

  // 测试用例：验证「clamps width within min and max bounds while expanded」场景，锁定 use Resizable Pane 的用户可见行为。
  it('clamps width within min and max bounds while expanded', () => {
    // 局部常量 pane：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const pane = useResizablePane({
      initialWidth: 220,
      minWidth: 58,
      maxWidth: 320
    });

    pane.setWidth(999);
    expect(pane.width.value).toBe(320);
    expect(pane.collapsed.value).toBe(false);

    pane.setWidth(10);
    expect(pane.width.value).toBe(58);
    expect(pane.collapsed.value).toBe(false);
  });
});
