/**
 * @file Steno 快捷键插件单元测试
 *
 * 验证 Ctrl/Cmd + 数字 标题快捷键（Mod-1~Mod-6 / Mod-0）。
 */

import { describe, it, expect } from 'vitest';
import { EditorState, type Transaction } from 'prosemirror-state';

import { stenoSchema } from '../schema';
import { createMarkKeymap } from '../plugins/keymap';

// 函数 commandFor：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function commandFor(key: string) {
  // 局部常量 cmd：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const cmd = createMarkKeymap()[key];
  if (!cmd) throw new Error(`no command bound for ${key}`);
  return cmd;
}

/** 在含文本的段落上执行命令，返回结果状态。 */
function runOnParagraph(key: string): EditorState {
  let state = EditorState.create({ schema: stenoSchema });
  state = state.apply(state.tr.insertText('hello'));
  commandFor(key)(state, (tr: Transaction) => {
    state = state.apply(tr);
  });
  return state;
}

// 测试用例：验证「mark keymap — 标题快捷键」场景，锁定 keymap 的用户可见行为。
describe('mark keymap — 标题快捷键', () => {
  // 测试用例：验证「绑定 Mod-0~Mod-6」场景，锁定 keymap 的用户可见行为。
  it('绑定 Mod-0~Mod-6', () => {
    // 局部常量 map：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const map = createMarkKeymap();
    for (let i = 0; i <= 6; i++) {
      expect(typeof map[`Mod-${i}`]).toBe('function');
    }
  });

  // 测试用例：验证「Mod-1 将段落设为 H1」场景，锁定 keymap 的用户可见行为。
  it('Mod-1 将段落设为 H1', () => {
    // 局部常量 state：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const state = runOnParagraph('Mod-1');
    expect(state.doc.firstChild?.type.name).toBe('heading');
    expect(state.doc.firstChild?.attrs.level).toBe(1);
  });

  // 测试用例：验证「Mod-3 将段落设为 H3」场景，锁定 keymap 的用户可见行为。
  it('Mod-3 将段落设为 H3', () => {
    // 局部常量 state：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const state = runOnParagraph('Mod-3');
    expect(state.doc.firstChild?.attrs.level).toBe(3);
  });

  // 测试用例：验证「Mod-0 将标题转回段落」场景，锁定 keymap 的用户可见行为。
  it('Mod-0 将标题转回段落', () => {
    let state = EditorState.create({ schema: stenoSchema });
    state = state.apply(state.tr.insertText('hello'));
    // 函数式常量 apply：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
    const apply = (tr: Transaction) => {
      state = state.apply(tr);
    };
    commandFor('Mod-1')(state, apply);
    commandFor('Mod-0')(state, apply);
    expect(state.doc.firstChild?.type.name).toBe('paragraph');
  });

  // 测试用例：验证「保留既有 Mod-Alt 标题绑定」场景，锁定 keymap 的用户可见行为。
  it('保留既有 Mod-Alt 标题绑定', () => {
    // 局部常量 map：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const map = createMarkKeymap();
    expect(typeof map['Mod-Alt-1']).toBe('function');
    expect(typeof map['Mod-Alt-0']).toBe('function');
  });
});
