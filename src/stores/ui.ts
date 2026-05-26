/**
 * @file UI Store — 当前进程内窗口承担的角色
 *
 * **路由来源（优先级从高到低）**：
 * 1. Tauri 窗口 label（首选，无编码风险）→ `getCurrentWindow().label`
 *    - `main`          → mode=main
 *    - `quicknote`     → mode=floating
 *    - `sticky-{uuid}` → mode=sticky, noteId=uuid
 *    - `canvas`        → mode=canvas
 *    - `zen`           → mode=zen（noteId 仍走 `?id=` 因为单实例可换 note）
 *    - `settings`      → mode=settings
 * 2. URL hash 兜底（纯浏览器调试 / 非 Tauri 上下文）→ `#mode?id=...`
 *
 * **历史记录**：早期方案曾把 url 写成 `"index.html#floating"` 由前端读
 * hash 解析，但 Tauri 2 在窗口配置的 url 字段里对 `#` 做了 path 处理
 * （会编码或截断），导致 webview 加载失败（ERR_CACHE_READ_FAILURE）。
 * 改用 label 派生后稳定。
 *
 * **跨窗口路由**：页面型 mode 在 main 窗口内通过 `steno:navigate` 事件切换；
 * floating / sticky 仍是独立 webview。
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

import type { WindowMode } from '@/types/steno';

/**
 * 可在 main 窗口内通过导航事件切换的模式子集。
 *
 * `floating` / `sticky` 是独立窗口，不在 main 窗口内切换。
 */
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

/** 从窗口 label 或 URL hash 解析出的路由信息。 */
interface ParsedRoute {
  mode: WindowMode;
  noteId: string | null;
}

/** `steno:navigate` 事件的 payload 类型。 */
interface NavigationPayload {
  mode: MainRouteMode;
  noteId?: string | null;
}

/** 跨窗口导航事件名。 */
const NAVIGATE_EVENT = 'steno:navigate';

/** 所有合法的 WindowMode 值，用于校验 hash 解析结果。 */
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

/** 所有支持导航的页面型模式，用于校验事件 payload。 */
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

/**
 * 获取当前 Tauri 窗口的 label。
 *
 * @returns label 字符串；非 Tauri 或获取失败返回 `null`
 */
function resolveWindowLabel(): string | null {
  if (typeof window === 'undefined') {
    return null; // SSR 安全
  }
  try {
    return getCurrentWindow().label || null;
  } catch {
    return null;
  }
}

/**
 * 从 URL hash 解析路由信息（兜底路径）。
 *
 * @param hash - `window.location.hash`（含 `#` 前缀）
 * @param search - `window.location.search`（`?id=...` 等）
 * @returns 解析出的 mode 和 noteId
 *
 * @example
 * ```ts
 * parseFromHash('#canvas', '');
 * // → { mode: 'canvas', noteId: null }
 * parseFromHash('#zen?id=abc-123', '');
 * // → { mode: 'zen', noteId: 'abc-123' }
 * ```
 */
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

/**
 * 从 Tauri 窗口 label 解析路由信息（首选路径）。
 *
 * label 命名约定：
 * - `main` → 主窗口，内部 mode 由 hash 决定
 * - `quicknote` → 速记浮窗（`mode=floating`）
 * - `sticky-{uuid}` → 置顶便签（`mode=sticky`, `noteId=uuid`）
 * - `canvas` / `settings` / `zen` → 对应独立窗口
 *
 * @param label - Tauri 窗口 label
 * @param search - `window.location.search`
 */
