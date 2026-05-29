/**
 * @file Steno ProseMirror 视图工厂（Phase 7）
 *
 * 职责：把已完成的 schema / parser / serializer / nodeviews / plugins 装配成
 * 一个可用的 `EditorView` 实例。本文件只负责"造一个 view"，与 Vue 的双向
 * 绑定胶水（命令式 API、防死循环）由 `editor-bridge.ts` 封装。
 *
 * 参考：D:\Markdown项目\PureMark\src\core\view\* 的装配思路。
 */

import './editor-base.css';

import { EditorState, Plugin, type Transaction } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import type { NodeView, NodeViewConstructor } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';

import { parseMarkdown } from '../parser';
import { serializeDoc } from '../serializer';
import { createEditorPlugins, TableView } from '../plugins';
import {
  createImageNodeView,
  createTaskItemNodeView,
  createHtmlBlockNodeView,
  createMathBlockNodeView,
  createMermaidBlockNodeView,
  createCodeBlockNodeView,
} from '../nodeviews';

/** prosemirror-tables 表格列最小宽度（像素），用默认值 25。 */
const TABLE_CELL_MIN_WIDTH = 25;

/** `createEditor` 选项。 */
export interface CreateEditorOptions {
  /** 编辑器挂载的宿主元素。 */
  mount: HTMLElement;
  /** 初始 Markdown 文本。 */
  initialValue: string;
  /** 是否可编辑，默认 true；只读传 false。 */
  editable?: boolean;
  /** 空文档占位文字。 */
  placeholder?: string;
  /** 是否在创建后自动聚焦。 */
  autofocus?: boolean;
  /** 文档内容变化时回调，参数为序列化后的 Markdown。 */
  onChange?: (markdown: string) => void;
  /** 焦点状态变化时回调。 */
  onFocusChange?: (focused: boolean) => void;
  /** 图片粘贴存储回调（data URL → 短 URL）。 */
  onPasteImage?: (dataUrl: string) => Promise<string>;
  /**
   * 是否为 heading 注入 `id="heading-{startLine}"` 锚点（只读态大纲跳转用）。
   * 与 `useMarkdownOutline` 的 `heading-{1-indexed 行号}` 约定对齐。
   */
  headingAnchors?: boolean;
}

/**
 * 为每个 heading 节点注入 `id="heading-{startLine}"` 的 nodeDecoration 插件。
 *
 * parser 已在 heading 节点的 `attrs.startLine` 记录 0-indexed 源行号，而
 * `useMarkdownOutline.buildOutline` 生成的大纲节点 id 为 `heading-{1-indexed 行号}`，
 * 故此处用 `startLine + 1` 对齐后只读态可用 `document.getElementById(node.id)` 精确滚动。
 */
function createHeadingAnchorPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (node.type.name === 'heading') {
            const startLine = node.attrs.startLine as number | null;
            if (startLine != null) {
              // parser 的 startLine 为 0-indexed，useMarkdownOutline 用 1-indexed
              const id = `heading-${startLine + 1}`;
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  id,
                  'data-heading-id': id,
                }),
              );
            }
            return false;
          }
          return true;
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

/**
 * 构造节点名 → NodeView 工厂的映射表。
 *
 * 各 nodeviews 工厂签名均为 `(node, view, getPos) => NodeView`；表格使用
 * prosemirror-tables 内置的 `TableView`（构造签名 `new TableView(node, cellMinWidth)`）。
 */
function buildNodeViews(): Record<string, NodeViewConstructor> {
  return {
    image: (node, view, getPos) => createImageNodeView(node, view, getPos),
    task_item: (node, view, getPos) => createTaskItemNodeView(node, view, getPos),
    html_block: (node, view, getPos) => createHtmlBlockNodeView(node, view, getPos),
    math_block: (node, view, getPos) => createMathBlockNodeView(node, view, getPos),
    mermaid_block: (node, view, getPos) => createMermaidBlockNodeView(node, view, getPos),
    code_block: (node, view, getPos) => createCodeBlockNodeView(node, view, getPos),
    // prosemirror-tables 的 TableView 实现 NodeView 接口，但其构造签名不含
    // view/getPos，这里只取 node 并传入默认最小列宽。
    table: (node: PMNode): NodeView => new TableView(node, TABLE_CELL_MIN_WIDTH),
  };
}

/**
 * 创建并挂载一个 Steno ProseMirror 编辑器视图。
 *
 * @example
 * const view = createEditor({
 *   mount: el,
 *   initialValue: '# 标题',
 *   onChange: md => emit('update:modelValue', md),
 * });
 */
export function createEditor(options: CreateEditorOptions): EditorView {
  const {
    mount,
    initialValue,
    editable = true,
    placeholder,
    autofocus = false,
    onChange,
    onFocusChange,
    onPasteImage,
    headingAnchors = false,
  } = options;

  // 1. 解析初始 Markdown 为 ProseMirror 文档
  const doc = parseMarkdown(initialValue).doc;

  // 2. 装配插件并创建初始 state
  const plugins = createEditorPlugins({ placeholder, onPasteImage });
  if (headingAnchors) {
    plugins.push(createHeadingAnchorPlugin());
  }
  const state = EditorState.create({
    doc,
    plugins,
  });

  // 3. 构造 EditorView
  const view = new EditorView(mount, {
    state,
    editable: () => editable,
    nodeViews: buildNodeViews(),
    // 焦点事件透传给外部（用于联动工具栏 / 状态栏等）
    handleDOMEvents: {
      focus: () => {
        onFocusChange?.(true);
        return false;
      },
      blur: () => {
        onFocusChange?.(false);
        return false;
      },
    },
    dispatchTransaction(this: EditorView, tr: Transaction) {
      const next = this.state.apply(tr);
      this.updateState(next);
      // 仅在文档真正变化时才向外冒泡，避免选区变化触发无谓 onChange
      if (tr.docChanged) {
        onChange?.(serializeDoc(next.doc));
      }
    },
  });

  // 4. 只读模式：关闭拼写检查（editable() 已返回 false 阻止编辑）
  if (!editable) {
    view.dom.setAttribute('spellcheck', 'false');
  }

  // 5. 自动聚焦（microtask 推迟，确保 DOM 已就绪）
  if (autofocus) {
    queueMicrotask(() => view.focus());
  }

  return view;
}
