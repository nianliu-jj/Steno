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
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [vue(), vueJsx()],
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/.worktrees/**'],
  },
});
