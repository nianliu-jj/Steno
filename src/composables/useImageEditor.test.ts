import { describe, expect, it } from 'vitest';

import { useImageEditor } from './useImageEditor';
import { NEUTRAL_ADJUST } from '@/utils/imageOps';

describe('useImageEditor', () => {
  it('pushes transform ops and tracks dirty/undo state', () => {
    const e = useImageEditor();
    expect(e.dirty.value).toBe(false);
    expect(e.canUndo.value).toBe(false);

    e.rotate(90);
    e.flip('h');
    expect(e.ops.value.map(o => o.type)).toEqual(['rotate', 'flip']);
    expect(e.dirty.value).toBe(true);
    expect(e.canUndo.value).toBe(true);
  });

  it('collapses consecutive adjusts into one trailing op', () => {
    const e = useImageEditor();
    e.rotate(90);
    e.setAdjust({ ...NEUTRAL_ADJUST, brightness: 10 });
    e.setAdjust({ ...NEUTRAL_ADJUST, brightness: 40 });
    expect(e.ops.value.map(o => o.type)).toEqual(['rotate', 'adjust']);
    expect(e.currentAdjust.value.brightness).toBe(40);
  });

  it('undo/redo/reset operate on the stack', () => {
    const e = useImageEditor();
    e.rotate(90);
    e.flip('v');

    e.undo();
    expect(e.ops.value.map(o => o.type)).toEqual(['rotate']);
    expect(e.canRedo.value).toBe(true);

    e.redo();
    expect(e.ops.value.map(o => o.type)).toEqual(['rotate', 'flip']);

    e.reset();
    expect(e.ops.value).toEqual([]);
    expect(e.canUndo.value).toBe(false);
    expect(e.canRedo.value).toBe(false);
  });

  it('pushing a new op clears the redo stack', () => {
    const e = useImageEditor();
    e.rotate(90);
    e.undo();
    e.flip('h');
    expect(e.canRedo.value).toBe(false);
  });
});
