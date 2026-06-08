/**
 * @file Vue 组合式逻辑 - use Window
 *
 * 覆盖 use Window 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { useWindow } from './useWindow';

// 局部常量 minimize：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const minimize = vi.fn(() => Promise.resolve());
// 局部常量 toggleMaximize：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const toggleMaximize = vi.fn(() => Promise.resolve());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    label: 'main',
    minimize,
    toggleMaximize
  })
}));

// 测试用例：验证「useWindow」场景，锁定 use Window 的用户可见行为。
describe('useWindow', () => {
  // 测试用例：验证「exposes main-window controls for custom title bars」场景，锁定 use Window 的用户可见行为。
  it('exposes main-window controls for custom title bars', async () => {
    // 局部常量 win：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const win = useWindow();

    await win.minimizeCurrent();
    await win.toggleMaximizeCurrent();

    expect(minimize).toHaveBeenCalledOnce();
    expect(toggleMaximize).toHaveBeenCalledOnce();
  });
});
