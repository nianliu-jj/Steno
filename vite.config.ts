import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { setupVitePlugins } from './build/plugins';
import { getBuildTime } from './build/config';

export default defineConfig(configEnv => {
  const env = loadEnv(configEnv.mode, process.cwd());
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
      },
      // 主窗口（含浮窗 floating 模式，按 location.hash 路由）独立入口；
      // sticky / canvas / search / settings / zen 是 plan Task 6-8 的占位入口，
      // 当前内容是纯 HTML 文案，等 Task 6/7/8 各自填上 Vue 入口与组件。
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          sticky: fileURLToPath(new URL('./sticky.html', import.meta.url)),
          canvas: fileURLToPath(new URL('./canvas.html', import.meta.url)),
          search: fileURLToPath(new URL('./search.html', import.meta.url)),
          settings: fileURLToPath(new URL('./settings.html', import.meta.url)),
          zen: fileURLToPath(new URL('./zen.html', import.meta.url))
        }
      }
    }
  };
});
