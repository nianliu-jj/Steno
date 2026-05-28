import { defineConfig } from './src/eslint/index.ts';

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
