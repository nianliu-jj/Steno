/**
 * @file image NodeView
 *
 * 由 PureMark `src/core/nodeviews/image.ts` 移植；只取"resolve src + 失败占位
 * + linkHref 包裹 <a>"三类核心行为，其它（拖拽、尺寸、image-group 多图并排等）
 * 在后续 phase 视需要再补。
 *
 * Steno 相对 PureMark 的关键差异：
 * - src 解析改用 `src/utils/stenoAssets.ts` 的 `stenoAssetDisplaySrc`，
 *   将 `steno-asset:foo.png` 形式转成 Tauri `convertFileSrc` 可加载的 URL。
 * - 没有 PureMark 的 source-view 模式，所以不渲染 markdown 源码 fallback。
 */

import type { NodeView, EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';

import { stenoAssetDisplaySrc } from '@/utils/stenoAssets';

/**
 * 创建 image NodeView。
 *
 * - 叶子节点（schema 中 image 无 content），无 contentDOM。
 * - 若 `linkHref` 非空，外层 dom 为 `<a>`，包裹 `<img>`；否则外层即 `<img>`。
 * - `<img>` 加载失败时把外层替换为 `<div class="image-fallback">{alt}</div>`。
 */
export function createImageNodeView(
  initialNode: Node,
  _view: EditorView,
  _getPos: () => number | undefined,
): NodeView {
  let node = initialNode;
  let dom: HTMLElement = buildDom(node);
  attachErrorHandler();

  function buildDom(currentNode: Node): HTMLElement {
    const img = document.createElement('img');
    img.src = stenoAssetDisplaySrc(currentNode.attrs.src ?? '');
    img.alt = currentNode.attrs.alt ?? '';
    if (currentNode.attrs.title) img.title = currentNode.attrs.title;

    const linkHref: string = currentNode.attrs.linkHref ?? '';
    if (linkHref) {
      const a = document.createElement('a');
      a.href = linkHref;
      if (currentNode.attrs.linkTitle) a.title = currentNode.attrs.linkTitle;
      a.appendChild(img);
      return a;
    }
    return img;
  }

  function attachErrorHandler() {
    const img = dom.tagName === 'IMG' ? (dom as HTMLImageElement) : dom.querySelector('img');
    if (!img) return;
    img.addEventListener('error', onError, { once: true });
  }

  function onError() {
    const fallback = document.createElement('div');
    fallback.className = 'image-fallback';
    fallback.textContent = node.attrs.alt || node.attrs.src || '';
    dom.replaceWith(fallback);
    dom = fallback;
  }

  return {
    get dom() {
      return dom;
    },
    update(updated) {
      if (updated.type !== node.type) return false;
      const sameSrc = updated.attrs.src === node.attrs.src
        && updated.attrs.linkHref === node.attrs.linkHref
        && updated.attrs.linkTitle === node.attrs.linkTitle;
      const sameAlt = updated.attrs.alt === node.attrs.alt
        && updated.attrs.title === node.attrs.title;
      node = updated;
      if (!sameSrc) {
        const next = buildDom(node);
        dom.replaceWith(next);
        dom = next;
        attachErrorHandler();
      } else if (!sameAlt) {
        const img = dom.tagName === 'IMG' ? (dom as HTMLImageElement) : dom.querySelector('img');
        if (img) {
          img.alt = node.attrs.alt ?? '';
          if (node.attrs.title) img.title = node.attrs.title; else img.removeAttribute('title');
        }
      }
      return true;
    },
    destroy() {
      // 浏览器会在 dom 被替换/移除时自动清理 once: true 监听器，这里仅做防御。
      const img = dom.tagName === 'IMG' ? (dom as HTMLImageElement) : dom.querySelector('img');
      img?.removeEventListener('error', onError);
    },
  };
}
