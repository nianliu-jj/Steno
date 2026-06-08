/**
 * @file Steno 快捷键插件
 *
 * 移植自 PureMark `src/core/keymap/index.ts`（405 行）+ commands。
 *
 * Steno 适配说明（关键裁剪点）：
 * - 按任务约定「能用、简单」为准：PureMark 的动态 keymap 体系
 *   （shortcut-registry / dynamic-keymap / action-commands）较庞大，这里裁剪为
 *   一个静态 keymap 对象 + 必要命令。保证 Bold/Italic/Code/Strikethrough/Highlight/
 *   Link/标题切换/Undo/Redo 可用。
 * - 保留 PureMark 的块级 Enter（``` / --- 转换）与列表 Enter/Tab/Backspace 处理，
 *   但移除其中依赖 source-view 段落 attrs（listId/codeBlockId/lineIndex…）的分支
 *   —— Steno 暂不实现 source-view 的块转换。
 * - Undo/Redo 由 `./history` 的 historyKeymap 单独提供（装配时合并）。
 * - `any` 替换为具体类型。
 */

import { keymap } from 'prosemirror-keymap';
import { type Command, Plugin, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { Schema } from 'prosemirror-model';
import { selectParentNode, baseKeymap } from 'prosemirror-commands';
import { splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { stenoSchema } from '../schema';
import { decorationPluginKey } from '../decorations';
import {
  toggleStrong,
  toggleEmphasis,
  toggleCodeInline,
  toggleStrikethrough,
  toggleHighlight,
  setHeading,
  setParagraph
} from './commands';

/** 快捷键配置 */
export interface KeymapConfig {
  /** 是否启用列表快捷键（Enter/Tab/Backspace） */
  list?: boolean;
}

const defaultConfig: Required<KeymapConfig> = {
  list: true
};

// 类型 Dispatch：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
type Dispatch = ((tr: Transaction) => void) | undefined;

/**
 * 块级元素 Enter 处理：
 * - 段落文本是 `---`/`***`/`___` 时创建分隔线
 * - 段落文本是 ``` 或 ```lang 时创建代码块
 */
function createBlockEnterKeymap(schema: Schema): Record<string, Command> {
  return {
    Enter: (state: EditorState, dispatch?: Dispatch) => {
      const { $from, empty } = state.selection;
      if (!empty) return false;

      // 局部常量 parent：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const parent = $from.parent;
      if (parent.type.name !== 'paragraph') return false;

      // 局部常量 text：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const text = parent.textContent;
      // 局部常量 depth：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const depth = $from.depth;
      // 局部常量 paragraphStart：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const paragraphStart = $from.before(depth);
      // 局部常量 paragraphEnd：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const paragraphEnd = $from.after(depth);

      // 分隔线
      if (schema.nodes.horizontal_rule && /^([-*_])\1{2,}$/.test(text)) {
        // 局部常量 decorationState：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const decorationState = decorationPluginKey.getState(state);
        if (decorationState?.sourceView) return false;

        // 局部常量 hr：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const hr = schema.nodes.horizontal_rule.create();
        // 局部常量 paragraph：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const paragraph = schema.nodes.paragraph.create();
        // 局部常量 tr：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const tr = state.tr.replaceWith(paragraphStart, paragraphEnd, [hr, paragraph]);
        tr.setSelection(TextSelection.create(tr.doc, paragraphStart + hr.nodeSize + 1));
        dispatch?.(tr);
        return true;
      }

      // 代码块
      if (schema.nodes.code_block) {
        // 局部常量 decorationState：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const decorationState = decorationPluginKey.getState(state);
        if (decorationState?.sourceView) return false;

        // 局部常量 codeBlockMatch：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const codeBlockMatch = /^```(\w*)$/.exec(text);
        if (!codeBlockMatch) return false;

        // 局部常量 language：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const language = codeBlockMatch[1] || '';
        // 局部常量 codeBlock：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const codeBlock = schema.nodes.code_block.create({ language });
        // 局部常量 tr：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const tr = state.tr.replaceWith(paragraphStart, paragraphEnd, codeBlock);
        tr.setSelection(TextSelection.create(tr.doc, paragraphStart + 1));
        dispatch?.(tr);
        return true;
      }

      return false;
    }
  };
}

/**
 * 列表快捷键（Enter 拆分列表项 / Tab 缩进 / Shift-Tab 取消缩进 / Backspace 删除）
 */
function createListKeymap(schema: Schema): Record<string, Command> {
  const keys: Record<string, Command> = {};

  // 局部常量 listItemSplit：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const listItemSplit = schema.nodes.list_item ? splitListItem(schema.nodes.list_item) : null;
  // 局部常量 taskItemSplit：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const taskItemSplit = schema.nodes.task_item ? splitListItem(schema.nodes.task_item) : null;

  if (listItemSplit || taskItemSplit) {
    keys.Enter = (state: EditorState, dispatch?: Dispatch) => {
      const { empty } = state.selection;
      if (!empty) return false;
      // 先尝试拆分任务列表项，再尝试普通列表项
      if (taskItemSplit && taskItemSplit(state, dispatch)) return true;
      if (listItemSplit && listItemSplit(state, dispatch)) return true;
      return false;
    };
  }

  // Backspace：math_block 开头退出到段落；其余走默认/逐字符删除
  keys.Backspace = (state: EditorState, dispatch?: Dispatch) => {
    const { $from, empty } = state.selection;
    if (!empty) return false;

    if ($from.parent.type.name === 'math_block' && $from.parentOffset === 0) {
      // 局部常量 mathNode：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const mathNode = $from.parent;
      if (dispatch) {
        // 局部常量 mathDepth：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const mathDepth = $from.depth;
        // 局部常量 mathPos：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const mathPos = $from.before(mathDepth);
        // 局部常量 mathEnd：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const mathEnd = $from.after(mathDepth);
        let tr: Transaction;

        if (mathNode.textContent.length === 0) {
          tr = state.tr.delete(mathPos, mathEnd);
          if (tr.doc.content.size === 0) {
            // 局部常量 paragraph：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
            const paragraph = state.schema.nodes.paragraph.create();
            tr.insert(0, paragraph);
            tr.setSelection(TextSelection.create(tr.doc, 1));
          } else {
            const $pos = tr.doc.resolve(Math.min(mathPos, tr.doc.content.size));
            tr.setSelection(TextSelection.create(tr.doc, Math.max(1, $pos.pos)));
          }
        } else {
          // 局部常量 paragraph：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
          const paragraph = state.schema.nodes.paragraph.create(
            null,
            mathNode.textContent ? state.schema.text(mathNode.textContent) : null
          );
          tr = state.tr.replaceWith(mathPos, mathEnd, paragraph);
          tr.setSelection(TextSelection.create(tr.doc, mathPos + 1));
        }
        dispatch(tr);
      }
      return true;
    }

    // 段落开头：交给默认行为（合并段落 / 列表项）
    if ($from.parentOffset === 0) return false;

    // 删除光标前一个字符
    if (dispatch) {
      dispatch(state.tr.delete($from.pos - 1, $from.pos));
    }
    return true;
  };

  // Tab / Shift-Tab
  const sinkList = schema.nodes.list_item ? sinkListItem(schema.nodes.list_item) : null;
  // 局部常量 liftList：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const liftList = schema.nodes.list_item ? liftListItem(schema.nodes.list_item) : null;

  keys.Tab = (state: EditorState, dispatch?: Dispatch) => {
    if (sinkList && sinkList(state, dispatch)) return true;
    // 非列表上下文：插入两个空格
    if (dispatch) dispatch(state.tr.insertText('  '));
    return true;
  };

  keys['Shift-Tab'] = (state: EditorState, dispatch?: Dispatch) => {
    if (liftList && liftList(state, dispatch)) return true;
    const { $from } = state.selection;
    // 局部常量 lineText：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const lineText = $from.parent.textContent;
    if (lineText.startsWith('  ') && dispatch) {
      // 局部常量 startOfNode：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const startOfNode = $from.pos - $from.parentOffset;
      dispatch(state.tr.delete(startOfNode, startOfNode + 2));
    }
    return true;
  };

  return keys;
}

/**
 * 静态格式化快捷键（Markdown WYSIWYG 常用）
 */
function createMarkKeymap(): Record<string, Command> {
  return {
    'Mod-b': toggleStrong,
    'Mod-i': toggleEmphasis,
    'Mod-e': toggleCodeInline,
    'Mod-Shift-x': toggleStrikethrough,
    'Mod-Shift-h': toggleHighlight,
    'Mod-Alt-1': setHeading(1),
    'Mod-Alt-2': setHeading(2),
    'Mod-Alt-3': setHeading(3),
    'Mod-Alt-4': setHeading(4),
    'Mod-Alt-5': setHeading(5),
    'Mod-Alt-6': setHeading(6),
    'Mod-Alt-0': setParagraph,
    // Ctrl/Cmd + 数字 直接套用标题（需求：Ctrl+1 = H1）
    'Mod-1': setHeading(1),
    'Mod-2': setHeading(2),
    'Mod-3': setHeading(3),
    'Mod-4': setHeading(4),
    'Mod-5': setHeading(5),
    'Mod-6': setHeading(6),
    'Mod-0': setParagraph
  };
}

/**
 * 创建快捷键插件集合（块级 Enter / Escape / 格式化 / 列表）。
 * Undo/Redo 由 `./history` 提供，装配时合并。
 */
export function createKeymapPlugins(schema: Schema = stenoSchema, config: KeymapConfig = {}): Plugin[] {
  // 局部常量 mergedConfig：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const mergedConfig = { ...defaultConfig, ...config };
  const plugins: Plugin[] = [];

  // 块级 Enter（优先级最高）
  plugins.push(keymap(createBlockEnterKeymap(schema)));
  // 格式化快捷键
  plugins.push(keymap(createMarkKeymap()));
  // Escape 选择父节点
  plugins.push(keymap({ Escape: selectParentNode }));

  if (mergedConfig.list) {
    plugins.push(keymap(createListKeymap(schema)));
  }

  // 基础键位兜底（优先级最低）：上面的自定义 Enter（块级 ```/--- 转换、列表项拆分）
  // 未处理时，由 baseKeymap 的 Enter 链提供普通段落 splitBlock、代码块 newlineInCode；
  // 同时补齐 Backspace 段首合并、Delete、Mod-a 全选等基础编辑能力。
  plugins.push(keymap(baseKeymap));

  return plugins;
}

export { createBlockEnterKeymap, createListKeymap, createMarkKeymap };