function parseFromLabel(label: string, search: string): ParsedRoute {
  if (label === 'main') {
    // main 窗口内有子路由：先读 hash，只接受 MAIN_ROUTE_MODES 内的值
    const hashRoute = parseFromHash(window.location.hash, search);
    return MAIN_ROUTE_MODES.has(hashRoute.mode as MainRouteMode)
      ? { mode: hashRoute.mode, noteId: hashRoute.mode === 'zen' ? hashRoute.noteId : null }
      : { mode: 'main', noteId: null };
  }
  if (label === 'quicknote') return { mode: 'floating', noteId: null };
  if (label.startsWith('sticky-')) {
    // label = "sticky-550e8400-..." → noteId = "550e8400-..."
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

/**
 * 解析初始路由 — Tauri 在时走 label，不在时走 hash 兜底。
 */
function resolveInitialRoute(): ParsedRoute {
  if (typeof window === 'undefined') {
    return { mode: 'main', noteId: null }; // SSR 安全
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

  /**
   * 设置面板是否以 Modal 形式在主窗口内打开。
   *
   * 逻辑：label 不是 `settings` 但初始 mode 是 `settings` →
   * 从导航事件触发，应该以 Modal 打开而非整页。
   */
  const settingsOpen = ref(initial.mode === 'settings' && windowLabel !== 'settings');
  /** 当前窗口模式。 */
  const mode = ref<WindowMode>(settingsOpen.value ? 'main' : initial.mode);
  /** 当前笔记 ID（zen / note-editor / sticky 模式使用）。 */
  const noteId = ref<string | null>(initial.noteId);
  /**
   * Zen 模式的"返回目标"。
   *
   * 进入 Zen 前记录来源路由（含 mode + noteId），退出时导航回去。
   * 例如从 Canvas 双击卡片进入 Zen → `zenReturnRoute = { mode: 'canvas', noteId: null }` → exitZen 回到画布。
   */
  const zenReturnRoute = ref<{ mode: MainRouteMode; noteId: string | null } | null>(null);

  /**
   * 导航到指定页面型模式。
   *
   * 特殊处理：
   * - `settings` 在主窗口内以 Modal 打开（不是真正的页面切换）
   * - `zen` / `note-editor` 模式需要 `noteId`
   * - `zen` 模式记录 `returnMode` 用于退出时返回
   *
   * @param nextMode - 目标模式
   * @param nextNoteId - 目标笔记 ID（仅 zen / note-editor 需要）
   * @param returnMode - Zen 模式的返回目标
   */
  function navigateTo(
    nextMode: MainRouteMode,
    nextNoteId: string | null = null,
    returnRoute: { mode: MainRouteMode; noteId: string | null } | null = null,
  ) {
    if (nextMode === 'settings') {
      if (windowLabel === 'settings') {
        // 独立 settings 窗口 → 直接切模式
        mode.value = 'settings';
        noteId.value = null;
      } else {
        // main 窗口内 → 打开 settings Modal
        settingsOpen.value = true;
      }
      return;
    }

    settingsOpen.value = false;
    mode.value = nextMode;
    // noteId 只在 zen / note-editor 模式下有意义
    noteId.value = nextMode === 'zen' || nextMode === 'note-editor' ? nextNoteId : null;
    zenReturnRoute.value = nextMode === 'zen' ? returnRoute : null;
  }

  /** 快捷导航到主列表页。 */
  function navigateToMain() {
    settingsOpen.value = false;
    navigateTo('main');
  }

  /**
   * 从 Canvas 双击卡片进入 Zen 写作。
   *
   * @param nextNoteId - 要编辑的笔记 UUID
   */
  function navigateToZenFromCanvas(nextNoteId: string) {
    navigateTo('zen', nextNoteId, { mode: 'canvas', noteId: null });
  }

  function navigateToZenFromEditor(nextNoteId: string | null) {
    navigateTo('zen', nextNoteId, { mode: 'note-editor', noteId: nextNoteId });
  }

  /** 退出 Zen 模式，回到进入前的页面。 */
  function exitZen() {
    const target = zenReturnRoute.value;
    // navigateTo 内部只在 zen / note-editor 模式下接受 noteId，
    // 对 canvas / main 等目标会自动丢弃，不必在此分类处理。
    navigateTo(target?.mode ?? 'main', target?.noteId ?? noteId.value);
  }

  /** 关闭设置 Modal。 */
  function closeSettings() {
    settingsOpen.value = false;
  }

  // hashchange 监听仅在 hash-fallback 路径有意义（dev 时浏览器手动改 URL）。
  // label 由 Tauri 在窗口创建时决定，不会运行时变化。
  if (typeof window !== 'undefined') {
    if (!windowLabel || windowLabel === 'main') {
      // 浏览器 hash 变化 → 更新 mode（仅在非 Tauri 或 main 窗口生效）
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

      // 监听 Rust 端发送的导航事件（页面型入口如 open_canvas_window 等）
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
    navigateToZenFromEditor,
    exitZen,
    closeSettings,
  };
});
