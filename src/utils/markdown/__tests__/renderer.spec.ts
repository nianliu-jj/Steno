/**
 * @file `renderMarkdown` 单元测试。
 *
 * 覆盖 Phase 2 引入的核心能力：GFM 基础、任务列表、`==高亮==`、行内/块级 KaTeX、
 * mermaid 占位、未知语言代码块降级、行内代码标记。
 */

import { describe, expect, it } from 'vitest';

import { renderMarkdown } from '../renderer';

describe('renderMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  describe('GFM basics', () => {
    it('renders headings, paragraphs and lists', () => {
      const html = renderMarkdown('# H1\n\n段落\n\n- a\n- b');
      expect(html).toContain('<h1>H1</h1>');
      expect(html).toContain('<p>段落</p>');
      expect(html).toMatch(/<ul>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ul>/);
    });

    it('renders blockquote and tables', () => {
      const html = renderMarkdown('> 引用\n\n| a | b |\n|---|---|\n| 1 | 2 |');
      expect(html).toContain('<blockquote>');
      expect(html).toContain('<table>');
      expect(html).toContain('<th>a</th>');
      expect(html).toContain('<td>1</td>');
    });

    it('renders horizontal rule and strikethrough', () => {
      const html = renderMarkdown('---\n\n~~删除~~');
      expect(html).toContain('<hr>');
      expect(html).toContain('<s>删除</s>');
    });
  });

  describe('task lists', () => {
    it('renders checkboxes that are read-only', () => {
      const html = renderMarkdown('- [ ] 未完成\n- [x] 已完成');
      expect(html).toContain('<input');
      expect(html).toContain('type="checkbox"');
      expect(html).toContain('disabled');
      // 已完成项必须带 checked 属性；HTML 序列化为 checked="" 或 checked
      expect(html).toMatch(/已完成.*<\/label>/s);
      const completedItem = html.split('已完成')[0].split('<li').pop() ?? '';
      expect(completedItem).toMatch(/\bchecked\b/);
    });
  });

  describe('inline code & highlight', () => {
    it('marks inline code with class md-inline-code', () => {
      const html = renderMarkdown('Use `printf()` for output');
      expect(html).toContain('<code class="md-inline-code">printf()</code>');
    });

    it('renders ==text== as <mark>', () => {
      const html = renderMarkdown('这是 ==重点== 内容');
      expect(html).toContain('<mark>重点</mark>');
    });
  });

  describe('KaTeX', () => {
    it('renders inline math', () => {
      const html = renderMarkdown('Pythagoras: $a^2 + b^2 = c^2$');
      expect(html).toContain('class="katex"');
    });

    it('renders block math', () => {
      const html = renderMarkdown('$$\nE = mc^2\n$$');
      expect(html).toContain('katex-display');
    });

    it('does not throw on broken syntax', () => {
      expect(() => renderMarkdown('$\\frac{1$')).not.toThrow();
    });
  });

  describe('fenced code blocks', () => {
    it('outputs mermaid placeholder with encoded source', () => {
      const html = renderMarkdown('```mermaid\nflowchart TD;A-->B;\n```');
      expect(html).toContain('class="mermaid-placeholder"');
      expect(html).toMatch(/data-source="[A-Za-z0-9+/=]+"/);
      expect(html).not.toContain('flowchart TD');
    });

    it('falls back to escaped <pre><code> for unknown language', () => {
      const html = renderMarkdown('```weirdlang\n<script>alert(1)</script>\n```');
      expect(html).toContain('shiki-fallback');
      expect(html).toContain('data-lang="weirdlang"');
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>alert(1)</script>');
    });

    it('falls back for code blocks without language tag', () => {
      const html = renderMarkdown('```\nplain text\n```');
      expect(html).toContain('shiki-fallback');
      expect(html).toContain('plain text');
    });
  });
});
