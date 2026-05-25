/**
 * @file Vite 环境类型声明
 *
 * 扩展 TypeScript 对 Vite 特有特性的类型支持：
 * - `.vue` 单文件组件的默认导出类型
 * - `import.meta.env` 环境变量类型
 * - Vite 构建时注入的全局常量
 */

/// <reference types="vite/client" />

/**
 * Vue 单文件组件（`.vue`）的 TypeScript 模块声明。
 *
 * 使得 `import Foo from './Foo.vue'` 在 TS 中不报错，
 * 导出类型为 Vue 的通用 `DefineComponent`。
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

/**
 * Vite 环境变量类型扩展。
 *
 * 对应项目根目录下的 `.env` / `.env.development` / `.env.production` 文件。
 * 只有以 `VITE_` 为前缀的变量会被 Vite 暴露给客户端代码。
 */
interface ImportMetaEnv {
  /** 应用标题，显示在窗口标题栏和 about 页面。 */
  readonly VITE_APP_TITLE: string;
  /** API 基础 URL（当前项目为 Tauri IPC，此变量预留）。 */
  readonly VITE_BASE_URL: string;
  /** Source Map 模式（`'inline'` / `'hidden'` / `undefined`）。 */
  readonly VITE_SOURCE_MAP?: string;
  /** Vue DevTools 的"在编辑器中打开"功能的目标编辑器路径模板。 */
  readonly VITE_DEVTOOLS_LAUNCH_EDITOR?: string;
}

/** 扩展 Vite 的 `import.meta` 类型，使 `import.meta.env` 具有正确的类型推导。 */
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * 构建时间戳，由 Vite 插件在构建时注入为全局常量。
 *
 * @example
 * ```ts
 * console.log(`Build at: ${BUILD_TIME}`);
 * // Build at: 2025-06-15T10:30:00.000Z
 * ```
 */
declare const BUILD_TIME: string;
