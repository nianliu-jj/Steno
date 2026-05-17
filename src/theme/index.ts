export interface AppThemeVars extends Record<`--${string}`, string> {
  '--app-bg': string;
  '--app-surface': string;
  '--app-surface-2': string;
  '--app-fg': string;
  '--app-muted': string;
  '--app-faint': string;
  '--app-border': string;
  '--app-accent': string;
  '--app-accent-soft': string;
}

export const themeVars = {
  colors: {
    primary: '#A85F32',
    primaryHover: '#B86938',
    primaryPressed: '#8E4F27',
    primarySuppl: '#D6A27B',
  },
};

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

export function getAppThemeVars(isDark: boolean): AppThemeVars {
  return isDark ? DARK_THEME_VARS : LIGHT_THEME_VARS;
}
