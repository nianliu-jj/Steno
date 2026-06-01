import { ref } from 'vue';

export interface DraggableResizableOptions {
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function useDraggableResizable(options: DraggableResizableOptions) {
  const x = ref(options.initialX);
  const y = ref(options.initialY);
  const width = ref(options.initialWidth);
  const height = ref(options.initialHeight);
  const maxWidth = ref(options.maxWidth ?? Number.POSITIVE_INFINITY);
  const maxHeight = ref(options.maxHeight ?? Number.POSITIVE_INFINITY);

  function moveBy(dx: number, dy: number) {
    x.value += dx;
    y.value += dy;
  }

  function resizeBy(dx: number, dy: number) {
    width.value = clamp(width.value + dx, options.minWidth, maxWidth.value);
    height.value = clamp(height.value + dy, options.minHeight, maxHeight.value);
  }

  function setMaxSize(w: number, h: number) {
    maxWidth.value = w;
    maxHeight.value = h;
    width.value = clamp(width.value, options.minWidth, w);
    height.value = clamp(height.value, options.minHeight, h);
  }

  return { x, y, width, height, moveBy, resizeBy, setMaxSize };
}
