import { defineConfig } from '@soybeanjs/eslint-config-vue';

export default [
  { ignores: ['dist/**', 'src-tauri/target/**', 'src-tauri/gen/**'] },
  ...(await defineConfig({
    'vue/component-name-in-template-casing': [
      'warn',
      'PascalCase',
      {
        registeredComponentsOnly: false,
        ignores: ['/^icon-/']
      }
    ]
  }))
];
