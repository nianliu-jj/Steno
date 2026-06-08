/**
 * @file Steno 应用入口
 *
 * 初始化 Vue 3 应用、Pinia 状态管理、UnoCSS 原子样式和全局 CSS。
 * 挂载到 `index.html` 中的 `#app` 容器。
 *
 * **启动顺序**：
 * 1. `createApp(App)` — 创建 Vue 应用实例，`App.vue` 为根组件
 * 2. `app.use(createPinia())` — 注册 Pinia，所有 `use*Store()` 调用从此可用
 * 3. `app.mount('#app')` — 挂载 DOM，触发各组件 `onMounted` 生命周期
 *
 * **注意事项**：
 * - `virtual:uno.css` 由 UnoCSS 插件在 Vite 构建时虚拟生成
 * - Tauri 初始化在 Rust 端 (`src-tauri/src/lib.rs`) 完成，前端不感知
 * - 没有 `router`：页面路由由 `ui store` 的 `WindowMode` + `steno:navigate` 事件驱动
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';
// UnoCSS 虚拟模块 — 由 vite-plugin-unocss 在构建时生成原子 CSS
import 'virtual:uno.css';
// 全局样式（reset、基础排版等）
import './styles/global.css';
import './plugins/echarts';
import App from './App.vue';
import { warmupShiki } from './utils/markdown/shiki';

// 局部常量 app：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const app = createApp(App);
// 注册 Pinia 状态管理 — 所有 store 通过 `defineStore` 定义后即可在组件中注入
app.use(createPinia());
// 挂载到 index.html 中的 <div id="app">
app.mount('#app');

// 应用挂载后再异步预热 Shiki，避免阻塞首屏渲染
type IdleCallbackHandle = (cb: () => void) => unknown;
const scheduleIdle: IdleCallbackHandle =
  typeof (globalThis as { requestIdleCallback?: IdleCallbackHandle }).requestIdleCallback === 'function'
    ? (globalThis as { requestIdleCallback: IdleCallbackHandle }).requestIdleCallback
    : cb => setTimeout(cb, 200);
scheduleIdle(() => {
  void warmupShiki();
});
