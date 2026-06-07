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

import { stenoAssetDisplaySrc, subscribeStenoAssetDataDir } from '@/utils/stenoAssets';

/**
 * 创建 image NodeView。
 *
 * - 叶子节点（schema 中 image 无 content），无 contentDOM。
 * - 外层始终为 `.steno-image-node` 容器，保证路径提示与失败占位不破坏 PM 节点边界。
 * - 若 `linkHref` 非空，图片区域包裹为 `<a>`，否则直接渲染 `<img>`。
 * - 点击图片时在下方显示原始 src 路径，再次点击隐藏。
 * - `<img>` 加载失败时把图片区域替换为 `<div class="image-fallback">{alt}</div>`。
 */
export function createImageNodeView(
  initialNode: Node,
  _view: EditorView,
  _getPos: () => number | undefined,
): NodeView {
  let node = initialNode;
  let pathVisible = false;
  let dom: HTMLElement = buildDom(node);
  attachErrorHandler();

  // 数据目录可能在图片渲染之后才异步就绪（getDataPaths 是异步 IPC；速记浮窗是独立
  // webview，其 cachedDataDir 初始为空）。订阅其变化，就绪后重建 DOM 重新解析 src，
  // 避免图片永久停留在加载失败/占位状态 —— 即"速记浮窗不显示笔记图片"的根因之一。
  const unsubscribeDataDir = subscribeStenoAssetDataDir(() => {
    const next = buildDom(node);
    dom.replaceWith(next);
    dom = next;
    attachErrorHandler();
  });

  function buildDom(currentNode: Node): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'steno-image-node';

    const img = document.createElement('img');
    img.src = stenoAssetDisplaySrc(currentNode.attrs.src ?? '');
    img.alt = currentNode.attrs.alt ?? '';
    if (currentNode.attrs.title) img.title = currentNode.attrs.title;
    img.addEventListener('click', onImageClick);

    const linkHref: string = currentNode.attrs.linkHref ?? '';
    if (linkHref) {
      const a = document.createElement('a');
      a.href = linkHref;
      if (currentNode.attrs.linkTitle) a.title = currentNode.attrs.linkTitle;
      a.appendChild(img);
      wrapper.appendChild(a);
    } else {
      wrapper.appendChild(img);
    }

    const path = document.createElement('div');
    path.className = 'steno-image-path';
    path.textContent = currentNode.attrs.src ?? '';
    path.hidden = !pathVisible;
    wrapper.appendChild(path);

    return wrapper;
  }

  function attachErrorHandler() {
    const img = dom.querySelector('img');
    if (!img) return;
    img.addEventListener('error', onError, { once: true });
  }

  function onImageClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    pathVisible = !pathVisible;
    const path = dom.querySelector<HTMLElement>('.steno-image-path');
    if (path) path.hidden = !pathVisible;
  }

  function onError() {
    const fallback = document.createElement('div');
    fallback.className = 'image-fallback';
    fallback.textContent = node.attrs.alt || node.attrs.src || '';
    const media = dom.querySelector('a') ?? dom.querySelector('img');
    media?.replaceWith(fallback);
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
        const img = dom.querySelector('img');
        if (img) {
          img.alt = node.attrs.alt ?? '';
          if (node.attrs.title) img.title = node.attrs.title; else img.removeAttribute('title');
        }
        const path = dom.querySelector<HTMLElement>('.steno-image-path');
        if (path) path.textContent = node.attrs.src ?? '';
      }
      return true;
    },
    destroy() {
      // 浏览器会在 dom 被替换/移除时自动清理 once: true 监听器，这里仅做防御。
      unsubscribeDataDir();
      const img = dom.querySelector('img');
      img?.removeEventListener('error', onError);
      img?.removeEventListener('click', onImageClick);
    },
  };
}
