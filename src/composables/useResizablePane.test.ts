import { describe, expect, it } from 'vitest';

import { useResizablePane } from './useResizablePane';

describe('useResizablePane', () => {
  it('collapses when dragged to the icon threshold and restores after expand', () => {
    const pane = useResizablePane({
      initialWidth: 220,
      minWidth: 58,
      maxWidth: 320,
      collapseThreshold: 72,
    });

    pane.setWidth(68);
    expect(pane.collapsed.value).toBe(true);
    expect(pane.width.value).toBe(58);

    pane.expand();
    expect(pane.collapsed.value).toBe(false);
    expect(pane.width.value).toBe(220);
  });

  it('clamps width within min and max bounds while expanded', () => {
    const pane = useResizablePane({
      initialWidth: 220,
      minWidth: 58,
      maxWidth: 320,
    });

    pane.setWidth(999);
    expect(pane.width.value).toBe(320);
    expect(pane.collapsed.value).toBe(false);

    pane.setWidth(10);
    expect(pane.width.value).toBe(58);
    expect(pane.collapsed.value).toBe(false);
  });
});
