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

// 类型 Messages：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
type Messages = typeof zhCN;

const messages: Record<Locale, Messages> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  en,
  ja,
  ko,
  fr,
  de
};

// 类型 I18nState：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
interface I18nState {
  locale: Locale;
}

/**
 * 通过点号路径访问嵌套对象属性。
 * 例如 `getNestedValue(obj, 'settings.general.title')`
 */
function getNestedValue(obj: Record<string, unknown>, path: string): string {
  // 局部常量 keys：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return path;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : path;
}

// 类型 I18nInstance：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
export interface I18nInstance {
  state: I18nState;
  t: (key: string) => string;
  locale: ComputedRef<Locale>;
}

// 导出常量 I18N_KEY：为其他模块提供稳定配置、选项或 helper 入口。
export const I18N_KEY: InjectionKey<I18nInstance> = Symbol('i18n');

// 函数 createI18n：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function createI18n(initialLocale: Locale = 'zh-CN'): I18nInstance {
  // 局部常量 state：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const state = reactive<I18nState>({ locale: initialLocale });

  // 函数 t：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function t(key: string): string {
    // 局部常量 msg：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const msg = messages[state.locale];
    return getNestedValue(msg as unknown as Record<string, unknown>, key);
  }

  // 局部常量 locale：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const locale = computed(() => state.locale);

  return { state, t, locale };
}

// 函数 useI18n：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function useI18n(): I18nInstance {
  // 局部常量 i18n：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const i18n = inject(I18N_KEY);
  if (!i18n) {
    throw new Error('useI18n() must be used after createI18n() is provided via provide(I18N_KEY, ...)');
  }
  return i18n;
}

export type { Messages };
