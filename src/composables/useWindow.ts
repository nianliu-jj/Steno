// 窗口管理命令封装。对应 src-tauri/src/commands.rs 里的 open_*_window /
// close_*_window 系列同步命令。Rust 端真正调用 window_manager::open_*。
//
// sticky / zen 接受 noteId（zen 可选）。其余无参。

import { invoke } from '@tauri-apps/api/core';

export function useWindow() {
  function openStickyNote(id: string) {
    return invoke<void>('open_sticky_note_window', { id });
  }

  function closeStickyNote(id: string) {
    return invoke<void>('close_sticky_note_window', { id });
  }

  function openCanvas() {
    return invoke<void>('open_canvas_window');
  }

  function openSearch() {
    return invoke<void>('open_search_window');
  }

  function openSettings() {
    return invoke<void>('open_settings_window');
  }

  /** id 缺省：打开空白 Zen（让用户在 Zen 内新建笔记）。 */
  function openZen(id?: string) {
    return invoke<void>('open_zen_window', { id: id ?? null });
  }

  return {
    openStickyNote,
    closeStickyNote,
    openCanvas,
    openSearch,
    openSettings,
    openZen,
  };
}
