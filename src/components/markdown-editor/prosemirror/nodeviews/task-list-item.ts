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

// 函数 createTaskItemNodeView：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function createTaskItemNodeView(
  initialNode: Node,
  view: EditorView,
  getPos: () => number | undefined
): NodeView {
  let node = initialNode;

  // 局部常量 dom：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const dom = document.createElement('li');
  dom.className = 'task-item';

  // 局部常量 checkbox：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.contentEditable = 'false';
  checkbox.checked = Boolean(node.attrs.checked);

  // 局部常量 contentDOM：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const contentDOM = document.createElement('div');
  contentDOM.className = 'task-content';

  dom.appendChild(checkbox);
  dom.appendChild(contentDOM);

  // 函数 onChange：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function onChange(evt: Event) {
    // 局部常量 pos：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const pos = getPos();
    if (pos == null) return;
    // 函数式常量 checked：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
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
      // 局部常量 desired：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
    }
  };
}
