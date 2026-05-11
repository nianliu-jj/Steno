// ui store：当前进程内"窗口承担的角色"。
//
// 多窗口架构（plan 3）下，每个 webview 加载同一个 index.html，但 URL hash/query
// 不同。例：sticky 便签是 `index.html#sticky?id=<uuid>`，画布是 `#canvas`，等等。
// App.vue 根据 mode 渲染对应顶层 view 组件。
//
// 解析规则（与 window_manager.rs 的 open_* 函数生成 url 时保持对齐）：
//   #floating          -> mode=floating（浮窗速记）
//   #sticky?id=<uuid>  -> mode=sticky, noteId=<uuid>
//   #canvas            -> mode=canvas
//   #zen?id=<uuid>     -> mode=zen, noteId=<uuid>?
//   #search            -> mode=search
//   #settings          -> mode=settings
//   其余 / 缺省         -> mode=main
//
// 解析在模块导入时执行一次；浏览器导航/hash 变化时再监听一次（极少触发，但
// 给 dev 时手动改 URL 一个出口）。

import { defineStore } from 'pinia';
import { ref } from 'vue';

import type { WindowMode } from '@/types/steno';

interface ParsedHash {
  mode: WindowMode;
  noteId: string | null;
}

const VALID_MODES: ReadonlySet<WindowMode> = new Set<WindowMode>([
  'main',
  'floating',
  'sticky',
  'canvas',
  'zen',
  'search',
  'settings',
]);

function parseHash(hash: string): ParsedHash {
  // hash 形如 "#sticky?id=abc"；去掉前导 '#'。
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) {
    return { mode: 'main', noteId: null };
  }
  const [mode, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  return {
    mode: VALID_MODES.has(mode as WindowMode) ? (mode as WindowMode) : 'main',
    noteId: params.get('id'),
  };
}

export const useUiStore = defineStore('ui', () => {
  const initial = parseHash(typeof window === 'undefined' ? '' : window.location.hash);
  const mode = ref<WindowMode>(initial.mode);
  const noteId = ref<string | null>(initial.noteId);

  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
      const next = parseHash(window.location.hash);
      mode.value = next.mode;
      noteId.value = next.noteId;
    });
  }

  return { mode, noteId };
});
