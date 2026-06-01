import { describe, expect, it } from 'vitest';

import {
  applyAdjustments,
  clampCropRect,
  computeOutputSize,
  cropRectFromFraction,
  isNeutralAdjust,
  NEUTRAL_ADJUST,
  type EditOp,
} from './imageOps';

describe('applyAdjustments', () => {
  it('returns identical pixels for neutral params', () => {
    const out = applyAdjustments(new Uint8ClampedArray([10, 20, 30, 255]), NEUTRAL_ADJUST);
    expect(Array.from(out)).toEqual([10, 20, 30, 255]);
  });

  it('inverts colors and preserves alpha', () => {
    const out = applyAdjustments(new Uint8ClampedArray([0, 0, 0, 128]), { ...NEUTRAL_ADJUST, invert: true });
    expect(Array.from(out)).toEqual([255, 255, 255, 128]);
  });

  it('raises black to white at +100 brightness', () => {
    const out = applyAdjustments(new Uint8ClampedArray([0, 0, 0, 255]), { ...NEUTRAL_ADJUST, brightness: 100 });
    expect(Array.from(out)).toEqual([255, 255, 255, 255]);
  });

  it('collapses to luma on grayscale', () => {
    const out = applyAdjustments(new Uint8ClampedArray([255, 0, 0, 255]), { ...NEUTRAL_ADJUST, grayscale: true });
    expect(Array.from(out)).toEqual([76, 76, 76, 255]);
  });
});

describe('computeOutputSize', () => {
  it('crop sets size to rect', () => {
    const ops: EditOp[] = [{ type: 'crop', rect: { x: 0, y: 0, w: 100, h: 50 } }];
    expect(computeOutputSize(ops, 200, 200)).toEqual({ w: 100, h: 50 });
  });

  it('rotate 90 swaps dimensions', () => {
    expect(computeOutputSize([{ type: 'rotate', deg: 90 }], 200, 100)).toEqual({ w: 100, h: 200 });
  });

  it('rotate 180 keeps dimensions', () => {
    expect(computeOutputSize([{ type: 'rotate', deg: 180 }], 200, 100)).toEqual({ w: 200, h: 100 });
  });

  it('chains crop then rotate 90', () => {
    const ops: EditOp[] = [
      { type: 'crop', rect: { x: 0, y: 0, w: 100, h: 50 } },
      { type: 'rotate', deg: 90 },
    ];
    expect(computeOutputSize(ops, 200, 200)).toEqual({ w: 50, h: 100 });
  });
});

describe('clampCropRect', () => {
  it('clamps rect within bounds', () => {
    expect(clampCropRect({ x: -10, y: 5, w: 9999, h: 20 }, 100, 100)).toEqual({ x: 0, y: 5, w: 100, h: 20 });
  });
});

describe('cropRectFromFraction', () => {
  it('maps a centered half-size selection to pixels', () => {
    expect(cropRectFromFraction({ fx: 0.25, fy: 0.25, fw: 0.5, fh: 0.5 }, 200, 100)).toEqual({ x: 50, y: 25, w: 100, h: 50 });
  });

  it('clamps an out-of-range selection', () => {
    expect(cropRectFromFraction({ fx: -0.1, fy: 0, fw: 2, fh: 1 }, 100, 80)).toEqual({ x: 0, y: 0, w: 100, h: 80 });
  });
});

describe('isNeutralAdjust', () => {
  it('is true for neutral params', () => {
    expect(isNeutralAdjust(NEUTRAL_ADJUST)).toBe(true);
    expect(isNeutralAdjust({ ...NEUTRAL_ADJUST })).toBe(true);
  });

  it('is false when any field differs', () => {
    expect(isNeutralAdjust({ ...NEUTRAL_ADJUST, brightness: 1 })).toBe(false);
    expect(isNeutralAdjust({ ...NEUTRAL_ADJUST, grayscale: true })).toBe(false);
    expect(isNeutralAdjust({ ...NEUTRAL_ADJUST, invert: true })).toBe(false);
  });
});
