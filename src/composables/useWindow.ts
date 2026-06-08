/**
 * @file 窗口管理与当前窗口控制
 *
 * 封装两类操作：
 * 1. **窗口生命周期** — `open*Window` / `close*Window` → Tauri IPC 命令
 * 2. **当前窗口控制** — `hideCurrent` / `startDragCurrent` 等 → Tauri window API
 *
 * 页面型入口（canvas / settings / zen）会让 Rust 端聚焦 main 窗口并发送
 * 前端导航事件；sticky 仍是真正的独立 webview 窗口。
 */

import { invoke } from '@tauri-apps/api/core';
import { LogicalPosition, LogicalSize, getCurrentWindow } from '@tauri-apps/api/window';

/**
 * 窗口操作工具集。
 *
 * @returns 窗口 IPC 命令 + 当前窗口控制方法的集合
 */
export function useWindow() {
  // ----- 窗口生命周期（IPC） --------------------------------------------

  /**
   * 打开速记浮窗。
   *
   * @param opts.fresh - `true` = 强制空白浮窗（"新建速记"按钮）
   * @param opts.noteId - 指定 hydrate 的草稿 UUID（列表卡片入口）
   * @param opts.initialContent - 直接传入的初始内容，填充到编辑器中
   * @param opts.clipboardContext - `true` 时关闭浮窗不创建草稿笔记
   */
  function openQuicknote(opts?: {
    fresh?: boolean;
    noteId?: string | null;
    initialContent?: string | null;
    clipboardContext?: boolean | null;
    clipboardEntryId?: string | null;
  }) {
    return invoke<void>('open_quicknote_window', {
      fresh: opts?.fresh ?? false,
      noteId: opts?.noteId ?? null,
      initialContent: opts?.initialContent ?? null,
      clipboardContext: opts?.clipboardContext ?? null,
      clipboardEntryId: opts?.clipboardEntryId ?? null
    });
  }

  /**
   * 打开指定笔记的置顶便签窗口。
   *
   * @param id - 笔记 UUID
   */
  function openStickyNote(id: string) {
    return invoke<void>('open_sticky_note_window', { id });
  }

  /**
   * 关闭指定笔记的置顶便签窗口。
   *
   * @param id - 笔记 UUID
   */
  function closeStickyNote(id: string) {
    return invoke<void>('close_sticky_note_window', { id });
  }

  /** 打开画布窗口 / 导航到画布视图。 */
  function openCanvas() {
    return invoke<void>('open_canvas_window');
  }

  /** 打开设置窗口 / 导航到设置视图。 */
  function openSettings() {
    return invoke<void>('open_settings_window');
  }

  /**
   * 打开 Zen 写作窗口。
   *
   * @param id - 可选笔记 UUID；省略则打开空白 Zen（让用户在 Zen 内新建笔记）
   */
  function openZen(id?: string) {
    return invoke<void>('open_zen_window', { id: id ?? null });
  }

  /**
   * 打开「打印 / 导出 PDF」窗口。
   *
   * @param id - 笔记 UUID；后端按 label `print-{id}` 创建独立 webview，
   *             前端渲染只读笔记后自动调用系统打印（用户另存为 PDF）。
   */
  function openPrintWindow(id: string) {
    return invoke<void>('open_print_window', { id });
  }

  // 函数 openPathInFileManager：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function openPathInFileManager(path: string) {
    return invoke<void>('open_path_in_file_manager', { path });
  }

  // 函数 openUrl：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function openUrl(url: string) {
    return invoke<void>('open_url', { url });
  }

  // ----- 当前窗口控制（FloatingEditor / StickyNote 用） -----------------

  /** 隐藏当前窗口（浮窗失焦关闭的首选方式，不是 destroy）。 */
  function hideCurrent() {
    return getCurrentWindow().hide();
  }

  /** 显示当前窗口。 */
  function showCurrent() {
    return getCurrentWindow().show();
  }

  /** 最小化当前窗口。 */
  function minimizeCurrent() {
    return getCurrentWindow().minimize();
  }

  /** 最大化当前窗口。 */
  function maximizeCurrent() {
    return getCurrentWindow().maximize();
  }

  /** 取消最大化。 */
  function unmaximizeCurrent() {
    return getCurrentWindow().unmaximize();
  }

  /** 切换最大化/还原。 */
  function toggleMaximizeCurrent() {
    return getCurrentWindow().toggleMaximize();
  }

  /**
   * 关闭当前窗口。
   *
   * **注意**：Tauri 的 `CloseRequested` 事件被拦截为 `hide()`（见 `lib.rs`），
   * 因此关闭按钮实际上只是隐藏。但通过此方法强制关闭会真正销毁 webview。
   */
  function closeCurrent() {
    return getCurrentWindow().close();
  }

  /**
   * 订阅当前窗口的 focus/blur 事件。
   *
   * **Tauri 2 行为**：`onFocusChanged` 在 `window.hide()` 时也会触发
   * `focused=false`，因此 FloatingEditor 既能通过失焦自动关闭，也能通过
   * toggle 快捷键关闭 — 两条路径汇合到同一个 handler，调用方负责去抖。
   *
   * @param handler - `(focused: boolean) => void`，true=获得焦点，false=失去焦点
   * @returns unlisten 函数，调用方在 `onUnmounted` 里调用以清理
   */
  async function onCurrentWindowFocusChange(handler: (focused: boolean) => void): Promise<() => void> {
    return await getCurrentWindow().onFocusChanged(({ payload }) => handler(payload));
  }

  /**
   * 开始拖拽当前窗口（浮窗顶栏 pointerdown 时触发）。
   *
   * 调用 Tauri 的 `startDragging` API，让 OS 接管窗口拖动。
   */
  function startDragCurrent() {
    return getCurrentWindow().startDragging();
  }

  /**
   * 设置当前窗口尺寸。
   *
   * 使用 `LogicalSize` — 尺寸会自动跟随 DPI 缩放，
   * 在 Retina 屏幕上 `400x300` 实际占用 400x300 逻辑点。
   *
   * @param width - 逻辑宽度
   * @param height - 逻辑高度
   */
  function setCurrentSize(width: number, height: number) {
    return getCurrentWindow().setSize(new LogicalSize(width, height));
  }

  /**
   * 设置当前窗口位置。
   *
   * @param x - 逻辑 X 坐标
   * @param y - 逻辑 Y 坐标
   */
  function setCurrentPosition(x: number, y: number) {
    return getCurrentWindow().setPosition(new LogicalPosition(x, y));
  }

  /**
   * 获取当前窗口的 label。
   *
   * 用于 FloatingEditor 判断自己是 quicknote 还是 sticky-{uuid} 模式。
   */
  function currentLabel() {
    return getCurrentWindow().label;
  }

  return {
    openQuicknote,
    openStickyNote,
    closeStickyNote,
    openCanvas,
    openSettings,
    openZen,
    openPrintWindow,
    openPathInFileManager,
    openUrl,
    hideCurrent,
    showCurrent,
    minimizeCurrent,
    maximizeCurrent,
    unmaximizeCurrent,
    toggleMaximizeCurrent,
    closeCurrent,
    onCurrentWindowFocusChange,
    startDragCurrent,
    setCurrentSize,
    setCurrentPosition,
    currentLabel
  };
}
