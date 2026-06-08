/**
 * @file math-block NodeView
 *
 * 由 PureMark `src/core/nodeviews/math-block.ts` 移植，简化为"直接调用 KaTeX
 * 把 `node.textContent` 渲染到容器"。
 *
 * Steno 适配说明：
 * - math_block schema 是 `text*` content（PureMark 是 attrs.tex），所以源用
 *   `node.textContent`。
 * - throwOnError: false，渲染失败时容器显示错误文本并加 `.math-block-error` 类。
 */

import { render as katexRender } from 'katex';
import 'katex/dist/katex.min.css';
import type { NodeView, EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';

// 函数 createMathBlockNodeView：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function createMathBlockNodeView(
  initialNode: Node,
  _view: EditorView,
  _getPos: () => number | undefined
): NodeView {
  let node = initialNode;

  // 局部常量 dom：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const dom = document.createElement('div');
  dom.className = 'math-block';
  dom.setAttribute('contenteditable', 'false');

  render();

  // 函数 render：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function render() {
    // 局部常量 tex：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const tex = node.textContent ?? '';
    try {
      katexRender(tex, dom, { displayMode: true, throwOnError: false });
      dom.classList.remove('math-block-error');
    } catch (err) {
      dom.classList.add('math-block-error');
      dom.textContent = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    dom,
    update(updated) {
      if (updated.type !== node.type) return false;
      // 局部常量 sameTex：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const sameTex = updated.textContent === node.textContent;
      node = updated;
      if (!sameTex) render();
      return true;
    },
    ignoreMutation() {
      return true;
    }
  };
}
