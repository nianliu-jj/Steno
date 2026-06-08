/**
 * @file 项目配置 - eslint.config
 *
 * 组织 eslint.config 的核心逻辑、类型和协作边界，供 项目配置 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

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
