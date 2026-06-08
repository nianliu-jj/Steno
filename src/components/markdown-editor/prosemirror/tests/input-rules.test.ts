/**
 * @file Steno 输入规则单元测试
 *
 * 验证块级标题语法在输入时即时转换（对应"标题即时渲染"修复）。
 * 通过 `inputRules` 插件的 `handleTextInput` 模拟逐字符输入路径。
 */

import { describe, it, expect } from 'vitest';
import { EditorState, type Transaction } from 'prosemirror-state';

import { stenoSchema } from '../schema';
import { createInputRulesPlugin } from '../plugins/input-rules';
import { serializeDoc } from '../serializer';
import { parseMarkdown } from '../parser';

/** 模拟逐字符输入序列，返回最终编辑器状态。 */
function typeSequence(seq: string): EditorState {
  // 局部常量 plugin：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const plugin = createInputRulesPlugin(stenoSchema);
  let state = EditorState.create({ schema: stenoSchema, plugins: [plugin] });
  // 局部常量 view：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = state.apply(tr);
    },
    composing: false
  };
  // handleTextInput 的类型带 `this` 形参，转型为不含 this 的 4 参函数以便直接调用。
  const handleTextInput = plugin.props.handleTextInput as
    | ((view: unknown, from: number, to: number, text: string) => boolean)
    | undefined;
  for (const ch of seq) {
    const { from, to } = state.selection;
    // 局部常量 handled：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const handled = handleTextInput?.(view, from, to, ch);
    if (!handled) {
      state = state.apply(state.tr.insertText(ch));
    }
  }
  return state;
}

// 测试用例：验证「input rules — 标题即时渲染」场景，锁定 input rules 的用户可见行为。
describe('input rules — 标题即时渲染', () => {
  // 测试用例：验证「输入 」场景，锁定 input rules 的用户可见行为。
  it('输入 "# " 即时转换为 heading level=1', () => {
    // 局部常量 state：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const state = typeSequence('# ');
    // 局部常量 first：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const first = state.doc.firstChild;
    expect(first?.type.name).toBe('heading');
    expect(first?.attrs.level).toBe(1);
  });

  // 测试用例：验证「输入 」场景，锁定 input rules 的用户可见行为。
  it('输入 "### " 即时转换为 heading level=3', () => {
    // 局部常量 state：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const state = typeSequence('### ');
    expect(state.doc.firstChild?.attrs.level).toBe(3);
  });

  // 测试用例：验证「输入 」场景，锁定 input rules 的用户可见行为。
  it('输入 "###### " 即时转换为 heading level=6', () => {
    // 局部常量 state：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const state = typeSequence('###### ');
    expect(state.doc.firstChild?.attrs.level).toBe(6);
  });

  // 测试用例：验证「普通文本不会被误转换为标题」场景，锁定 input rules 的用户可见行为。
  it('普通文本不会被误转换为标题', () => {
    // 局部常量 state：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const state = typeSequence('hello ');
    expect(state.doc.firstChild?.type.name).toBe('paragraph');
  });
});

// 测试用例：验证「input rules — 标题 Markdown 往返（回归：速记/编辑页重新进入标题失效）」场景，锁定 input rules 的用户可见行为。
describe('input rules — 标题 Markdown 往返（回归：速记/编辑页重新进入标题失效）', () => {
  // 测试用例：验证「输入 」场景，锁定 input rules 的用户可见行为。
  it('输入 "# 标题" 序列化后保留 # 级别标记', () => {
    // 此前 headingRule 直接 delete 掉 "#"，导致序列化丢失级别标记，
    // 保存到库后再次解析就退化成普通段落（标题失效）。
    const state = typeSequence('# 标题');
    expect(serializeDoc(state.doc)).toContain('# 标题');
  });

  // 测试用例：验证「输入 」场景，锁定 input rules 的用户可见行为。
  it('输入 "### 三级标题" 序列化后保留 ### 标记', () => {
    // 局部常量 state：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const state = typeSequence('### 三级标题');
    expect(serializeDoc(state.doc)).toContain('### 三级标题');
  });

  // 测试用例：验证「标题完整往返：输入 → 序列化 → 重新解析仍是对应级别 heading」场景，锁定 input rules 的用户可见行为。
  it('标题完整往返：输入 → 序列化 → 重新解析仍是对应级别 heading', () => {
    // 局部常量 state：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const state = typeSequence('## 二级');
    // 局部常量 md：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const md = serializeDoc(state.doc);
    // 局部常量 reparsed：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const reparsed = parseMarkdown(md).doc;
    expect(reparsed.firstChild?.type.name).toBe('heading');
    expect(reparsed.firstChild?.attrs.level).toBe(2);
  });

  // 测试用例：验证「标题中的行内强调随 # 一并正确往返」场景，锁定 input rules 的用户可见行为。
  it('标题中的行内强调随 # 一并正确往返', () => {
    // 局部常量 state：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const state = typeSequence('# 标题**粗**');
    // 局部常量 md：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const md = serializeDoc(state.doc);
    expect(md).toContain('# 标题');
    expect(md).toContain('**粗**');
    expect(parseMarkdown(md).doc.firstChild?.type.name).toBe('heading');
  });
});
