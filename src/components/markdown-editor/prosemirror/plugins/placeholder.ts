/**
 * @file Steno 空文档占位插件
 *
 * 移植自 PureMark `src/core/plugins/placeholder.ts`（64 行）。
 * 文档为空时给编辑器根节点加 `steno-editor-empty` 类与 `data-placeholder` 属性，
 * 由样式表用 `::before` 显示占位文字。
 *
 * Steno 适配说明：CSS 类前缀从 `puremark-*` 改为 `steno-*`；source-view 信息
 * 取自 Steno 的 decorations 插件状态。
 */

import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { decorationPluginKey } from '../decorations';

/** 插件 Key */
export const placeholderPluginKey = new PluginKey('steno-placeholder');

/** 检查文档是否为空（仅一个空段落） */
function isEmpty(doc: Node): boolean {
  if (doc.childCount !== 1) return false;
  const firstChild = doc.firstChild;
  if (!firstChild || firstChild.type.name !== 'paragraph') return false;
  return firstChild.content.size === 0;
}

/**
 * 创建 placeholder 插件
 */
export function createPlaceholderPlugin(placeholder: string): Plugin {
  return new Plugin({
    key: placeholderPluginKey,

    props: {
      attributes(state: EditorState) {
        const doc = state.doc;
        const decorationState = decorationPluginKey.getState(state);
        const sourceView = decorationState?.sourceView ?? false;

        let className = 'steno-editor';
        if (isEmpty(doc)) {
          className += ' steno-editor-empty';
        }
        if (sourceView) {
          className += ' source-view';
        }

        const attributes: Record<string, string> = { class: className };
        if (isEmpty(doc)) {
          attributes['data-placeholder'] = placeholder;
        }
        return attributes;
      },
    },
  });
}
