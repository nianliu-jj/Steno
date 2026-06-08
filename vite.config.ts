/**
 * @file 项目配置 - vite.config
 *
 * 组织 vite.config 的核心逻辑、类型和协作边界，供 项目配置 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { setupVitePlugins } from './build/plugins';
import { getBuildTime } from './build/config';

export default defineConfig(configEnv => {
  // 局部常量 env：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const env = loadEnv(configEnv.mode, process.cwd());
  // 局部常量 buildTime：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const buildTime = getBuildTime();

  return {
    base: env.VITE_BASE_URL || '/',
    resolve: {
      alias: {
        '~': fileURLToPath(new URL('./', import.meta.url)),
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    plugins: setupVitePlugins(env, buildTime),
    define: {
      BUILD_TIME: JSON.stringify(buildTime)
    },
    // Tauri 在自己的窗口里跑，不要清屏，避免吞掉 cargo 日志
    clearScreen: false,
    // 让前端可以读 TAURI_ 前缀的环境变量
    envPrefix: ['VITE_', 'TAURI_'],
    server: {
      host: '0.0.0.0',
      port: 21420,
      strictPort: true,
      open: false
    },
    preview: {
      port: 1421,
      strictPort: true
    },
    test: {
      exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/.worktrees/**']
    },
    build: {
      target: 'esnext',
      reportCompressedSize: false,
      sourcemap: env.VITE_SOURCE_MAP === 'Y',
      commonjsOptions: {
        ignoreTryCatch: false
      },
      // 所有窗口（main / floating / sticky / canvas / settings / zen）
      // 共用 index.html，按 Tauri 窗口 label 在前端 ui store 派生 mode。
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url))
        }
      }
    }
  };
});
