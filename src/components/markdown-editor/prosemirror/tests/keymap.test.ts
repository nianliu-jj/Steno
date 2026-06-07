/**
 * @file Steno 快捷键插件单元测试
 *
 * 验证 Ctrl/Cmd + 数字 标题快捷键（Mod-1~Mod-6 / Mod-0）。
 */

import { describe, it, expect } from 'vitest';
import { EditorState, type Transaction } from 'prosemirror-state';

import { stenoSchema } from '../schema';
import { createMarkKeymap } from '../plugins/keymap';

function commandFor(key: string) {
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

describe('mark keymap — 标题快捷键', () => {
  it('绑定 Mod-0~Mod-6', () => {
    const map = createMarkKeymap();
    for (let i = 0; i <= 6; i++) {
      expect(typeof map[`Mod-${i}`]).toBe('function');
    }
  });

  it('Mod-1 将段落设为 H1', () => {
    const state = runOnParagraph('Mod-1');
    expect(state.doc.firstChild?.type.name).toBe('heading');
    expect(state.doc.firstChild?.attrs.level).toBe(1);
  });

  it('Mod-3 将段落设为 H3', () => {
    const state = runOnParagraph('Mod-3');
    expect(state.doc.firstChild?.attrs.level).toBe(3);
  });

  it('Mod-0 将标题转回段落', () => {
    let state = EditorState.create({ schema: stenoSchema });
    state = state.apply(state.tr.insertText('hello'));
    const apply = (tr: Transaction) => {
      state = state.apply(tr);
    };
    commandFor('Mod-1')(state, apply);
    commandFor('Mod-0')(state, apply);
    expect(state.doc.firstChild?.type.name).toBe('paragraph');
  });

  it('保留既有 Mod-Alt 标题绑定', () => {
    const map = createMarkKeymap();
    expect(typeof map['Mod-Alt-1']).toBe('function');
    expect(typeof map['Mod-Alt-0']).toBe('function');
  });
});
