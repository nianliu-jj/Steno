// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderOps } from './canvasRender';
import type { EditOp } from './imageOps';

function stubCanvas() {
  const ctx = {
    drawImage: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    })),
    putImageData: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  return ctx;
}

afterEach(() => vi.restoreAllMocks());

describe('renderOps', () => {
  it('produces a canvas with rotated dimensions for rotate 90', () => {
    stubCanvas();
    const source = document.createElement('canvas');
    const ops: EditOp[] = [{ type: 'rotate', deg: 90 }];
    const out = renderOps(source, 200, 100, ops);
    expect(out.width).toBe(100);
    expect(out.height).toBe(200);
  });

  it('crops to the rect size', () => {
    stubCanvas();
    const source = document.createElement('canvas');
    const ops: EditOp[] = [{ type: 'crop', rect: { x: 10, y: 10, w: 80, h: 40 } }];
    const out = renderOps(source, 200, 200, ops);
    expect(out.width).toBe(80);
    expect(out.height).toBe(40);
  });

  it('runs pixel adjustment pass when an adjust op exists', () => {
    const ctx = stubCanvas();
    const source = document.createElement('canvas');
    const ops: EditOp[] = [{ type: 'adjust', params: { brightness: 10, contrast: 0, saturation: 0, grayscale: false, invert: false } }];
    renderOps(source, 4, 4, ops);
    expect(ctx.getImageData).toHaveBeenCalled();
    expect(ctx.putImageData).toHaveBeenCalled();
  });

  it('skips the pixel pass for an all-neutral adjust op', () => {
    const ctx = stubCanvas();
    const source = document.createElement('canvas');
    const ops: EditOp[] = [{ type: 'adjust', params: { brightness: 0, contrast: 0, saturation: 0, grayscale: false, invert: false } }];
    renderOps(source, 4, 4, ops);
    expect(ctx.getImageData).not.toHaveBeenCalled();
    expect(ctx.putImageData).not.toHaveBeenCalled();
  });
});
