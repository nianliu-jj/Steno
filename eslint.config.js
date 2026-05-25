import { defineConfig } from '@soybeanjs/eslint-config-vue';

export default [
  { ignores: ['dist/**', 'src-tauri/target/**', 'src-tauri/gen/**', '.worktrees/**', 'agentignore/**'] },
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
