/**
 * @file mermaid-block NodeView
 *
 * Steno 新增（PureMark 用 source-view 模式处理 mermaid，没有专属 NodeView）。
 *
 * 思路：渲染态下生成一个 `<pre class="mermaid-placeholder" data-source="<base64>">`
 * 占位节点，复用 `src/utils/markdown/mermaid.ts` 的 `renderMermaidPlaceholders`
 * 在容器内按串行队列异步替换为 SVG。源码改动时重置占位 + 重新调度。
 */

import type { NodeView, EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';

import { renderMermaidPlaceholders } from '@/utils/markdown/mermaid';

/** 把 mermaid 源码做 base64 编码（与 `renderer.ts:encodeMermaidSource` 等价）。 */
function encodeMermaidSource(source: string): string {
  try {
    // 局部常量 utf8：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const utf8 = new TextEncoder().encode(source);
    let binary = '';
    for (const byte of utf8) binary += String.fromCharCode(byte);
    return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  } catch {
    return '';
  }
}

// 函数 createMermaidBlockNodeView：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function createMermaidBlockNodeView(
  initialNode: Node,
  _view: EditorView,
  _getPos: () => number | undefined
): NodeView {
  let node = initialNode;
  let lastSource = '';

  // 局部常量 dom：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const dom = document.createElement('div');
  dom.className = 'mermaid-block';
  dom.setAttribute('contenteditable', 'false');

  scheduleRender();

  // 函数 scheduleRender：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function scheduleRender() {
    // 局部常量 source：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const source = node.textContent ?? '';
    if (source === lastSource) return;
    lastSource = source;
    // 局部常量 placeholder：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const placeholder = document.createElement('pre');
    placeholder.className = 'mermaid-placeholder';
    placeholder.setAttribute('data-source', encodeMermaidSource(source));
    dom.innerHTML = '';
    dom.appendChild(placeholder);
    // 在微任务里触发异步渲染，避免在 NodeView 构造期间同步调用动态 import。
    queueMicrotask(() => {
      void renderMermaidPlaceholders(dom);
    });
  }

  return {
    dom,
    update(updated) {
      if (updated.type !== node.type) return false;
      node = updated;
      scheduleRender();
      return true;
    },
    ignoreMutation() {
      return true;
    }
  };
}
