/**
 * @file Steno ProseMirror 编辑器桥接（Phase 7）
 *
 * 职责：在 `createEditor` 之上封装一套命令式 API，供 Vue 组件（Phase 8 的
 * MarkdownEditor.vue）调用，实现 v-model 双向绑定、聚焦、滚动定位等。
 *
 * 关键点 —— 防 onChange↔setContent 死循环：
 *  外部 v-model 变化 → setContent → dispatch 替换全文 tr → docChanged → onChange
 *  → emit('update:modelValue') → 外部 watch 再次触发 setContent … 形成死循环。
 *  这里用两道闸：
 *   1. setContent 内先 `if (getContent() === markdown) return;` 内容相同直接跳过；
 *   2. 替换全文期间置 `applyingExternal = true`，桥接包装的 onChange 在该标志为
 *      真时不向外 emit，从根上切断回流。
 */

import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { serializeDoc } from '../serializer';
import { parseMarkdown } from '../parser';
import { createEditor, type CreateEditorOptions } from './create-editor';

/** 桥接对外暴露的命令式 API。 */
export interface EditorBridge {
  /** 底层 ProseMirror 视图（高级用法/调试用）。 */
  readonly view: EditorView;
  /** 外部 modelValue 变化时回写文档内容。内置防死循环。 */
  setContent: (markdown: string) => void;
  /** 取得当前文档序列化后的 Markdown。 */
  getContent: () => string;
  /** 聚焦编辑器。 */
  focus: () => void;
  /** 滚动到指定源 Markdown 行号对应的块节点。 */
  scrollToLine: (line: number) => void;
  /** 滚动到指定标题（大纲跳转，只读视图用）。 */
  scrollToHeading: (id: string) => void;
  /** 销毁视图，释放资源。 */
  destroy: () => void;
}

/** `createEditorBridge` 选项 —— 与 `CreateEditorOptions` 一致。 */
export type EditorBridgeOptions = CreateEditorOptions;

/**
 * 创建编辑器桥接。内部自行调用 `createEditor` 持有 view，并包装 `onChange`
 * 使其在外部内容回写期间静默。
 */
export function createEditorBridge(options: EditorBridgeOptions): EditorBridge {
  /** 正在应用外部内容（setContent）—— 期间不向外冒泡 onChange。 */
  let applyingExternal = false;

  const userOnChange = options.onChange;

  // 包装 onChange：外部回写期间吞掉，避免 emit → watch → setContent 死循环
  const wrappedOptions: CreateEditorOptions = {
    ...options,
    onChange: (markdown: string) => {
      if (applyingExternal) return;
      userOnChange?.(markdown);
    },
  };

  const view = createEditor(wrappedOptions);

  /** 当前文档序列化。 */
  function getContent(): string {
    return serializeDoc(view.state.doc);
  }

  /** 外部内容回写（防死循环）。 */
  function setContent(markdown: string): void {
    // 闸一：内容相同直接跳过，避免无谓重建与回流
    if (getContent() === markdown) return;

    // 闸二：替换全文期间静默 onChange
    applyingExternal = true;
    try {
      const nextDoc = parseMarkdown(markdown).doc;
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, nextDoc.content);
      // 不留历史合并标记，外部回写视为一次完整替换
      tr.setMeta('addToHistory', false);
      view.dispatch(tr);
    } finally {
      applyingExternal = false;
    }
  }

  /** 聚焦编辑器。 */
  function focus(): void {
    view.focus();
  }

  /**
   * 滚动到指定源行号对应的块节点。
   *
   * 策略：遍历 doc 顶层块节点，找最后一个 `attrs.startLine <= line` 的节点，
   * 用 view.domAtPos 取其 DOM 后 scrollIntoView。jsdom 下测量 API 受限，
   * 整体包 try/catch，定位失败不抛错。
   */
  function scrollToLine(line: number): void {
    try {
      const doc = view.state.doc;
      let targetPos = -1;
      let pos = 0;

      doc.forEach(child => {
        const startLine = child.attrs?.startLine;
        if (typeof startLine === 'number' && startLine <= line) {
          targetPos = pos;
        }
        // +1 跨过节点起始位置，pos 累加节点尺寸推进到下一个顶层块
        pos += child.nodeSize;
      });

      if (targetPos < 0) return;

      // 取目标块的 DOM 并滚动到可视区
      const domInfo = view.domAtPos(targetPos + 1);
      const node = domInfo.node;
      const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      // jsdom / 布局未就绪时静默
    }
  }

  /**
   * 滚动到指定标题（大纲跳转用）。
   *
   * TODO：当前 schema 的 heading 节点未注入稳定 id（无 anchor 机制），这里采用
   *       近似实现 —— 把 id 当作标题纯文本去匹配第一个文本相同的 heading。
   *       Phase 9 大纲落地后若引入 heading id attr，应改为按 id 精确匹配。
   */
  function scrollToHeading(id: string): void {
    try {
      const doc = view.state.doc;
      let targetPos = -1;
      let pos = 0;

      doc.forEach(child => {
        if (
          targetPos < 0
          && child.type.name === 'heading'
          // 近似：textContent 去掉前导 # 与空白后与 id 比较
          && child.textContent.replace(/^#+\s*/, '').trim() === id
        ) {
          targetPos = pos;
        }
        pos += child.nodeSize;
      });

      if (targetPos < 0) return;

      const domInfo = view.domAtPos(targetPos + 1);
      const node = domInfo.node;
      const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      // 静默
    }
  }

  /** 销毁视图。 */
  function destroy(): void {
    view.destroy();
  }

  // 设置初始选区到文档开头（避免某些场景下选区落在非法位置）
  if (view.state.doc.content.size > 0) {
    try {
      const tr = view.state.tr.setSelection(TextSelection.atStart(view.state.doc));
      tr.setMeta('addToHistory', false);
      view.dispatch(tr);
    } catch {
      // 空文档等边界情况静默
    }
  }

  return {
    view,
    setContent,
    getContent,
    focus,
    scrollToLine,
    scrollToHeading,
    destroy,
  };
}
