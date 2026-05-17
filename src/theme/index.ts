export interface AppThemeVars {
  bg: string;
  surface: string;
  surface2: string;
  fg: string;
  muted: string;
  faint: string;
  border: string;
  accent: string;
  accentSoft: string;
  stickySurface: string;
  stickySurfaceAlt: string;
  stickyFg: string;
  stickyMuted: string;
  stickyBorder: string;
  stickyEditor: string;
  stickyCode: string;
  stickyQuote: string;
  stickyShadow: string;
  stickyDanger: string;
}

const lightThemeVars: AppThemeVars = {
  bg: 'oklch(97% 0.014 78)',
  surface: 'oklch(99% 0.006 78)',
  surface2: 'oklch(98% 0.008 78)',
  fg: 'oklch(20% 0.02 70)',
  muted: 'oklch(49% 0.018 70)',
  faint: 'oklch(70% 0.014 70)',
  border: 'oklch(88% 0.012 78)',
  accent: 'oklch(61% 0.13 42)',
  accentSoft: 'oklch(94% 0.034 42)',
  stickySurface: 'oklch(98% 0.016 82)',
  stickySurfaceAlt: 'oklch(96% 0.02 82)',
  stickyFg: 'oklch(20% 0.02 70)',
  stickyMuted: 'oklch(49% 0.018 70)',
  stickyBorder: 'oklch(84% 0.012 78)',
  stickyEditor: 'rgba(255, 255, 255, 0.46)',
  stickyCode: 'rgba(0, 0, 0, 0.08)',
  stickyQuote: 'rgba(168, 95, 50, 0.28)',
  stickyShadow: 'rgba(20, 17, 14, 0.16)',
  stickyDanger: '#b33d3d',
};

const darkThemeVars: AppThemeVars = {
  bg: '#15151a',
  surface: '#202025',
  surface2: '#26262c',
  fg: '#eee9e2',
  muted: '#b6aca2',
  faint: '#8f877f',
  border: 'rgba(255, 255, 255, 0.12)',
  accent: '#a85f32',
  accentSoft: 'rgba(168, 95, 50, 0.16)',
  stickySurface: '#202025',
  stickySurfaceAlt: '#2a2a31',
  stickyFg: '#f3ede6',
  stickyMuted: '#b6aca2',
  stickyBorder: 'rgba(255, 255, 255, 0.1)',
  stickyEditor: 'rgba(255, 255, 255, 0.08)',
  stickyCode: 'rgba(255, 255, 255, 0.08)',
  stickyQuote: 'rgba(168, 95, 50, 0.42)',
  stickyShadow: 'rgba(0, 0, 0, 0.32)',
  stickyDanger: '#ff8b8b',
};

export function getAppThemeVars(isDark: boolean): AppThemeVars {
  return isDark ? darkThemeVars : lightThemeVars;
}

export const themeVars = {
  colors: {
    primary: lightThemeVars.accent,
    primaryHover: lightThemeVars.accent,
    primaryPressed: '#8f4f28',
    primarySuppl: lightThemeVars.accentSoft,
  },
};
