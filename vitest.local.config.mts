/**
 * @file 项目配置 - vitest.local.config
 *
 * 组织 vitest.local.config 的核心逻辑、类型和协作边界，供 项目配置 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// 本地测试用最小 vitest 配置（不提交）。
// 规避默认 vite.config.ts 在本机 Node 下加载 ./build/plugins 触发的 ERR_INTERNAL_ASSERTION。
// 仅提供 .vue 转换 + 路径别名 + 测试 exclude，与真实配置的 test 行为等价。
import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  plugins: [vue(), vueJsx()],
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/.worktrees/**']
  }
});
