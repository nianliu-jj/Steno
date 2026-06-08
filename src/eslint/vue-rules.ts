/**
 * @file Lint 规则配置 - vue rules
 *
 * 组织 vue rules 的核心逻辑、类型和协作边界，供 Lint 规则配置 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import type { Linter } from 'eslint';

// 类型 VuePlugin：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
interface VuePlugin {
  configs: Record<string, { rules?: Linter.RulesRecord }>;
}

// 函数 buildVueRules：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function buildVueRules(pluginVue: VuePlugin): Linter.RulesRecord {
  // 局部常量 vueRecommendedRules：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const vueRecommendedRules = ['essential', 'strongly-recommended', 'recommended'].reduce<Linter.RulesRecord>(
    (preRules, key) => ({ ...preRules, ...pluginVue.configs[key]?.rules }),
    {}
  );

  return {
    ...pluginVue.configs.base?.rules,
    ...vueRecommendedRules,
    'vue/block-order': ['warn', { order: ['script', 'template', 'style'] }],
    'vue/component-api-style': ['warn', ['script-setup', 'composition']],
    'vue/component-name-in-template-casing': [
      'warn',
      'PascalCase',
      {
        registeredComponentsOnly: false,
        ignores: []
      }
    ],
    'vue/component-options-name-casing': ['warn', 'PascalCase'],
    'vue/custom-event-name-casing': ['warn', 'camelCase'],
    'vue/define-emits-declaration': ['warn', 'type-based'],
    'vue/define-macros-order': 'off',
    'vue/define-props-declaration': ['warn', 'type-based'],
    'vue/html-comment-content-newline': 'warn',
    'vue/html-self-closing': 'off',
    'vue/max-attributes-per-line': 'off',
    'vue/multi-word-component-names': 'off',
    'vue/next-tick-style': ['warn', 'promise'],
    'vue/no-duplicate-attr-inheritance': 'warn',
    'vue/no-required-prop-with-default': 'warn',
    'vue/no-reserved-component-names': 'off',
    'vue/no-static-inline-styles': 'off',
    'vue/no-template-target-blank': 'error',
    'vue/no-this-in-before-route-enter': 'error',
    'vue/no-undef-properties': 'warn',
    'vue/no-unsupported-features': 'warn',
    'vue/no-unused-emit-declarations': 'warn',
    'vue/no-unused-properties': 'warn',
    'vue/no-unused-refs': 'warn',
    'vue/no-use-v-else-with-v-for': 'error',
    'vue/no-useless-mustaches': 'warn',
    'vue/no-useless-v-bind': 'error',
    'vue/no-v-text': 'warn',
    'vue/padding-line-between-blocks': 'warn',
    'vue/prefer-define-options': 'warn',
    'vue/prefer-separate-static-class': 'warn',
    'vue/prop-name-casing': ['warn', 'camelCase'],
    'vue/require-macro-variable-name': [
      'warn',
      {
        defineProps: 'props',
        defineEmits: 'emit',
        defineSlots: 'slots',
        useSlots: 'slots',
        useAttrs: 'attrs'
      }
    ],
    'vue/singleline-html-element-content-newline': 'off',
    'vue/valid-define-options': 'warn',
    'vue/valid-v-slot': 'off'
  };
}
