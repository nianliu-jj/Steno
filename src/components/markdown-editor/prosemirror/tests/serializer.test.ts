/**
 * @file Steno ProseMirror → Markdown serializer 测试
 *
 * 关键测试：parser → serializer round-trip。由于 PureMark 的 parser
 * 把语法标记符号都保留为 syntax_marker 文本节点，serializer 直接遍历
 * 输出即可，因此 round-trip 在 compact 模式下应当与归一化输入完全一致。
 *
 * 归一化规则：
 * - 用 LF 换行符
 * - 文档末尾不带尾随换行
 * - compact 模式：块之间不插入空行
 */

import { describe, it, expect } from 'vitest';

import { parseMarkdown } from '../parser';
import { MarkdownSerializer, serializeMarkdown } from '../serializer';

const compact = new MarkdownSerializer({ compact: true });

/** compact 模式下的 round-trip。 */
function roundtripCompact(md: string): string {
  return compact.serialize(parseMarkdown(md).doc);
}

/** 默认模式下的序列化结果。 */
function serializeDefault(md: string): string {
  return serializeMarkdown(parseMarkdown(md).doc);
}

describe('serializer compact round-trip', () => {
  it('单个标题', () => {
    expect(roundtripCompact('# foo')).toBe('# foo');
  });

  it('多级标题', () => {
    expect(roundtripCompact('## bar')).toBe('## bar');
    expect(roundtripCompact('###### baz')).toBe('###### baz');
  });

  it('blockquote', () => {
    expect(roundtripCompact('> hello')).toBe('> hello');
  });

  it('无空格 blockquote 归一为带空格', () => {
    // PureMark blockquote 序列化器统一输出 "> "，因此 ">foo" → "> foo"
    expect(roundtripCompact('>foo')).toBe('> foo');
  });

  it('水平分隔线', () => {
    expect(roundtripCompact('---')).toBe('---');
    // 序列化器统一输出 ---（PureMark 的标准化行为）
    expect(roundtripCompact('***')).toBe('---');
  });

  it('粗体（含 syntax_marker）', () => {
    expect(roundtripCompact('**bold**')).toBe('**bold**');
  });

  it('斜体', () => {
    expect(roundtripCompact('*italic*')).toBe('*italic*');
  });

  it('行内代码', () => {
    expect(roundtripCompact('`code`')).toBe('`code`');
  });

  it('删除线', () => {
    expect(roundtripCompact('~~strike~~')).toBe('~~strike~~');
  });

  it('高亮', () => {
    expect(roundtripCompact('==hl==')).toBe('==hl==');
  });

  it('链接', () => {
    expect(roundtripCompact('[a](hh)')).toBe('[a](hh)');
  });

  it('行内 HTML <u>', () => {
    expect(roundtripCompact('<u>Phase 4</u>')).toBe('<u>Phase 4</u>');
  });

  it('行内数学', () => {
    expect(roundtripCompact('$a + b$')).toBe('$a + b$');
  });

  it('无序列表', () => {
    expect(roundtripCompact('- a\n- b')).toBe('- a\n- b');
  });

  it('有序列表（保留起始数字）', () => {
    expect(roundtripCompact('1. a\n2. b')).toBe('1. a\n2. b');
    expect(roundtripCompact('3. a\n4. b')).toBe('3. a\n4. b');
  });

  it('任务列表', () => {
    expect(roundtripCompact('- [ ] todo\n- [x] done')).toBe('- [ ] todo\n- [x] done');
  });

  it('围栏代码块带 language', () => {
    const md = '```ts\nconst a = 1\n```';
    expect(roundtripCompact(md)).toBe(md);
  });

  it('mermaid 块', () => {
    const md = '```mermaid\ngraph TD; A-->B;\n```';
    expect(roundtripCompact(md)).toBe(md);
  });

  it('块级数学', () => {
    const md = '$$\nE = mc^2\n$$';
    expect(roundtripCompact(md)).toBe(md);
  });

  it('GFM 表格 round-trip', () => {
    const md = '| A | B |\n| --- | --- |\n| a | b |';
    // 注意 parser 接受 `| - | - |`，serializer 输出 `| --- | --- |`
    expect(roundtripCompact('| A | B |\n| - | - |\n| a | b |')).toBe(md);
    expect(roundtripCompact(md)).toBe(md);
  });
});

describe('serializer 默认模式（带块间空行）', () => {
  it('标题后追加空行', () => {
    expect(serializeDefault('# foo')).toContain('# foo');
    // 默认模式末尾有空行
    expect(serializeDefault('# foo').endsWith('\n')).toBe(true);
  });

  it('多块用空行分隔', () => {
    const md = '# a\n\n# b';
    const out = serializeDefault(md);
    // 输出含两个标题
    expect(out).toContain('# a');
    expect(out).toContain('# b');
  });
});

describe('serializer 题目图二样例 round-trip 关键节点保留', () => {
  it('图二完整文档（compact）保留全部块级结构', () => {
    const md = [
      '继续**推进** <u>Phase 4</u>',
      '> 你好啊',
      '- a',
      '- v',
      '| A | B |',
      '| --- | --- |',
      '| a | b |',
      '`buha` 你',
      '---',
      '[a](hh)',
    ].join('\n');
    const out = roundtripCompact(md);
    expect(out).toContain('**推进**');
    expect(out).toContain('<u>Phase 4</u>');
    expect(out).toContain('> 你好啊');
    expect(out).toContain('- a');
    expect(out).toContain('- v');
    expect(out).toContain('| A | B |');
    expect(out).toContain('`buha`');
    expect(out).toContain('---');
    expect(out).toContain('[a](hh)');
  });
});
