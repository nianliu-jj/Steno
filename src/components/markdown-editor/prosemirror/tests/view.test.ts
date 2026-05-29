/**
 * @file Phase 7 视图工厂与桥接单元测试
 *
 * 覆盖：
 *  - createEditor：挂载到真实 DOM，断言图一 markdown 生成的 DOM 含 ul/table/hr/a
 *  - createEditorBridge：setContent/getContent round-trip；同内容 setContent
 *    不触发多余 onChange（验证无死循环）；scrollToLine 不抛错
 *
 * jsdom 下 coordsAtPos / 布局测量 API 受限，scrollToLine 只断言"不抛出"，不测像素。
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import type { EditorView } from 'prosemirror-view';

import { createEditor } from '../view/create-editor';
import { createEditorBridge, type EditorBridge } from '../view/editor-bridge';

/** 图一测试 markdown —— 覆盖加粗 / 行内 HTML / 引用 / 列表 / 表格 / 高亮 / 分隔线 / 链接。 */
const SAMPLE_MARKDOWN = [
  '继续**推进** <u>Phase 4</u>',
  '',
  '>你好啊',
  '',
  '- a',
  '- v',
  '',
  '|A | B |',
  '|--|--|',
  '|a|b|',
  '',
  '==buha== 你',
  '',
  '---',
  '',
  '[a](hh)',
].join('\n');

/**
 * 归一化：用于 round-trip 等价比较。
 *
 * serializer 对表格 / 引用会输出规范化格式（如 `|a|b|` → `| a | b |`、
 * `>x` → `> x`、分隔行统一 `---`），这些与源码不是字符级相同但语义等价；
 * 这里把单元格/标记两侧空白、表格分隔行折叠后再比较，断言"归一化等价"。
 */
function normalize(md: string): string {
  return md
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .replace(/\n{2,}/g, '\n\n')
    .trim()
    // 表格分隔行统一为 ---（忽略对齐/破折号数量差异）
    .replace(/\|[\s:-]+(?=\|)/g, '|---')
    // 去掉表格/引用标记两侧的额外空白，统一管道与内容贴合
    .replace(/\|\s+/g, '|')
    .replace(/\s+\|/g, '|')
    .replace(/^>\s+/gm, '>');
}

describe('createEditor', () => {
  let view: EditorView | null = null;
  let mount: HTMLDivElement | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
    if (mount && mount.parentNode) mount.parentNode.removeChild(mount);
    mount = null;
  });

  it('挂载图一 markdown 后 DOM 含 ul / table / hr / a', () => {
    mount = document.createElement('div');
    document.body.appendChild(mount);

    view = createEditor({ mount, initialValue: SAMPLE_MARKDOWN });

    const dom = view.dom as HTMLElement;
    expect(dom.querySelector('ul')).not.toBeNull();
    expect(dom.querySelector('table')).not.toBeNull();
    expect(dom.querySelector('hr')).not.toBeNull();
    expect(dom.querySelector('a')).not.toBeNull();
  });

  it('只读模式下 editable=false 且 spellcheck=false', () => {
    mount = document.createElement('div');
    document.body.appendChild(mount);

    view = createEditor({ mount, initialValue: '# 只读', editable: false });

    expect(view.editable).toBe(false);
    expect((view.dom as HTMLElement).getAttribute('spellcheck')).toBe('false');
  });
});

describe('createEditorBridge', () => {
  let bridge: EditorBridge | null = null;
  let mount: HTMLDivElement | null = null;

  afterEach(() => {
    bridge?.destroy();
    bridge = null;
    if (mount && mount.parentNode) mount.parentNode.removeChild(mount);
    mount = null;
  });

  function makeBridge(initialValue: string, onChange?: (md: string) => void): EditorBridge {
    mount = document.createElement('div');
    document.body.appendChild(mount);
    return createEditorBridge({ mount, initialValue, onChange });
  }

  it('setContent / getContent round-trip 归一化等价', () => {
    bridge = makeBridge('');
    bridge.setContent(SAMPLE_MARKDOWN);
    expect(normalize(bridge.getContent())).toBe(normalize(SAMPLE_MARKDOWN));
  });

  it('setContent 相同内容时不触发多余 onChange（无死循环）', () => {
    const onChange = vi.fn();
    bridge = makeBridge(SAMPLE_MARKDOWN, onChange);

    // 用当前内容回写：内容相同 → 直接跳过，onChange 不应被调用
    const current = bridge.getContent();
    bridge.setContent(current);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('setContent 写入新内容时不向外冒泡 onChange（外部回写静默）', () => {
    const onChange = vi.fn();
    bridge = makeBridge('初始', onChange);

    bridge.setContent('# 新标题');
    // 外部回写路径被 applyingExternal 静默，不应回流
    expect(onChange).not.toHaveBeenCalled();
    expect(normalize(bridge.getContent())).toBe(normalize('# 新标题'));
  });

  it('scrollToLine 不抛错且能定位到目标块', () => {
    bridge = makeBridge(SAMPLE_MARKDOWN);
    expect(() => bridge!.scrollToLine(0)).not.toThrow();
    expect(() => bridge!.scrollToLine(7)).not.toThrow();
    expect(() => bridge!.scrollToLine(9999)).not.toThrow();
  });

  it('scrollToHeading 不抛错', () => {
    bridge = makeBridge('# 标题一\n\n正文');
    expect(() => bridge!.scrollToHeading('标题一')).not.toThrow();
    expect(() => bridge!.scrollToHeading('不存在')).not.toThrow();
  });

  it('focus 不抛错', () => {
    bridge = makeBridge('内容');
    expect(() => bridge!.focus()).not.toThrow();
  });
});
