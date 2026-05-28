/**
 * @file `sanitizeHtml` 单元测试。
 *
 * 关键场景：
 * - 危险标签/事件属性必须被移除（<script>、<iframe>、onerror）
 * - 渲染产物所需结构必须保留：KaTeX 的 <math>/<span class="katex">、
 *   Shiki 的 <span style="color">、mermaid 占位的 data-source、Steno 标题 data-heading-id
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import { sanitizeHtml } from '../sanitize';

describe('sanitizeHtml', () => {
  describe('XSS 防护', () => {
    it('removes <script> tags entirely', () => {
      const out = sanitizeHtml('<p>hi<script>alert(1)</script></p>');
      expect(out).not.toContain('<script>');
      expect(out).not.toContain('alert');
      expect(out).toContain('hi');
    });

    it('strips on* event attributes', () => {
      const out = sanitizeHtml('<img src=x onerror="alert(1)">');
      expect(out).not.toContain('onerror');
      expect(out).not.toContain('alert');
    });

    it('removes <iframe>, <object>, <embed>, <form>', () => {
      const out = sanitizeHtml(
        '<iframe src="evil"></iframe><object data="evil"></object><embed src="evil"><form action="evil"></form>',
      );
      expect(out).not.toContain('<iframe');
      expect(out).not.toContain('<object');
      expect(out).not.toContain('<embed');
      expect(out).not.toContain('<form');
    });

    it('blocks javascript: protocol in href', () => {
      const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
      expect(out).not.toContain('javascript:');
    });
  });

  describe('保留渲染所需结构', () => {
    it('keeps <mark> for ==text== highlight', () => {
      const out = sanitizeHtml('<p>before <mark>highlight</mark> after</p>');
      expect(out).toContain('<mark>highlight</mark>');
    });

    it('keeps style attributes (shiki double-theme colors)', () => {
      const out = sanitizeHtml('<span style="color: #ff7b72">keyword</span>');
      expect(out).toContain('style="color: #ff7b72"');
    });

    it('keeps data-source on mermaid placeholder', () => {
      const out = sanitizeHtml(
        '<pre class="mermaid-placeholder" data-source="aGVsbG8="></pre>',
      );
      expect(out).toContain('data-source="aGVsbG8="');
      expect(out).toContain('class="mermaid-placeholder"');
    });

    it('keeps data-code on copy button', () => {
      const out = sanitizeHtml('<button class="shiki-copy" data-code="Y29kZQ==">复制</button>');
      expect(out).toContain('data-code="Y29kZQ=="');
    });

    it('keeps KaTeX <math> elements', () => {
      const out = sanitizeHtml(
        '<span class="katex"><math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math></span>',
      );
      expect(out).toContain('<math');
      expect(out).toContain('<mi>x</mi>');
    });

    it('keeps inline SVG used by mermaid output', () => {
      const out = sanitizeHtml(
        '<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="10" height="10"/></g></svg>',
      );
      expect(out).toContain('<svg');
      expect(out).toContain('<rect');
    });

    it('returns empty string for empty input', () => {
      expect(sanitizeHtml('')).toBe('');
    });
  });
});
