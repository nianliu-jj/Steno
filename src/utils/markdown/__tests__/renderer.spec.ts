/**
 * @file `renderMarkdown` 单元测试。
 *
 * 覆盖 Phase 2 引入的核心能力：GFM 基础、任务列表、`==高亮==`、行内/块级 KaTeX、
 * mermaid 占位、未知语言代码块降级、行内代码标记。
 *
 * Phase 3 新增：Shiki warmup 完成后围栏代码块的高亮输出验证。
 * Phase 6 起出口接 DOMPurify，需要 jsdom window — 故指定 jsdom 环境。
 *
 * @vitest-environment jsdom
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { renderMarkdown } from '../renderer';
import { isShikiReady, warmupShiki } from '../shiki';

// 测试用例：验证「renderMarkdown」场景，锁定 renderer 的用户可见行为。
describe('renderMarkdown', () => {
  // 测试用例：验证「returns empty string for empty input」场景，锁定 renderer 的用户可见行为。
  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  // 测试用例：验证「GFM basics」场景，锁定 renderer 的用户可见行为。
  describe('GFM basics', () => {
    // 测试用例：验证「renders headings, paragraphs and lists」场景，锁定 renderer 的用户可见行为。
    it('renders headings, paragraphs and lists', () => {
      // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const html = renderMarkdown('# H1\n\n段落\n\n- a\n- b');
      expect(html).toContain('<h1>H1</h1>');
      expect(html).toContain('<p>段落</p>');
      expect(html).toMatch(/<ul>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ul>/);
    });

    // 测试用例：验证「renders blockquote and tables」场景，锁定 renderer 的用户可见行为。
    it('renders blockquote and tables', () => {
      // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const html = renderMarkdown('> 引用\n\n| a | b |\n|---|---|\n| 1 | 2 |');
      expect(html).toContain('<blockquote>');
      expect(html).toContain('<table>');
      expect(html).toContain('<th>a</th>');
      expect(html).toContain('<td>1</td>');
    });

    // 测试用例：验证「renders horizontal rule and strikethrough」场景，锁定 renderer 的用户可见行为。
    it('renders horizontal rule and strikethrough', () => {
      // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const html = renderMarkdown('---\n\n~~删除~~');
      expect(html).toContain('<hr>');
      expect(html).toContain('<s>删除</s>');
    });
  });

  // 测试用例：验证「task lists」场景，锁定 renderer 的用户可见行为。
  describe('task lists', () => {
    // 测试用例：验证「renders checkboxes that are read-only」场景，锁定 renderer 的用户可见行为。
    it('renders checkboxes that are read-only', () => {
      // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const html = renderMarkdown('- [ ] 未完成\n- [x] 已完成');
      expect(html).toContain('<input');
      expect(html).toContain('type="checkbox"');
      expect(html).toContain('disabled');
      // 已完成项必须带 checked 属性；HTML 序列化为 checked="" 或 checked
      expect(html).toMatch(/已完成.*<\/label>/s);
      // 局部常量 completedItem：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const completedItem = html.split('已完成')[0].split('<li').pop() ?? '';
      expect(completedItem).toMatch(/\bchecked\b/);
    });
  });

  // 测试用例：验证「inline code & highlight」场景，锁定 renderer 的用户可见行为。
  describe('inline code & highlight', () => {
    // 测试用例：验证「marks inline code with class md-inline-code」场景，锁定 renderer 的用户可见行为。
    it('marks inline code with class md-inline-code', () => {
      // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const html = renderMarkdown('Use `printf()` for output');
      expect(html).toContain('<code class="md-inline-code">printf()</code>');
    });

    // 测试用例：验证「renders ==text== as <mark>」场景，锁定 renderer 的用户可见行为。
    it('renders ==text== as <mark>', () => {
      // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const html = renderMarkdown('这是 ==重点== 内容');
      expect(html).toContain('<mark>重点</mark>');
    });
  });

  // 测试用例：验证「KaTeX」场景，锁定 renderer 的用户可见行为。
  describe('KaTeX', () => {
    // 测试用例：验证「renders inline math」场景，锁定 renderer 的用户可见行为。
    it('renders inline math', () => {
      // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const html = renderMarkdown('Pythagoras: $a^2 + b^2 = c^2$');
      expect(html).toContain('class="katex"');
    });

    // 测试用例：验证「renders block math」场景，锁定 renderer 的用户可见行为。
    it('renders block math', () => {
      // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const html = renderMarkdown('$$\nE = mc^2\n$$');
      expect(html).toContain('katex-display');
    });

    // 测试用例：验证「does not throw on broken syntax」场景，锁定 renderer 的用户可见行为。
    it('does not throw on broken syntax', () => {
      expect(() => renderMarkdown('$\\frac{1$')).not.toThrow();
    });
  });

  // 测试用例：验证「fenced code blocks」场景，锁定 renderer 的用户可见行为。
  describe('fenced code blocks', () => {
    // 测试用例：验证「outputs mermaid placeholder with encoded source」场景，锁定 renderer 的用户可见行为。
    it('outputs mermaid placeholder with encoded source', () => {
      // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const html = renderMarkdown('```mermaid\nflowchart TD;A-->B;\n```');
      expect(html).toContain('class="mermaid-placeholder"');
      expect(html).toMatch(/data-source="[A-Za-z0-9+/=]+"/);
      expect(html).not.toContain('flowchart TD');
    });

    // 测试用例：验证「falls back to escaped <pre><code> for unknown language」场景，锁定 renderer 的用户可见行为。
    it('falls back to escaped <pre><code> for unknown language', () => {
      // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const html = renderMarkdown('```weirdlang\n<script>alert(1)</script>\n```');
      expect(html).toContain('shiki-fallback');
      expect(html).toContain('data-lang="weirdlang"');
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>alert(1)</script>');
    });

    // 测试用例：验证「falls back for code blocks without language tag」场景，锁定 renderer 的用户可见行为。
    it('falls back for code blocks without language tag', () => {
      // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const html = renderMarkdown('```\nplain text\n```');
      expect(html).toContain('shiki-fallback');
      expect(html).toContain('plain text');
    });
  });

  // 测试用例：验证「shiki highlight (after warmup)」场景，锁定 renderer 的用户可见行为。
  describe('shiki highlight (after warmup)', () => {
    beforeAll(async () => {
      await warmupShiki();
    }, 60_000);

    // 测试用例：验证「warmup leaves highlighter ready」场景，锁定 renderer 的用户可见行为。
    it('warmup leaves highlighter ready', () => {
      expect(isShikiReady()).toBe(true);
    });

    // 测试用例：验证「renders a JavaScript code block with shiki block wrapper」场景，锁定 renderer 的用户可见行为。
    it('renders a JavaScript code block with shiki block wrapper', () => {
      // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const html = renderMarkdown('```javascript\nconst x = 1;\n```');
      expect(html).toContain('class="shiki-block"');
      expect(html).toContain('data-lang="javascript"');
      expect(html).toContain('shiki-lang');
      expect(html).toContain('shiki-copy');
      // 双主题模式至少包含两套 style/class 之一
      expect(html).toMatch(/shiki|github-light|github-dark/);
    });

    // 测试用例：验证「still falls back when the language is not in the loaded set」场景，锁定 renderer 的用户可见行为。
    it('still falls back when the language is not in the loaded set', () => {
      // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const html = renderMarkdown('```weirdlang\nfoo\n```');
      expect(html).toContain('shiki-fallback');
    });
  });
});
