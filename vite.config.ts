import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { setupVitePlugins } from './build/plugins';
import { getBuildTime } from './build/config';

interface ViteEnv {
  VITE_BASE_URL?: string;
  VITE_APP_TITLE?: string;
  VITE_SOURCE_MAP?: string;
  VITE_DEVTOOLS_LAUNCH_EDITOR?: string;
}

export default defineConfig(configEnv => {
  const env = loadEnv(configEnv.mode, process.cwd()) as unknown as ViteEnv;
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
      port: 1420,
      strictPort: true,
      open: false
    },
    preview: {
      port: 1421,
      strictPort: true
    },
    build: {
      target: 'esnext',
      reportCompressedSize: false,
      sourcemap: env.VITE_SOURCE_MAP === 'Y',
      commonjsOptions: {
        ignoreTryCatch: false
      }
    }
  };
});
