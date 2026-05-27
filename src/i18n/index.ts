/**
 * @file 轻量级 i18n composable
 *
 * 不依赖 vue-i18n 外部包，使用 Vue 3 reactive + provide/inject 实现。
 * 语言设置持久化在 settings store 中。
 */

import { computed, inject, reactive, type ComputedRef, type InjectionKey } from 'vue';
import type { Locale } from './types';
import zhCN from './locales/zh-CN';
import zhTW from './locales/zh-TW';
import en from './locales/en';
import ja from './locales/ja';
import ko from './locales/ko';
import fr from './locales/fr';
import de from './locales/de';

type Messages = typeof zhCN;

const messages: Record<Locale, Messages> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  en,
  ja,
  ko,
  fr,
  de,
};

interface I18nState {
  locale: Locale;
}

/**
 * 通过点号路径访问嵌套对象属性。
 * 例如 `getNestedValue(obj, 'settings.general.title')`
 */
function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return path;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : path;
}

export interface I18nInstance {
  state: I18nState;
  t: (key: string) => string;
  locale: ComputedRef<Locale>;
}

export const I18N_KEY: InjectionKey<I18nInstance> = Symbol('i18n');

export function createI18n(initialLocale: Locale = 'zh-CN'): I18nInstance {
  const state = reactive<I18nState>({ locale: initialLocale });

  function t(key: string): string {
    const msg = messages[state.locale];
    return getNestedValue(msg as unknown as Record<string, unknown>, key);
  }

  const locale = computed(() => state.locale);

  return { state, t, locale };
}

export function useI18n(): I18nInstance {
  const i18n = inject(I18N_KEY);
  if (!i18n) {
    throw new Error('useI18n() must be used after createI18n() is provided via provide(I18N_KEY, ...)');
  }
  return i18n;
}

export type { Messages };
