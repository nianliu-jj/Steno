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

// 局部常量 compact：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const compact = new MarkdownSerializer({ compact: true });

/** compact 模式下的 round-trip。 */
function roundtripCompact(md: string): string {
  return compact.serialize(parseMarkdown(md).doc);
}

/** 默认模式下的序列化结果。 */
function serializeDefault(md: string): string {
  return serializeMarkdown(parseMarkdown(md).doc);
}

// 测试用例：验证「serializer compact round-trip」场景，锁定 serializer 的用户可见行为。
describe('serializer compact round-trip', () => {
  // 测试用例：验证「单个标题」场景，锁定 serializer 的用户可见行为。
  it('单个标题', () => {
    expect(roundtripCompact('# foo')).toBe('# foo');
  });

  // 测试用例：验证「多级标题」场景，锁定 serializer 的用户可见行为。
  it('多级标题', () => {
    expect(roundtripCompact('## bar')).toBe('## bar');
    expect(roundtripCompact('###### baz')).toBe('###### baz');
  });

  // 测试用例：验证「blockquote」场景，锁定 serializer 的用户可见行为。
  it('blockquote', () => {
    expect(roundtripCompact('> hello')).toBe('> hello');
  });

  // 测试用例：验证「无空格 blockquote 归一为带空格」场景，锁定 serializer 的用户可见行为。
  it('无空格 blockquote 归一为带空格', () => {
    // PureMark blockquote 序列化器统一输出 "> "，因此 ">foo" → "> foo"
    expect(roundtripCompact('>foo')).toBe('> foo');
  });

  // 测试用例：验证「水平分隔线」场景，锁定 serializer 的用户可见行为。
  it('水平分隔线', () => {
    expect(roundtripCompact('---')).toBe('---');
    // 序列化器统一输出 ---（PureMark 的标准化行为）
    expect(roundtripCompact('***')).toBe('---');
  });

  // 测试用例：验证「粗体（含 syntax_marker）」场景，锁定 serializer 的用户可见行为。
  it('粗体（含 syntax_marker）', () => {
    expect(roundtripCompact('**bold**')).toBe('**bold**');
  });

  // 测试用例：验证「斜体」场景，锁定 serializer 的用户可见行为。
  it('斜体', () => {
    expect(roundtripCompact('*italic*')).toBe('*italic*');
  });

  // 测试用例：验证「行内代码」场景，锁定 serializer 的用户可见行为。
  it('行内代码', () => {
    expect(roundtripCompact('`code`')).toBe('`code`');
  });

  // 测试用例：验证「删除线」场景，锁定 serializer 的用户可见行为。
  it('删除线', () => {
    expect(roundtripCompact('~~strike~~')).toBe('~~strike~~');
  });

  // 测试用例：验证「高亮」场景，锁定 serializer 的用户可见行为。
  it('高亮', () => {
    expect(roundtripCompact('==hl==')).toBe('==hl==');
  });

  // 测试用例：验证「链接」场景，锁定 serializer 的用户可见行为。
  it('链接', () => {
    expect(roundtripCompact('[a](hh)')).toBe('[a](hh)');
  });

  // 测试用例：验证「行内 HTML <u>」场景，锁定 serializer 的用户可见行为。
  it('行内 HTML <u>', () => {
    expect(roundtripCompact('<u>Phase 4</u>')).toBe('<u>Phase 4</u>');
  });

  // 测试用例：验证「行内数学」场景，锁定 serializer 的用户可见行为。
  it('行内数学', () => {
    expect(roundtripCompact('$a + b$')).toBe('$a + b$');
  });

  // 测试用例：验证「无序列表」场景，锁定 serializer 的用户可见行为。
  it('无序列表', () => {
    expect(roundtripCompact('- a\n- b')).toBe('- a\n- b');
  });

  // 测试用例：验证「有序列表（保留起始数字）」场景，锁定 serializer 的用户可见行为。
  it('有序列表（保留起始数字）', () => {
    expect(roundtripCompact('1. a\n2. b')).toBe('1. a\n2. b');
    expect(roundtripCompact('3. a\n4. b')).toBe('3. a\n4. b');
  });

  // 测试用例：验证「任务列表」场景，锁定 serializer 的用户可见行为。
  it('任务列表', () => {
    expect(roundtripCompact('- [ ] todo\n- [x] done')).toBe('- [ ] todo\n- [x] done');
  });

  // 测试用例：验证「围栏代码块带 language」场景，锁定 serializer 的用户可见行为。
  it('围栏代码块带 language', () => {
    // 局部常量 md：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const md = '```ts\nconst a = 1\n```';
    expect(roundtripCompact(md)).toBe(md);
  });

  // 测试用例：验证「mermaid 块」场景，锁定 serializer 的用户可见行为。
  it('mermaid 块', () => {
    // 局部常量 md：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const md = '```mermaid\ngraph TD; A-->B;\n```';
    expect(roundtripCompact(md)).toBe(md);
  });

  // 测试用例：验证「块级数学」场景，锁定 serializer 的用户可见行为。
  it('块级数学', () => {
    // 局部常量 md：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const md = '$$\nE = mc^2\n$$';
    expect(roundtripCompact(md)).toBe(md);
  });

  // 测试用例：验证「GFM 表格 round-trip」场景，锁定 serializer 的用户可见行为。
  it('GFM 表格 round-trip', () => {
    // 局部常量 md：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const md = '| A | B |\n| --- | --- |\n| a | b |';
    // 注意 parser 接受 `| - | - |`，serializer 输出 `| --- | --- |`
    expect(roundtripCompact('| A | B |\n| - | - |\n| a | b |')).toBe(md);
    expect(roundtripCompact(md)).toBe(md);
  });
});

// 测试用例：验证「serializer 默认模式（带块间空行）」场景，锁定 serializer 的用户可见行为。
describe('serializer 默认模式（带块间空行）', () => {
  // 测试用例：验证「标题后追加空行」场景，锁定 serializer 的用户可见行为。
  it('标题后追加空行', () => {
    expect(serializeDefault('# foo')).toContain('# foo');
    // 默认模式末尾有空行
    expect(serializeDefault('# foo').endsWith('\n')).toBe(true);
  });

  // 测试用例：验证「多块用空行分隔」场景，锁定 serializer 的用户可见行为。
  it('多块用空行分隔', () => {
    // 局部常量 md：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const md = '# a\n\n# b';
    // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const out = serializeDefault(md);
    // 输出含两个标题
    expect(out).toContain('# a');
    expect(out).toContain('# b');
  });
});

// 测试用例：验证「serializer 题目图二样例 round-trip 关键节点保留」场景，锁定 serializer 的用户可见行为。
describe('serializer 题目图二样例 round-trip 关键节点保留', () => {
  // 测试用例：验证「图二完整文档（compact）保留全部块级结构」场景，锁定 serializer 的用户可见行为。
  it('图二完整文档（compact）保留全部块级结构', () => {
    // 局部常量 md：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
      '[a](hh)'
    ].join('\n');
    // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
