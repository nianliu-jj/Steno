// 窗口/页面入口命令封装。对应 src-tauri/src/commands.rs 里的 open_*_window /
// close_*_window 系列同步命令。页面型入口会让 Rust 端聚焦 main 窗口并发送
// 前端导航事件；sticky 仍是真正的独立窗口。
//
// sticky / zen 接受 noteId（zen 可选）。其余无参。

import { invoke } from '@tauri-apps/api/core';
import { LogicalPosition, LogicalSize, getCurrentWindow } from '@tauri-apps/api/window';

export function useWindow() {
  function openQuicknote() {
    return invoke<void>('open_quicknote_window');
  }

  function openStickyNote(id: string) {
    return invoke<void>('open_sticky_note_window', { id });
  }

  function closeStickyNote(id: string) {
    return invoke<void>('close_sticky_note_window', { id });
  }

  function openCanvas() {
    return invoke<void>('open_canvas_window');
  }

  function openSettings() {
    return invoke<void>('open_settings_window');
  }

  /** id 缺省：打开空白 Zen（让用户在 Zen 内新建笔记）。 */
  function openZen(id?: string) {
    return invoke<void>('open_zen_window', { id: id ?? null });
  }

  // ----- 当前窗口控制（FloatingEditor / StickyNote 用） -----------------

  function hideCurrent() {
    return getCurrentWindow().hide();
  }

  function showCurrent() {
    return getCurrentWindow().show();
  }

  function minimizeCurrent() {
    return getCurrentWindow().minimize();
  }

  function maximizeCurrent() {
    return getCurrentWindow().maximize();
  }

  function unmaximizeCurrent() {
    return getCurrentWindow().unmaximize();
  }

  function toggleMaximizeCurrent() {
    return getCurrentWindow().toggleMaximize();
  }

  function closeCurrent() {
    return getCurrentWindow().close();
  }

  /**
   * 订阅当前窗口的 focus/blur 事件。返回 unlisten 函数，调用方负责在
   * onUnmounted 里清理。
   *
   * Tauri 2 的 onFocusChanged 在 window.hide() 时也会触发 focused=false，
   * 因此 FloatingEditor 既能通过失焦保存关闭，也能通过 toggle 快捷键关闭
   * （两条路径汇合到同一个 handler，调用方做去抖/dedupe）。
   */
  async function onCurrentWindowFocusChange(
    handler: (focused: boolean) => void,
  ): Promise<() => void> {
    return await getCurrentWindow().onFocusChanged(({ payload }) => handler(payload));
  }

  /** 浮窗顶栏拖拽：调用方在 pointerdown 里触发。 */
  function startDragCurrent() {
    return getCurrentWindow().startDragging();
  }

  /** Sticky 启动恢复尺寸用：LogicalSize 跟着 DPI 缩放。 */
  function setCurrentSize(width: number, height: number) {
    return getCurrentWindow().setSize(new LogicalSize(width, height));
  }

  function setCurrentPosition(x: number, y: number) {
    return getCurrentWindow().setPosition(new LogicalPosition(x, y));
  }

  /** Sticky 顶栏的当前 label，调用方用来判断 mode 等。 */
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
    currentLabel,
  };
}
