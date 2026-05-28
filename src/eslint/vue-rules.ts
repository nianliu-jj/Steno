import type { Linter } from 'eslint';

interface VuePlugin {
  configs: Record<string, { rules?: Linter.RulesRecord }>;
}

export function buildVueRules(pluginVue: VuePlugin): Linter.RulesRecord {
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
