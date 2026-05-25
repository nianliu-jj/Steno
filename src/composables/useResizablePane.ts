/**
 * @file 可拖拽调整宽度的面板 composable
 *
 * 用于侧边栏等需要在 min/max 范围内拖拽调整宽度的面板。
 * 支持折叠阈值：拖到小于阈值时自动折叠为最小宽度。
 */

import { ref } from 'vue';

/**
 * 创建可调整宽度的面板状态。
 *
 * @param options - 面板配置
 * @param options.initialWidth - 初始宽度（px）
 * @param options.minWidth - 最小宽度（px），折叠时也保持此值
 * @param options.maxWidth - 最大宽度（px）
 * @param options.collapseThreshold - 可选折叠阈值；拖到 ≤ 此值时自动折叠到 `minWidth`
 * @returns `{ width, collapsed, setWidth, expand }`
 *
 * @example
 * ```ts
 * const pane = useResizablePane({
 *   initialWidth: 220, minWidth: 58, maxWidth: 320, collapseThreshold: 72,
 * });
 * // pointermove 时
 * pane.setWidth(originWidth + deltaX);
 * // 点击展开按钮时
 * pane.expand();
 * ```
 */
export function useResizablePane(options: {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  collapseThreshold?: number;
}) {
  /** 当前面板宽度（响应式）。折叠时保持为 `minWidth`。 */
  const width = ref(options.initialWidth);
  /** 是否处于折叠状态。 */
  const collapsed = ref(false);
  /** 上次展开时的宽度，用于 `expand()` 恢复。 */
  const lastExpandedWidth = ref(options.initialWidth);

  /**
   * 设置面板宽度。
   *
   * 自动 clamp 到 `[minWidth, maxWidth]` 范围。
   * 若设置了 `collapseThreshold` 且新宽度 ≤ 阈值，自动折叠为 `minWidth`。
   *
   * @param next - 目标宽度（会被 clamp）
   */
  function setWidth(next: number) {
    // clamp 到有效范围
    const clamped = Math.min(options.maxWidth, Math.max(options.minWidth, next));

    // 折叠逻辑：宽度小于阈值 → 折叠为最小宽度
    if (options.collapseThreshold !== undefined && clamped <= options.collapseThreshold) {
      collapsed.value = true;
      width.value = options.minWidth;
      return;
    }

    collapsed.value = false;
    width.value = clamped;
    lastExpandedWidth.value = clamped; // 记住展开态宽度，供 expand() 恢复
  }

  /**
   * 展开面板 — 恢复到上次折叠前记录的宽度。
   *
   * 不会恢复到超过 `maxWidth`，因为 `lastExpandedWidth` 本身已被 clamp。
   */
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
