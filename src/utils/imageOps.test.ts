/**
 * @file 前端工具函数 - image Ops
 *
 * 覆盖 image Ops 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { describe, expect, it } from 'vitest';

import {
  applyAdjustments,
  clampCropRect,
  computeOutputSize,
  cropRectFromFraction,
  isNeutralAdjust,
  NEUTRAL_ADJUST,
  // 类型 EditOp：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  type EditOp
} from './imageOps';

// 测试用例：验证「applyAdjustments」场景，锁定 image Ops 的用户可见行为。
describe('applyAdjustments', () => {
  // 测试用例：验证「returns identical pixels for neutral params」场景，锁定 image Ops 的用户可见行为。
  it('returns identical pixels for neutral params', () => {
    // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const out = applyAdjustments(new Uint8ClampedArray([10, 20, 30, 255]), NEUTRAL_ADJUST);
    expect(Array.from(out)).toEqual([10, 20, 30, 255]);
  });

  // 测试用例：验证「inverts colors and preserves alpha」场景，锁定 image Ops 的用户可见行为。
  it('inverts colors and preserves alpha', () => {
    // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const out = applyAdjustments(new Uint8ClampedArray([0, 0, 0, 128]), { ...NEUTRAL_ADJUST, invert: true });
    expect(Array.from(out)).toEqual([255, 255, 255, 128]);
  });

  // 测试用例：验证「raises black to white at +100 brightness」场景，锁定 image Ops 的用户可见行为。
  it('raises black to white at +100 brightness', () => {
    // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const out = applyAdjustments(new Uint8ClampedArray([0, 0, 0, 255]), { ...NEUTRAL_ADJUST, brightness: 100 });
    expect(Array.from(out)).toEqual([255, 255, 255, 255]);
  });

  // 测试用例：验证「collapses to luma on grayscale」场景，锁定 image Ops 的用户可见行为。
  it('collapses to luma on grayscale', () => {
    // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const out = applyAdjustments(new Uint8ClampedArray([255, 0, 0, 255]), { ...NEUTRAL_ADJUST, grayscale: true });
    expect(Array.from(out)).toEqual([76, 76, 76, 255]);
  });
});

// 测试用例：验证「computeOutputSize」场景，锁定 image Ops 的用户可见行为。
describe('computeOutputSize', () => {
  // 测试用例：验证「crop sets size to rect」场景，锁定 image Ops 的用户可见行为。
  it('crop sets size to rect', () => {
    const ops: EditOp[] = [{ type: 'crop', rect: { x: 0, y: 0, w: 100, h: 50 } }];
    expect(computeOutputSize(ops, 200, 200)).toEqual({ w: 100, h: 50 });
  });

  // 测试用例：验证「rotate 90 swaps dimensions」场景，锁定 image Ops 的用户可见行为。
  it('rotate 90 swaps dimensions', () => {
    expect(computeOutputSize([{ type: 'rotate', deg: 90 }], 200, 100)).toEqual({ w: 100, h: 200 });
  });

  // 测试用例：验证「rotate 180 keeps dimensions」场景，锁定 image Ops 的用户可见行为。
  it('rotate 180 keeps dimensions', () => {
    expect(computeOutputSize([{ type: 'rotate', deg: 180 }], 200, 100)).toEqual({ w: 200, h: 100 });
  });

  // 测试用例：验证「chains crop then rotate 90」场景，锁定 image Ops 的用户可见行为。
  it('chains crop then rotate 90', () => {
    const ops: EditOp[] = [
      { type: 'crop', rect: { x: 0, y: 0, w: 100, h: 50 } },
      { type: 'rotate', deg: 90 }
    ];
    expect(computeOutputSize(ops, 200, 200)).toEqual({ w: 50, h: 100 });
  });
});

// 测试用例：验证「clampCropRect」场景，锁定 image Ops 的用户可见行为。
describe('clampCropRect', () => {
  // 测试用例：验证「clamps rect within bounds」场景，锁定 image Ops 的用户可见行为。
  it('clamps rect within bounds', () => {
    expect(clampCropRect({ x: -10, y: 5, w: 9999, h: 20 }, 100, 100)).toEqual({ x: 0, y: 5, w: 100, h: 20 });
  });
});

// 测试用例：验证「cropRectFromFraction」场景，锁定 image Ops 的用户可见行为。
describe('cropRectFromFraction', () => {
  // 测试用例：验证「maps a centered half-size selection to pixels」场景，锁定 image Ops 的用户可见行为。
  it('maps a centered half-size selection to pixels', () => {
    expect(cropRectFromFraction({ fx: 0.25, fy: 0.25, fw: 0.5, fh: 0.5 }, 200, 100)).toEqual({
      x: 50,
      y: 25,
      w: 100,
      h: 50
    });
  });

  // 测试用例：验证「clamps an out-of-range selection」场景，锁定 image Ops 的用户可见行为。
  it('clamps an out-of-range selection', () => {
    expect(cropRectFromFraction({ fx: -0.1, fy: 0, fw: 2, fh: 1 }, 100, 80)).toEqual({ x: 0, y: 0, w: 100, h: 80 });
  });
});

// 测试用例：验证「isNeutralAdjust」场景，锁定 image Ops 的用户可见行为。
describe('isNeutralAdjust', () => {
  // 测试用例：验证「is true for neutral params」场景，锁定 image Ops 的用户可见行为。
  it('is true for neutral params', () => {
    expect(isNeutralAdjust(NEUTRAL_ADJUST)).toBe(true);
    expect(isNeutralAdjust({ ...NEUTRAL_ADJUST })).toBe(true);
  });

  // 测试用例：验证「is false when any field differs」场景，锁定 image Ops 的用户可见行为。
  it('is false when any field differs', () => {
    expect(isNeutralAdjust({ ...NEUTRAL_ADJUST, brightness: 1 })).toBe(false);
    expect(isNeutralAdjust({ ...NEUTRAL_ADJUST, grayscale: true })).toBe(false);
    expect(isNeutralAdjust({ ...NEUTRAL_ADJUST, invert: true })).toBe(false);
  });
});
