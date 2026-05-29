/**
 * @file prosemirror-history 薄封装
 *
 * 提供撤销/重做：`history()` 状态插件 + `historyKeymap`（Mod-z / Mod-y / Mod-Shift-z）。
 * Steno 适配：用 `prosemirror-keymap` 的 `keymap()` 把 undo/redo 绑定为插件。
 */

import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Plugin } from 'prosemirror-state';

/** undo/redo 快捷键映射（Mac 上 Mod = Cmd，其它平台为 Ctrl）。 */
export const historyKeymap = {
  'Mod-z': undo,
  'Mod-y': redo,
  'Mod-Shift-z': redo,
};

/**
 * 创建历史插件集合：[history(), keymap(historyKeymap)]。
 */
export function createHistoryPlugins(): Plugin[] {
  return [history(), keymap(historyKeymap)];
}

export { history, undo, redo };
