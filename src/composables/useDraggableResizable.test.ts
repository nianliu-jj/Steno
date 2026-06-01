import { describe, expect, it } from 'vitest';

import { useDraggableResizable } from './useDraggableResizable';

function make() {
  return useDraggableResizable({
    initialX: 100,
    initialY: 80,
    initialWidth: 760,
    initialHeight: 580,
    minWidth: 480,
    minHeight: 420,
  });
}

describe('useDraggableResizable', () => {
  it('moves by delta', () => {
    const m = make();
    m.moveBy(20, -10);
    expect(m.x.value).toBe(120);
    expect(m.y.value).toBe(70);
  });

  it('clamps resize to min bounds', () => {
    const m = make();
    m.resizeBy(-9999, -9999);
    expect(m.width.value).toBe(480);
    expect(m.height.value).toBe(420);
  });

  it('clamps resize to max after setMaxSize', () => {
    const m = make();
    m.setMaxSize(1000, 800);
    m.resizeBy(9999, 9999);
    expect(m.width.value).toBe(1000);
    expect(m.height.value).toBe(800);
  });
});
