/**
 * @file Parser 输出类型
 *
 * 由 PureMark `src/core/types/index.ts` 中的 `SyntaxMarker` 类型移植而来。
 * Steno 在迁移期保留这个接口以兼容未来的位置映射 / instant-render Decoration 需求；
 * 当前 parser 输出的 `markers` 字段固定为空数组，与 PureMark 现状一致。
 */

import type { Node } from 'prosemirror-model';

/** 语法标记的源码与文档位置信息（保留接口，当前实现为占位）。 */
export interface SyntaxMarker {
  /** 语法类型，如 'strong' / 'emphasis' / 'code_inline' / 'link' … */
  type: string;
  /** 起始符号文本（例如 `**`） */
  prefix: string;
  /** 结束符号文本（例如 `**`） */
  suffix: string;
  /** 源码中的起始字符偏移 */
  sourceStart: number;
  /** 源码中的结束字符偏移 */
  sourceEnd: number;
  /** 文档中的起始位置 */
  docStart: number;
  /** 文档中的结束位置 */
  docEnd: number;
}

/** parser 解析结果。 */
export interface ParseResult {
  /** 生成的 ProseMirror 文档节点 */
  doc: Node;
  /** 语法标记集合（当前为占位，预留给后续插件消费） */
  markers: SyntaxMarker[];
}
