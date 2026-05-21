import { ref } from 'vue';

export function useResizablePane(options: {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  collapseThreshold?: number;
}) {
  const width = ref(options.initialWidth);
  const collapsed = ref(false);
  const lastExpandedWidth = ref(options.initialWidth);

  function setWidth(next: number) {
    const clamped = Math.min(options.maxWidth, Math.max(options.minWidth, next));

    if (options.collapseThreshold !== undefined && clamped <= options.collapseThreshold) {
      collapsed.value = true;
      width.value = options.minWidth;
      return;
    }

    collapsed.value = false;
    width.value = clamped;
    lastExpandedWidth.value = clamped;
  }

  function expand() {
    collapsed.value = false;
    width.value = lastExpandedWidth.value;
  }

  return {
    width,
    collapsed,
    setWidth,
    expand,
  };
}
