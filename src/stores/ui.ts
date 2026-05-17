// ui store：当前进程内"窗口承担的角色"。
//
// 路由来源（主→备）：
// 1. Tauri 窗口 label（首选，无编码风险）：getCurrentWindow().label
//    - main          → mode=main
//    - quicknote     → mode=floating
//    - sticky-{uuid} → mode=sticky,    noteId=uuid
//    - canvas        → mode=canvas
//    - zen           → mode=zen        (noteId 仍走 ?id= 因为单实例可换 note)
//    - settings      → mode=settings
// 2. URL hash 兜底（纯浏览器调试 / 非 Tauri 上下文）：#mode?id=...
//
// 早期方案曾把 url 写成 "index.html#floating" 由前端读 hash 解析，
// 但 Tauri 2 在窗口配置的 url 字段里对 '#' 做了 path 处理（会编码或截断），
// 导致 webview 加载失败（ERR_CACHE_READ_FAILURE）。改用 label 派生稳定。

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

import type { WindowMode } from '@/types/steno';

type MainRouteMode = Extract<
  WindowMode,
  | 'main'
  | 'canvas'
  | 'zen'
  | 'settings'
  | 'note-editor'
  | 'clipboard'
  | 'todo'
  | 'screenshot'
  | 'ocr'
  | 'translate'
>;

interface ParsedRoute {
  mode: WindowMode;
  noteId: string | null;
}

interface NavigationPayload {
  mode: MainRouteMode;
  noteId?: string | null;
}

const NAVIGATE_EVENT = 'steno:navigate';

const VALID_MODES: ReadonlySet<WindowMode> = new Set<WindowMode>([
  'main',
  'floating',
  'sticky',
  'canvas',
  'zen',
  'settings',
  'note-editor',
  'clipboard',
  'todo',
  'screenshot',
  'ocr',
  'translate',
]);

const MAIN_ROUTE_MODES: ReadonlySet<MainRouteMode> = new Set<MainRouteMode>([
  'main',
  'canvas',
  'zen',
  'settings',
  'note-editor',
  'clipboard',
  'todo',
  'screenshot',
  'ocr',
  'translate',
]);

function resolveWindowLabel(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return getCurrentWindow().label || null;
  } catch {
    return null;
  }
}

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
  if (label === 'main') {
    const hashRoute = parseFromHash(window.location.hash, search);
    return MAIN_ROUTE_MODES.has(hashRoute.mode as MainRouteMode)
      ? { mode: hashRoute.mode, noteId: hashRoute.mode === 'zen' ? hashRoute.noteId : null }
      : { mode: 'main', noteId: null };
  }
  if (label === 'quicknote') return { mode: 'floating', noteId: null };
  if (label.startsWith('sticky-')) {
    return { mode: 'sticky', noteId: label.slice('sticky-'.length) };
  }
  if (label === 'canvas') return { mode: 'canvas', noteId: null };
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
  const label = resolveWindowLabel();
  if (label) {
    return parseFromLabel(label, search);
  }
  return parseFromHash(window.location.hash, search);
}

export const useUiStore = defineStore('ui', () => {
  const initial = resolveInitialRoute();
  const windowLabel = resolveWindowLabel();
  const settingsOpen = ref(initial.mode === 'settings' && windowLabel !== 'settings');
  const mode = ref<WindowMode>(settingsOpen.value ? 'main' : initial.mode);
  const noteId = ref<string | null>(initial.noteId);
  const zenReturnMode = ref<MainRouteMode | null>(null);

  function navigateTo(
    nextMode: MainRouteMode,
    nextNoteId: string | null = null,
    returnMode: MainRouteMode | null = null,
  ) {
    if (nextMode === 'settings') {
      if (windowLabel === 'settings') {
        mode.value = 'settings';
        noteId.value = null;
      } else {
        settingsOpen.value = true;
      }
      return;
    }

    settingsOpen.value = false;
    mode.value = nextMode;
    noteId.value = nextMode === 'zen' || nextMode === 'note-editor' ? nextNoteId : null;
    zenReturnMode.value = nextMode === 'zen' ? returnMode : null;
  }

  function navigateToMain() {
    settingsOpen.value = false;
    navigateTo('main');
  }

  function navigateToZenFromCanvas(nextNoteId: string) {
    navigateTo('zen', nextNoteId, 'canvas');
  }

  function exitZen() {
    const target = zenReturnMode.value;
    navigateTo(target ?? 'main');
  }

  function closeSettings() {
    settingsOpen.value = false;
  }

  // hashchange 监听仅在 hash-fallback 路径有意义（dev 时浏览器手动改 URL）。
  // label 由 Tauri 在窗口创建时决定，不会运行时变化。
  if (typeof window !== 'undefined') {
    if (!windowLabel || windowLabel === 'main') {
      window.addEventListener('hashchange', () => {
        const next = parseFromHash(window.location.hash, window.location.search);
        if (next.mode === 'settings') {
          settingsOpen.value = true;
          return;
        }
        settingsOpen.value = false;
        mode.value = next.mode;
        noteId.value = next.noteId;
      });

      void listen<NavigationPayload>(NAVIGATE_EVENT, ({ payload }) => {
        if (!MAIN_ROUTE_MODES.has(payload.mode)) return;
        navigateTo(payload.mode, payload.noteId ?? null);
      }).catch(() => {
        // 非 Tauri 浏览器调试环境下 listen 可能不可用；hash fallback 仍可工作。
      });
    }
  }

  return {
    mode,
    noteId,
    settingsOpen,
    navigateTo,
    navigateToMain,
    navigateToZenFromCanvas,
    exitZen,
    closeSettings,
  };
});
