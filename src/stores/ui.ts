// ui store：当前进程内"窗口承担的角色"。
//
// 路由来源（主→备）：
// 1. Tauri 窗口 label（首选，无编码风险）：getCurrentWindow().label
//    - main          → mode=main
//    - quicknote     → mode=floating
//    - sticky-{uuid} → mode=sticky,    noteId=uuid
//    - canvas        → mode=canvas
//    - zen           → mode=zen        (noteId 仍走 ?id= 因为单实例可换 note)
//    - search        → mode=settings/search
//    - settings      → mode=settings
// 2. URL hash 兜底（纯浏览器调试 / 非 Tauri 上下文）：#mode?id=...
//
// 早期方案曾把 url 写成 "index.html#floating" 由前端读 hash 解析，
// 但 Tauri 2 在窗口配置的 url 字段里对 '#' 做了 path 处理（会编码或截断），
// 导致 webview 加载失败（ERR_CACHE_READ_FAILURE）。改用 label 派生稳定。

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';

import type { WindowMode } from '@/types/steno';

interface ParsedRoute {
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

function parseFromHash(hash: string, search: string): ParsedRoute {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) {
    return { mode: 'main', noteId: null };
  }
  const [mode, query = ''] = raw.split('?');
  const params = new URLSearchParams(query || search.replace(/^\?/, ''));
  return {
    mode: VALID_MODES.has(mode as WindowMode) ? (mode as WindowMode) : 'main',
    noteId: params.get('id'),
  };
}

function parseFromLabel(label: string, search: string): ParsedRoute {
  if (label === 'main') return { mode: 'main', noteId: null };
  if (label === 'quicknote') return { mode: 'floating', noteId: null };
  if (label.startsWith('sticky-')) {
    return { mode: 'sticky', noteId: label.slice('sticky-'.length) };
  }
  if (label === 'canvas') return { mode: 'canvas', noteId: null };
  if (label === 'search') return { mode: 'search', noteId: null };
  if (label === 'settings') return { mode: 'settings', noteId: null };
  if (label === 'zen') {
    const params = new URLSearchParams(search.replace(/^\?/, ''));
    return { mode: 'zen', noteId: params.get('id') };
  }
  return { mode: 'main', noteId: null };
}

/** Tauri 不在时（浏览器调试 / SSR）走 hash 兜底；Tauri 在时走 label。 */
function resolveInitialRoute(): ParsedRoute {
  if (typeof window === 'undefined') {
    return { mode: 'main', noteId: null };
  }
  const search = window.location.search;
  try {
    const label = getCurrentWindow().label;
    if (label) {
      return parseFromLabel(label, search);
    }
  } catch {
    // 非 Tauri 上下文（纯浏览器调试）：getCurrentWindow 会抛
  }
  return parseFromHash(window.location.hash, search);
}

export const useUiStore = defineStore('ui', () => {
  const initial = resolveInitialRoute();
  const mode = ref<WindowMode>(initial.mode);
  const noteId = ref<string | null>(initial.noteId);

  // hashchange 监听仅在 hash-fallback 路径有意义（dev 时浏览器手动改 URL）。
  // label 由 Tauri 在窗口创建时决定，不会运行时变化。
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
      const next = parseFromHash(window.location.hash, window.location.search);
      mode.value = next.mode;
      noteId.value = next.noteId;
    });
  }

  return { mode, noteId };
});
