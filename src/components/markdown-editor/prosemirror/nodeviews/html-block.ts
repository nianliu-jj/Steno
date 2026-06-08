/**
 * @file html-block NodeView
 *
 * 由 PureMark `src/core/nodeviews/html-block.ts` 移植，简化为：
 * 1. 普通态：把 `node.textContent`（schema 中 html_block 用 `text*` 存 raw HTML）
 *    经 `sanitizeHtml` 清洗后写入 `dom.innerHTML`；
 * 2. 双击进入编辑态：把 dom 替换为 `<textarea>`，blur / Ctrl+Enter 时把文本写回
 *    node 内容（用 `replaceWith` 替换为新的 html_block 节点 + text 子节点）。
 *
 * Steno 适配说明：
 * - html_block schema 是 `text*` content（PureMark 是 attrs.html），所以读源用
 *   `node.textContent`，写源用替换节点 text 子节点。
 * - 清洗使用 Steno 自带 `src/utils/markdown/sanitize.ts`。
 */

import type { NodeView, EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';

import { sanitizeHtml } from '@/utils/markdown/sanitize';

// 函数 createHtmlBlockNodeView：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function createHtmlBlockNodeView(
  initialNode: Node,
  view: EditorView,
  getPos: () => number | undefined
): NodeView {
  let node = initialNode;
  let editing = false;
  let textarea: HTMLTextAreaElement | null = null;

  // 局部常量 dom：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const dom = document.createElement('div');
  dom.className = 'html-block';
  dom.setAttribute('contenteditable', 'false');

  renderRendered();

  // 函数 renderRendered：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function renderRendered() {
    editing = false;
    textarea = null;
    dom.innerHTML = sanitizeHtml(node.textContent ?? '');
    dom.addEventListener('dblclick', onDblClick);
  }

  // 函数 onDblClick：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function onDblClick(evt: Event) {
    evt.preventDefault();
    enterEditing();
  }

  // 函数 enterEditing：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function enterEditing() {
    editing = true;
    dom.removeEventListener('dblclick', onDblClick);
    dom.innerHTML = '';
    textarea = document.createElement('textarea');
    textarea.className = 'html-block-source';
    textarea.value = node.textContent ?? '';
    textarea.addEventListener('blur', commit);
    textarea.addEventListener('keydown', onKeyDown);
    dom.appendChild(textarea);
    textarea.focus();
  }

  // 函数 onKeyDown：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function onKeyDown(evt: KeyboardEvent) {
    if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
      evt.preventDefault();
      commit();
    } else if (evt.key === 'Escape') {
      evt.preventDefault();
      cancel();
    }
  }

  // 函数 commit：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function commit() {
    if (!editing || !textarea) return;
    // 局部常量 pos：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const pos = getPos();
    if (pos == null) {
      cancel();
      return;
    }
    // 局部常量 value：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const value = textarea.value;
    // 局部常量 schema：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const schema = view.state.schema;
    // 局部常量 newNode：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const newNode = schema.nodes.html_block.create(node.attrs, value ? [schema.text(value)] : []);
    view.dispatch(view.state.tr.replaceWith(pos, pos + node.nodeSize, newNode));
    // 新文档会触发新一轮 update()，由 update 决定是否重新渲染。
  }

  // 函数 cancel：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function cancel() {
    renderRendered();
  }

  return {
    dom,
    update(updated) {
      if (updated.type !== node.type) return false;
      // 局部常量 wasEditing：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const wasEditing = editing;
      node = updated;
      if (!wasEditing) renderRendered();
      return true;
    },
    ignoreMutation() {
      // 渲染态由我们手动设置 innerHTML，编辑态使用原生 textarea；
      // 全部忽略 PM 对该 NodeView DOM 的观察。
      return true;
    },
    destroy() {
      dom.removeEventListener('dblclick', onDblClick);
      textarea?.removeEventListener('blur', commit);
      textarea?.removeEventListener('keydown', onKeyDown);
    }
  };
}
