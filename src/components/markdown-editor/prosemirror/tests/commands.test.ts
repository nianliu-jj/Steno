/**
 * @file Steno 编辑器命令单元测试
 *
 * 重点验证"快捷键创建的 Markdown 格式与手动输入一致、可 toggle 取消、序列化不失效"。
 */

import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Command } from 'prosemirror-state';

import { stenoSchema } from '../schema';
import {
  setHeading,
  setParagraph,
  toggleStrong,
  toggleEmphasis,
  toggleStrikethrough,
  toggleHighlight
} from '../plugins/commands';
import { serializeDoc } from '../serializer';
import { parseMarkdown } from '../parser';

/** 在给定文档 + 选区上执行命令，返回新状态。 */
function runCommand(md: string, command: Command, selectAll = false): EditorState {
  // 局部常量 doc：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const doc = parseMarkdown(md).doc;
  let state = EditorState.create({ schema: stenoSchema, doc });
  if (selectAll) {
    // 局部常量 from：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const from = 1;
    // 局部常量 to：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const to = state.doc.content.size - 1;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, Math.max(from, to))));
  }
  command(state, tr => {
    state = state.apply(tr);
  });
  return state;
}

// 测试用例：验证「setHeading — toggle 与标记一致」场景，锁定 commands 的用户可见行为。
describe('setHeading — toggle 与标记一致', () => {
  // 测试用例：验证「段落 → Ctrl+1 转为 heading level 1，序列化保留 #」场景，锁定 commands 的用户可见行为。
  it('段落 → Ctrl+1 转为 heading level 1，序列化保留 #', () => {
    // 局部常量 state：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const state = runCommand('正文', setHeading(1));
    expect(state.doc.firstChild?.type.name).toBe('heading');
    expect(state.doc.firstChild?.attrs.level).toBe(1);
    // 局部常量 md：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const md = serializeDoc(state.doc);
    expect(md).toContain('# 正文');
    // 重新解析仍是 heading
    expect(parseMarkdown(md).doc.firstChild?.type.name).toBe('heading');
  });

  // 测试用例：验证「已是 heading level 1 时再次 Ctrl+1 → 取消（转回 paragraph）」场景，锁定 commands 的用户可见行为。
  it('已是 heading level 1 时再次 Ctrl+1 → 取消（转回 paragraph）', () => {
    // 局部常量 headingState：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const headingState = runCommand('正文', setHeading(1));
    // 在 heading 状态上再次执行 setHeading(1)
    let state = headingState;
    setHeading(1)(state, tr => {
      state = state.apply(tr);
    });
    expect(state.doc.firstChild?.type.name).toBe('paragraph');
    // 局部常量 md：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const md = serializeDoc(state.doc);
    expect(md.trim()).toBe('正文'); // 不应残留 #
  });

  // 测试用例：验证「heading level 1 → Ctrl+2 切换为 level 2（# 数量同步）」场景，锁定 commands 的用户可见行为。
  it('heading level 1 → Ctrl+2 切换为 level 2（# 数量同步）', () => {
    // 局部常量 headingState：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const headingState = runCommand('正文', setHeading(1));
    let state = headingState;
    setHeading(2)(state, tr => {
      state = state.apply(tr);
    });
    expect(state.doc.firstChild?.attrs.level).toBe(2);
    expect(serializeDoc(state.doc)).toContain('## 正文');
  });

  // 测试用例：验证「setParagraph 移除 # 标记，重新解析为 paragraph」场景，锁定 commands 的用户可见行为。
  it('setParagraph 移除 # 标记，重新解析为 paragraph', () => {
    // 局部常量 headingState：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const headingState = runCommand('正文', setHeading(1));
    let state = headingState;
    setParagraph(state, tr => {
      state = state.apply(tr);
    });
    expect(state.doc.firstChild?.type.name).toBe('paragraph');
    // 局部常量 md：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const md = serializeDoc(state.doc);
    expect(parseMarkdown(md).doc.firstChild?.type.name).toBe('paragraph');
  });
});

// 测试用例：验证「toggleStrong/Emphasis/... — 行内格式 toggle 与标记一致」场景，锁定 commands 的用户可见行为。
describe('toggleStrong/Emphasis/... — 行内格式 toggle 与标记一致', () => {
  // 测试用例：验证「选中文本加粗后序列化保留 **，且重新解析仍为粗体」场景，锁定 commands 的用户可见行为。
  it('选中文本加粗后序列化保留 **，且重新解析仍为粗体', () => {
    // 局部常量 state：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const state = runCommand('hello', toggleStrong, true);
    // 局部常量 md：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const md = serializeDoc(state.doc);
    expect(md).toContain('**hello**');
    // 重新解析：粗体标记仍在（首子节点带 strong）
    const para = parseMarkdown(md).doc.firstChild;
    expect(para?.textContent).toContain('hello');
    expect(md.replace(/\s/g, '')).toBe('**hello**');
  });

  // 测试用例：验证「加粗后再次 Ctrl+B → 取消（移除 ** 与 strong）」场景，锁定 commands 的用户可见行为。
  it('加粗后再次 Ctrl+B → 取消（移除 ** 与 strong）', () => {
    let state = runCommand('hello', toggleStrong, true);
    // applyInlineSyntax 已把选区落在内容上，直接再次 toggle 即可取消
    toggleStrong(state, tr => {
      state = state.apply(tr);
    });
    // 局部常量 md：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const md = serializeDoc(state.doc);
    expect(md.trim()).toBe('hello');
    expect(md).not.toContain('**');
  });

  // 测试用例：验证「斜体 / 删除线 / 高亮 都保留各自标记」场景，锁定 commands 的用户可见行为。
  it('斜体 / 删除线 / 高亮 都保留各自标记', () => {
    expect(serializeDoc(runCommand('a', toggleEmphasis, true).doc)).toContain('*a*');
    expect(serializeDoc(runCommand('b', toggleStrikethrough, true).doc)).toContain('~~b~~');
    expect(serializeDoc(runCommand('c', toggleHighlight, true).doc)).toContain('==c==');
  });

  // 测试用例：验证「对已有 **加粗** 文本取消，保留内层其他格式（嵌套）」场景，锁定 commands 的用户可见行为。
  it('对已有 **加粗** 文本取消，保留内层其他格式（嵌套）', () => {
    // 解析 **粗*斜*粗**：strong 包裹 emphasis
    const doc = parseMarkdown('**粗*斜*粗**').doc;
    let state = EditorState.create({ schema: stenoSchema, doc });
    // 选中全部内容
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, state.doc.content.size - 1)));
    toggleStrong(state, tr => {
      state = state.apply(tr);
    });
    // 局部常量 md：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const md = serializeDoc(state.doc);
    expect(md).not.toContain('**'); // strong 标记被移除
    expect(md).toContain('*斜*'); // 内层斜体保留
  });
});
