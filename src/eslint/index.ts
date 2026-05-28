import type { Linter } from 'eslint';
import { interopDefault } from './shared.ts';
import { buildTsRules } from './ts-rules.ts';
import { buildVueRules } from './vue-rules.ts';

export async function defineConfig(overrides: Linter.RulesRecord = {}): Promise<Linter.Config[]> {
  const [pluginVue, parserVue, pluginTs] = (await Promise.all([
    interopDefault(import('eslint-plugin-vue')),
    interopDefault(import('vue-eslint-parser')),
    interopDefault(import('@typescript-eslint/eslint-plugin'))
  ])) as [any, any, any];

  const tsRules = buildTsRules(pluginTs);
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
