import { emit } from '@tauri-apps/api/event';

import type { ThemeMode } from '@/stores/settings';

export const THEME_MODE_CHANGED_EVENT = 'steno:theme-mode-changed';

export type SharedThemeTokenName =
  | 'appBg'
  | 'appSurface'
  | 'appSurfaceMuted'
  | 'appText'
  | 'appTextMuted'
  | 'appTextFaint'
  | 'appBorder'
  | 'appAccent'
  | 'appAccentHover'
  | 'appAccentPressed'
  | 'appAccentSoft'
  | 'appDanger';

type SharedThemeTokens = Record<SharedThemeTokenName, string>;
export type SharedThemeVariant = keyof typeof sharedThemeTokens;
export type ThemeModeChangedPayload = {
  mode: ThemeMode;
};
type LegacyThemeColorVars = {
  primary: string;
  primaryHover: string;
  primaryPressed: string;
  primarySuppl: string;
};

export const sharedThemeTokens: Record<'light' | 'dark', SharedThemeTokens> = {
  light: {
    appBg: '#f5efe6',
    appSurface: '#fffaf3',
    appSurfaceMuted: '#f3eadf',
    appText: '#2b241d',
    appTextMuted: '#6f6257',
    appTextFaint: '#9f9084',
    appBorder: '#d8cab9',
    appAccent: '#a85f32',
    appAccentHover: '#c06b37',
    appAccentPressed: '#8f4f29',
    appAccentSoft: '#f2dfd0',
    appDanger: '#c2504b',
  },
  dark: {
    appBg: '#17171c',
    appSurface: '#202025',
    appSurfaceMuted: '#292932',
    appText: '#f1e8df',
    appTextMuted: '#bcaea1',
    appTextFaint: '#8f8379',
    appBorder: '#3a332d',
    appAccent: '#cf7a43',
    appAccentHover: '#df8b53',
    appAccentPressed: '#b86634',
    appAccentSoft: '#3b2a21',
    appDanger: '#db6c63',
  },
};

export function resolveThemeVariant(
  mode: ThemeMode,
  preferredDark: boolean,
): SharedThemeVariant {
  if (mode === 'system') {
    return preferredDark ? 'dark' : 'light';
  }

  return mode;
}

export function themeTokensToCssVars(tokens: SharedThemeTokens): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tokens).map(([key, value]) => [
      `--${key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)}`,
      value,
    ]),
  );
}

export async function broadcastThemeModeChanged(mode: ThemeMode): Promise<void> {
  await emit(THEME_MODE_CHANGED_EVENT, {
    mode,
  } satisfies ThemeModeChangedPayload);
}

function legacyThemeColorVarsFromTokens(tokens: SharedThemeTokens): LegacyThemeColorVars {
  return {
    primary: tokens.appAccent,
    primaryHover: tokens.appAccentHover,
    primaryPressed: tokens.appAccentPressed,
    primarySuppl: tokens.appAccentSoft,
  };
}

export const themeVars = {
  colors: legacyThemeColorVarsFromTokens(sharedThemeTokens.light),
};
