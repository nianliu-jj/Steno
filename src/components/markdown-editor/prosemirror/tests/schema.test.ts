/**
 * @file Steno ProseMirror schema 单元测试
 *
 * 验证由 PureMark 移植的 schema 装配正确：
 * - 所有必要节点类型存在（含 Steno 新增的 mermaid_block）
 * - 所有必要 mark 类型存在（含 syntax_marker / html_inline）
 * - 可创建空文档与简单的段落/标题/列表/表格/代码块
 * - Steno 增量 attr `startLine` 默认为 null，可被 attrs 写入
 */

import { describe, it, expect } from 'vitest';

import { stenoSchema, SAFE_INLINE_TAGS, parseHtmlAttrs } from '../schema';

describe('stenoSchema 节点定义', () => {
  it('包含所有必要的 node 类型', () => {
    const required = [
      'doc',
      'paragraph',
      'heading',
      'blockquote',
      'horizontal_rule',
      'bullet_list',
      'ordered_list',
      'list_item',
      'task_list',
      'task_item',
      'code_block',
      'math_block',
      'mermaid_block',
      'html_block',
      'table',
      'table_row',
      'table_cell',
      'table_header',
      'image',
      'text',
      'hard_break',
    ];
    for (const name of required) {
      expect(stenoSchema.nodes[name], `缺少节点 ${name}`).toBeDefined();
    }
  });

  it('paragraph 默认 startLine 为 null', () => {
    const p = stenoSchema.node('paragraph');
    expect(p.attrs.startLine).toBeNull();
  });

  it('heading 接受 level / startLine attr', () => {
    const h = stenoSchema.node('heading', { level: 3, startLine: 5 }, [stenoSchema.text('hi')]);
    expect(h.attrs.level).toBe(3);
    expect(h.attrs.startLine).toBe(5);
    expect(h.textContent).toBe('hi');
  });

  it('可创建包含段落的空文档', () => {
    const doc = stenoSchema.node('doc', null, [stenoSchema.node('paragraph')]);
    expect(doc.firstChild?.type.name).toBe('paragraph');
  });

  it('可创建 task_item（默认 checked=false）', () => {
    const item = stenoSchema.node(
      'task_item',
      null,
      [stenoSchema.node('paragraph', null, [stenoSchema.text('todo')])],
    );
    expect(item.attrs.checked).toBe(false);
  });

  it('可创建带表头的表格', () => {
    const headerCell = stenoSchema.node('table_header', null, [stenoSchema.text('A')]);
    const cell = stenoSchema.node('table_cell', null, [stenoSchema.text('a')]);
    const table = stenoSchema.node('table', null, [
      stenoSchema.node('table_row', null, [headerCell]),
      stenoSchema.node('table_row', null, [cell]),
    ]);
    expect(table.childCount).toBe(2);
    expect(table.firstChild?.firstChild?.type.name).toBe('table_header');
  });
});

describe('stenoSchema mark 定义', () => {
  it('包含所有必要的 mark 类型（含 syntax_marker / html_inline）', () => {
    const required = [
      'strong',
      'emphasis',
      'code_inline',
      'strikethrough',
      'link',
      'highlight',
      'math_inline',
      'sub',
      'sup',
      'html_inline',
      'footnote_ref',
      'syntax_marker',
    ];
    for (const name of required) {
      expect(stenoSchema.marks[name], `缺少 mark ${name}`).toBeDefined();
    }
  });

  it('link mark 携带 href / title attrs', () => {
    const linkMark = stenoSchema.marks.link.create({ href: 'https://example.com', title: 't' });
    expect(linkMark.attrs.href).toBe('https://example.com');
    expect(linkMark.attrs.title).toBe('t');
  });

  it('syntax_marker mark 携带 syntaxType attr', () => {
    const m = stenoSchema.marks.syntax_marker.create({ syntaxType: 'strong' });
    expect(m.attrs.syntaxType).toBe('strong');
  });

  it('html_inline mark 默认 tag=span，可接收任意 htmlAttrs 字符串', () => {
    const m = stenoSchema.marks.html_inline.create({ tag: 'u', htmlAttrs: 'class="hl"' });
    expect(m.attrs.tag).toBe('u');
    expect(m.attrs.htmlAttrs).toBe('class="hl"');
  });
});

describe('html-inline 白名单与属性清洗', () => {
  it('SAFE_INLINE_TAGS 至少含截图二需要的 u / mark / kbd / del 等', () => {
    expect(SAFE_INLINE_TAGS.has('u')).toBe(true);
    expect(SAFE_INLINE_TAGS.has('mark')).toBe(true);
    expect(SAFE_INLINE_TAGS.has('kbd')).toBe(true);
    expect(SAFE_INLINE_TAGS.has('del')).toBe(true);
    expect(SAFE_INLINE_TAGS.has('sub')).toBe(true);
    expect(SAFE_INLINE_TAGS.has('sup')).toBe(true);
  });

  it('parseHtmlAttrs 解析常规属性', () => {
    const r = parseHtmlAttrs('class="foo" style="color:red"');
    expect(r.class).toBe('foo');
    expect(r.style).toBe('color:red');
  });

  it('parseHtmlAttrs 剥离 on* 事件属性', () => {
    const r = parseHtmlAttrs('onclick="alert(1)" class="x"');
    expect(r.onclick).toBeUndefined();
    expect(r.class).toBe('x');
  });

  it('parseHtmlAttrs 剥离 javascript: / vbscript: / data: 协议链接', () => {
    expect(parseHtmlAttrs('href="javascript:alert(1)"').href).toBeUndefined();
    expect(parseHtmlAttrs('src="vbscript:msgbox"').src).toBeUndefined();
    expect(parseHtmlAttrs('action="data:text/html,..."').action).toBeUndefined();
  });

  it('parseHtmlAttrs 空串与无值情况', () => {
    expect(parseHtmlAttrs('')).toEqual({});
    expect(parseHtmlAttrs('disabled')).toEqual({ disabled: '' });
  });
});
