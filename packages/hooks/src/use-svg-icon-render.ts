/**
 * @file SVG 图标渲染 Hook
 *
 * 将 Iconify 图标名或本地图标名渲染为 Vue VNode，
 * 支持自定义颜色和字号。
 */

import { h } from 'vue';
import type { Component } from 'vue';

/**
 * 创建 SVG 图标渲染器。
 *
 * @param SvgIcon - SVG 图标组件（接收 `icon` / `localIcon` / `style` props）
 * @returns `{ SvgIconVNode }` — 生成图标 VNode 的工厂函数
 */
export default function useSvgIconRender(SvgIcon: Component) {
  interface IconConfig {
    /** Iconify icon name */
    icon?: string;
    /** Local icon name */
    localIcon?: string;
    /** Icon color */
    color?: string;
    /** Icon size */
    fontSize?: number;
  }

  type IconStyle = Partial<Pick<CSSStyleDeclaration, 'color' | 'fontSize'>>;

  /**
   * Svg icon VNode
   *
   * @param config
   */
  const SvgIconVNode = (config: IconConfig) => {
    const { color, fontSize, icon, localIcon } = config;

    const style: IconStyle = {};

    if (color) {
      style.color = color;
    }
    if (fontSize) {
      style.fontSize = `${fontSize}px`;
    }

    if (!icon && !localIcon) {
      return undefined;
    }

    return () => h(SvgIcon, { icon, localIcon, style });
  };

  return {
    SvgIconVNode
  };
}
