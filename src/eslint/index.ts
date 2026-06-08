/**
 * @file Lint 规则配置 - eslint
 *
 * 组织 eslint 的核心逻辑、类型和协作边界，供 Lint 规则配置 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import type { Linter } from 'eslint';
import { interopDefault } from './shared.ts';
import { buildTsRules } from './ts-rules.ts';
import { buildVueRules } from './vue-rules.ts';

// 函数 defineConfig：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function defineConfig(overrides: Linter.RulesRecord = {}): Promise<Linter.Config[]> {
  const [pluginVue, parserVue, pluginTs] = (await Promise.all([
    interopDefault(import('eslint-plugin-vue')),
    interopDefault(import('vue-eslint-parser')),
    interopDefault(import('@typescript-eslint/eslint-plugin'))
  ])) as [any, any, any];

  // 局部常量 tsRules：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const tsRules = buildTsRules(pluginTs);
  // 局部常量 vueRules：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const vueRules = buildVueRules(pluginVue);

  return [
    { plugins: { vue: pluginVue } },
    {
      files: ['**/*.vue'],
      languageOptions: {
        parser: parserVue,
        parserOptions: {
          ecmaFeatures: { jsx: true },
          extraFileExtensions: ['.vue'],
          parser: '@typescript-eslint/parser',
          sourceType: 'module'
        }
      },
      processor: pluginVue.processors['.vue'],
      plugins: { '@typescript-eslint': pluginTs },
      rules: {
        ...tsRules,
        ...vueRules,
        ...overrides
      }
    }
  ];
}

export default defineConfig;
