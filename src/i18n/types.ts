/**
 * @file 国际化基础设施 - types
 *
 * 组织 types 的核心逻辑、类型和协作边界，供 国际化基础设施 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

export type Locale = 'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'ko' | 'fr' | 'de';

// 类型 LocaleOption：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
export interface LocaleOption {
  value: Locale;
  label: string;
}

// 导出常量 LOCALE_OPTIONS：为其他模块提供稳定配置、选项或 helper 入口。
export const LOCALE_OPTIONS: LocaleOption[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' }
];

// 函数 isValidLocale：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function isValidLocale(value: string): value is Locale {
  return LOCALE_OPTIONS.some(opt => opt.value === value);
}
