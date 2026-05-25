/**
 * @file 应用主题变量定义
 *
 * 使用 CSS 自定义属性（`--app-*`）实现亮/暗双主题。
 * 所有颜色值使用 OKLCH 色彩空间，确保感知均匀的明暗过渡。
 *
 * **使用方式**：
 * - `App.vue` 在根节点绑定 `:style="appThemeVars"`，将所有变量注入 DOM
 * - 子组件通过 `var(--app-bg)` / `var(--app-accent)` 等引用，无需感知当前主题
 * - `MainWorkbenchShell` 的 scoped CSS 通过局部变量映射 `var(--app-*)` 到组件变量
 */

/**
 * 应用主题 CSS 变量集合。
 *
 * 每个变量名以 `--app-` 为前缀，值使用 OKLCH 颜色函数。
 * 在 `App.vue` 中通过 `:style` 绑定到 `.app-theme-root`，
 * 所有子组件通过 `var(--app-*)` 引用，天然支持主题切换。
 *
 * **OKLCH 颜色格式说明**：
 * `oklch(L C H)` — L=亮度(0-1), C=饱和度, H=色相角度
 * 例如 `oklch(97% 0.014 78)` = 高亮度、低饱和、暖黄色调
 */
export interface AppThemeVars extends Record<`--${string}`, string> {
  /** 页面背景色。 */
  '--app-bg': string;
  /** 卡片/面板等表层背景色。 */
  '--app-surface': string;
  /** 第二层表面（侧边栏等）。 */
  '--app-surface-2': string;
  /** 主文字颜色。 */
  '--app-fg': string;
  /** 次要文字颜色（标签、描述等）。 */
  '--app-muted': string;
  /** 极淡文字颜色（占位符、分隔线等）。 */
  '--app-faint': string;
  /** 边框颜色。 */
  '--app-border': string;
  /** 主题强调色（按钮、选中态、链接等）。 */
  '--app-accent': string;
  /** 主题强调色的柔和变体（hover 背景等）。 */
  '--app-accent-soft': string;
}

/**
 * Naive UI 主题覆盖变量。
 *
 * 仅覆盖品牌色（primary 系列），其余组件样式由 Naive UI 的 `NConfigProvider`
 * 配合 `darkTheme` / 默认主题自动推导。
 */
export const themeVars = {
  colors: {
    /** 主品牌色（暖棕橙）。 */
    primary: '#A85F32',
    /** 主品牌色 hover 态。 */
    primaryHover: '#B86938',
    /** 主品牌色 pressed 态。 */
    primaryPressed: '#8E4F27',
    /** 主品牌色辅助色（淡棕）。 */
    primarySuppl: '#D6A27B',
  },
};

/** 亮色主题 CSS 变量集合。背景近白、文字深棕、强调色暖橙。 */
const LIGHT_THEME_VARS: AppThemeVars = {
  '--app-bg': 'oklch(97% 0.014 78)',
  '--app-surface': 'oklch(99% 0.006 78)',
  '--app-surface-2': 'oklch(98% 0.008 78)',
  '--app-fg': 'oklch(20% 0.02 70)',
  '--app-muted': 'oklch(49% 0.018 70)',
  '--app-faint': 'oklch(70% 0.014 70)',
  '--app-border': 'oklch(88% 0.012 78)',
  '--app-accent': 'oklch(61% 0.13 42)',
  '--app-accent-soft': 'oklch(94% 0.034 42)',
};

/** 暗色主题 CSS 变量集合。背景深灰黑、文字浅灰白。 */
const DARK_THEME_VARS: AppThemeVars = {
  '--app-bg': 'oklch(19% 0.01 70)',
  '--app-surface': 'oklch(24% 0.012 70)',
  '--app-surface-2': 'oklch(28% 0.014 70)',
  '--app-fg': 'oklch(93% 0.012 78)',
  '--app-muted': 'oklch(72% 0.014 74)',
  '--app-faint': 'oklch(55% 0.012 72)',
  '--app-border': 'oklch(35% 0.012 70)',
  '--app-accent': 'oklch(68% 0.13 42)',
  '--app-accent-soft': 'oklch(32% 0.04 42)',
};

/**
 * 根据暗色/亮色模式返回对应的 CSS 变量集合。
 *
 * @param isDark - `true` 返回暗色主题变量，`false` 返回亮色主题变量
 * @returns 完整的 `AppThemeVars` 对象，可直接绑定到 `:style`
 *
 * @example
 * ```ts
 * const isDark = useDark(); // @vueuse/core
 * const appThemeVars = computed(() => getAppThemeVars(isDark.value));
 * // <div :style="appThemeVars">...</div>
 * ```
 */
export function getAppThemeVars(isDark: boolean): AppThemeVars {
  return isDark ? DARK_THEME_VARS : LIGHT_THEME_VARS;
}
