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

// 测试用例：验证「sanitizeHtml」场景，锁定 sanitize 的用户可见行为。
describe('sanitizeHtml', () => {
  // 测试用例：验证「XSS 防护」场景，锁定 sanitize 的用户可见行为。
  describe('XSS 防护', () => {
    // 测试用例：验证「removes <script> tags entirely」场景，锁定 sanitize 的用户可见行为。
    it('removes <script> tags entirely', () => {
      // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const out = sanitizeHtml('<p>hi<script>alert(1)</script></p>');
      expect(out).not.toContain('<script>');
      expect(out).not.toContain('alert');
      expect(out).toContain('hi');
    });

    // 测试用例：验证「strips on* event attributes」场景，锁定 sanitize 的用户可见行为。
    it('strips on* event attributes', () => {
      // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const out = sanitizeHtml('<img src=x onerror="alert(1)">');
      expect(out).not.toContain('onerror');
      expect(out).not.toContain('alert');
    });

    // 测试用例：验证「removes <iframe>, <object>, <embed>, <form>」场景，锁定 sanitize 的用户可见行为。
    it('removes <iframe>, <object>, <embed>, <form>', () => {
      // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const out = sanitizeHtml(
        '<iframe src="evil"></iframe><object data="evil"></object><embed src="evil"><form action="evil"></form>'
      );
      expect(out).not.toContain('<iframe');
      expect(out).not.toContain('<object');
      expect(out).not.toContain('<embed');
      expect(out).not.toContain('<form');
    });

    // 测试用例：验证「blocks javascript: protocol in href」场景，锁定 sanitize 的用户可见行为。
    it('blocks javascript: protocol in href', () => {
      // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
      expect(out).not.toContain('javascript:');
    });
  });

  // 测试用例：验证「保留渲染所需结构」场景，锁定 sanitize 的用户可见行为。
  describe('保留渲染所需结构', () => {
    // 测试用例：验证「keeps <mark> for ==text== highlight」场景，锁定 sanitize 的用户可见行为。
    it('keeps <mark> for ==text== highlight', () => {
      // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const out = sanitizeHtml('<p>before <mark>highlight</mark> after</p>');
      expect(out).toContain('<mark>highlight</mark>');
    });

    // 测试用例：验证「keeps style attributes (shiki double-theme colors)」场景，锁定 sanitize 的用户可见行为。
    it('keeps style attributes (shiki double-theme colors)', () => {
      // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const out = sanitizeHtml('<span style="color: #ff7b72">keyword</span>');
      expect(out).toContain('style="color: #ff7b72"');
    });

    // 测试用例：验证「keeps data-source on mermaid placeholder」场景，锁定 sanitize 的用户可见行为。
    it('keeps data-source on mermaid placeholder', () => {
      // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const out = sanitizeHtml('<pre class="mermaid-placeholder" data-source="aGVsbG8="></pre>');
      expect(out).toContain('data-source="aGVsbG8="');
      expect(out).toContain('class="mermaid-placeholder"');
    });

    // 测试用例：验证「keeps data-code on copy button」场景，锁定 sanitize 的用户可见行为。
    it('keeps data-code on copy button', () => {
      // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const out = sanitizeHtml('<button class="shiki-copy" data-code="Y29kZQ==">复制</button>');
      expect(out).toContain('data-code="Y29kZQ=="');
    });

    // 测试用例：验证「keeps KaTeX <math> elements」场景，锁定 sanitize 的用户可见行为。
    it('keeps KaTeX <math> elements', () => {
      // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const out = sanitizeHtml(
        '<span class="katex"><math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math></span>'
      );
      expect(out).toContain('<math');
      expect(out).toContain('<mi>x</mi>');
    });

    // 测试用例：验证「keeps inline SVG used by mermaid output」场景，锁定 sanitize 的用户可见行为。
    it('keeps inline SVG used by mermaid output', () => {
      // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const out = sanitizeHtml('<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="10" height="10"/></g></svg>');
      expect(out).toContain('<svg');
      expect(out).toContain('<rect');
    });

    // 测试用例：验证「returns empty string for empty input」场景，锁定 sanitize 的用户可见行为。
    it('returns empty string for empty input', () => {
      expect(sanitizeHtml('')).toBe('');
    });
  });
});
