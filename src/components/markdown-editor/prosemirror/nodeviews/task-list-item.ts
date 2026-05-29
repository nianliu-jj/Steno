/**
 * @file task-list-item NodeView
 *
 * 由 PureMark `src/core/nodeviews/list.ts` 移植（仅取 task-list 相关分支）。
 *
 * Steno 适配说明：
 * - schema 中节点名是 `task_item`（父列表为 `task_list`），不是 PureMark 的
 *   `task_list_item`。
 * - DOM 形态：`<li class="task-item">` + 前置 `<input type="checkbox">` +
 *   `<div class="task-content">` 作为 contentDOM。checkbox 处于 contentDOM 之外，
 *   通过 `ignoreMutation` 避免触发 PM 重绘。
 * - 切换 checkbox 时用 `setNodeMarkup(getPos(), null, attrs)` 写回 attrs.checked，
 *   serializer 据此输出 `[ ]` / `[x]`。
 */

import type { NodeView, EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';

export function createTaskItemNodeView(
  initialNode: Node,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  let node = initialNode;

  const dom = document.createElement('li');
  dom.className = 'task-item';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.contentEditable = 'false';
  checkbox.checked = Boolean(node.attrs.checked);

  const contentDOM = document.createElement('div');
  contentDOM.className = 'task-content';

  dom.appendChild(checkbox);
  dom.appendChild(contentDOM);

  function onChange(evt: Event) {
    const pos = getPos();
    if (pos == null) return;
    const checked = (evt.target as HTMLInputElement).checked;
    view.dispatch(view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, checked }));
  }

  checkbox.addEventListener('change', onChange);

  return {
    dom,
    contentDOM,
    update(updated) {
      if (updated.type !== node.type) return false;
      node = updated;
      const desired = Boolean(node.attrs.checked);
      if (checkbox.checked !== desired) checkbox.checked = desired;
      return true;
    },
    ignoreMutation(mutation) {
      // checkbox 在 contentDOM 之外，且其 checked 属性由我们主动同步；
      // 忽略它的所有 DOM 变更，避免 PM 重绘节点。
      const target = mutation.target as globalThis.Node;
      if (target === checkbox) return true;
      if (checkbox.contains(target)) return true;
      return false;
    },
    destroy() {
      checkbox.removeEventListener('change', onChange);
    },
  };
}
