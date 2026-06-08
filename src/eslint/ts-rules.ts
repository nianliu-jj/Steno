/**
 * @file Lint 规则配置 - ts rules
 *
 * 组织 ts rules 的核心逻辑、类型和协作边界，供 Lint 规则配置 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import type { Linter } from 'eslint';

// 类型 TsPlugin：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
interface TsPlugin {
  configs: {
    base: { rules: Linter.RulesRecord };
    'eslint-recommended': { overrides: Array<{ rules: Linter.RulesRecord }> };
    strict: { rules: Linter.RulesRecord };
  };
}

// 函数 buildTsRules：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function buildTsRules(pluginTs: TsPlugin): Linter.RulesRecord {
  const { rules: recommendedRules } = pluginTs.configs['eslint-recommended'].overrides[0];
  return {
    ...pluginTs.configs.base.rules,
    ...recommendedRules,
    ...pluginTs.configs.strict.rules,
    '@typescript-eslint/consistent-type-imports': [
      'error',
      {
        prefer: 'type-imports',
        disallowTypeAnnotations: false
      }
    ],
    '@typescript-eslint/no-empty-interface': ['error', { allowSingleExtends: true }],
    'no-redeclare': 'off',
    '@typescript-eslint/no-redeclare': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        vars: 'all',
        args: 'all',
        ignoreRestSiblings: false,
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_'
      }
    ],
    'no-use-before-define': 'off',
    '@typescript-eslint/no-use-before-define': [
      'error',
      {
        functions: false,
        classes: false,
        variables: true
      }
    ],
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/consistent-type-definitions': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/unified-signatures': 'off'
  };
}
