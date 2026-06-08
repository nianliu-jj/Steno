/**
 * @file 前端工具函数 - canvas Render
 *
 * 覆盖 canvas Render 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderOps } from './canvasRender';
import type { EditOp } from './imageOps';

// 函数 stubCanvas：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function stubCanvas() {
  // 局部常量 ctx：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const ctx = {
    drawImage: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h
    })),
    putImageData: vi.fn()
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  return ctx;
}

afterEach(() => vi.restoreAllMocks());

// 测试用例：验证「renderOps」场景，锁定 canvas Render 的用户可见行为。
describe('renderOps', () => {
  // 测试用例：验证「produces a canvas with rotated dimensions for rotate 90」场景，锁定 canvas Render 的用户可见行为。
  it('produces a canvas with rotated dimensions for rotate 90', () => {
    stubCanvas();
    // 局部常量 source：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const source = document.createElement('canvas');
    const ops: EditOp[] = [{ type: 'rotate', deg: 90 }];
    // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const out = renderOps(source, 200, 100, ops);
    expect(out.width).toBe(100);
    expect(out.height).toBe(200);
  });

  // 测试用例：验证「crops to the rect size」场景，锁定 canvas Render 的用户可见行为。
  it('crops to the rect size', () => {
    stubCanvas();
    // 局部常量 source：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const source = document.createElement('canvas');
    const ops: EditOp[] = [{ type: 'crop', rect: { x: 10, y: 10, w: 80, h: 40 } }];
    // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const out = renderOps(source, 200, 200, ops);
    expect(out.width).toBe(80);
    expect(out.height).toBe(40);
  });

  // 测试用例：验证「runs pixel adjustment pass when an adjust op exists」场景，锁定 canvas Render 的用户可见行为。
  it('runs pixel adjustment pass when an adjust op exists', () => {
    // 局部常量 ctx：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ctx = stubCanvas();
    // 局部常量 source：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const source = document.createElement('canvas');
    const ops: EditOp[] = [
      { type: 'adjust', params: { brightness: 10, contrast: 0, saturation: 0, grayscale: false, invert: false } }
    ];
    renderOps(source, 4, 4, ops);
    expect(ctx.getImageData).toHaveBeenCalled();
    expect(ctx.putImageData).toHaveBeenCalled();
  });

  // 测试用例：验证「skips the pixel pass for an all-neutral adjust op」场景，锁定 canvas Render 的用户可见行为。
  it('skips the pixel pass for an all-neutral adjust op', () => {
    // 局部常量 ctx：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ctx = stubCanvas();
    // 局部常量 source：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const source = document.createElement('canvas');
    const ops: EditOp[] = [
      { type: 'adjust', params: { brightness: 0, contrast: 0, saturation: 0, grayscale: false, invert: false } }
    ];
    renderOps(source, 4, 4, ops);
    expect(ctx.getImageData).not.toHaveBeenCalled();
    expect(ctx.putImageData).not.toHaveBeenCalled();
  });
});
