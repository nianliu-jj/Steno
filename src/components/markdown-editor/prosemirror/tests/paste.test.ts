/**
 * @file Steno 粘贴图片光标落点单元测试
 *
 * 验证粘贴 block 图片后，光标落到图片之后的文本块（必要时补空段落），
 * 而非停留在图片之前。
 */

import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';

import { stenoSchema } from '../schema';
import { parseMarkdown } from '../parser';
import { insertImageWithCaretAfter } from '../plugins/paste';

// 函数 imageNode：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function imageNode(): Node {
  // 局部常量 n：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const n = stenoSchema.nodes.image.createAndFill({ src: 'steno-asset:x.png', alt: 'x' });
  if (!n) throw new Error('cannot create image node');
  return n;
}

// 函数 imageEndPos：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function imageEndPos(state: EditorState): number {
  let end = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'image') end = pos + node.nodeSize;
  });
  return end;
}

// 测试用例：验证「paste — 图片插入后光标落点」场景，锁定 paste 的用户可见行为。
describe('paste — 图片插入后光标落点', () => {
  // 测试用例：验证「空文档粘贴图片后光标落在图片之后的文本块」场景，锁定 paste 的用户可见行为。
  it('空文档粘贴图片后光标落在图片之后的文本块', () => {
    let state = EditorState.create({ schema: stenoSchema });
    state = state.apply(insertImageWithCaretAfter(state, imageNode()));
    const { $from } = state.selection;
    expect($from.parent.isTextblock).toBe(true);
    expect($from.pos).toBeGreaterThanOrEqual(imageEndPos(state));
  });

  // 测试用例：验证「段落中部粘贴图片后光标落在图片之后」场景，锁定 paste 的用户可见行为。
  it('段落中部粘贴图片后光标落在图片之后', () => {
    const { doc } = parseMarkdown('abcdef');
    let state = EditorState.create({ schema: stenoSchema, doc });
    state = state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(4))));
    state = state.apply(insertImageWithCaretAfter(state, imageNode()));
    const { $from } = state.selection;
    expect($from.parent.isTextblock).toBe(true);
    expect($from.pos).toBeGreaterThanOrEqual(imageEndPos(state));
  });
});
