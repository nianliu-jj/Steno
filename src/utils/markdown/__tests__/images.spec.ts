/**
 * @file `resolveImageSrc` 单元测试。
 *
 * 测试环境需要可访问 `@tauri-apps/api/core`；jsdom 环境下 isTauri() 返回 false，
 * 此时绝对路径输出原样（不经 convertFileSrc 转换），便于断言。
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';

import { resolveImageSrc } from '../images';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  convertFileSrc: (p: string) => `asset://${encodeURI(p)}`,
}));

describe('resolveImageSrc', () => {
  describe('absolute URLs are passed through', () => {
    it.each([
      'https://example.com/a.png',
      'http://example.com/a.png',
      'data:image/png;base64,iVBOR',
      'blob:abc',
      'file:///c:/foo.png',
      'asset://localhost/foo.png',
      'tauri://localhost/x',
      'steno-asset:images/2026-05-28/x.png',
      '~/.steno/images/foo.png',
      '～/.steno/images/foo.png',
    ])('keeps %s untouched', (src) => {
      expect(resolveImageSrc(src, '/notes/2026/05/28')).toBe(src);
    });
  });

  describe('relative paths', () => {
    it('returns original src when noteDir is missing', () => {
      expect(resolveImageSrc('./img/a.png')).toBe('./img/a.png');
      expect(resolveImageSrc('img/a.png', undefined)).toBe('img/a.png');
    });

    it('joins relative path with noteDir', () => {
      // jsdom + isTauri()=false 直接返回拼接后的绝对路径
      expect(resolveImageSrc('./img/a.png', '/notes/today')).toBe('/notes/today/img/a.png');
      expect(resolveImageSrc('img/a.png', '/notes/today')).toBe('/notes/today/img/a.png');
    });

    it('normalizes trailing slash and backslash in noteDir', () => {
      expect(resolveImageSrc('./a.png', 'D:\\notes\\today\\')).toBe('D:/notes/today/a.png');
      expect(resolveImageSrc('a.png', '/notes/today/')).toBe('/notes/today/a.png');
    });

    it('handles empty src by returning the original', () => {
      expect(resolveImageSrc('', '/notes/today')).toBe('');
    });

    it('skips empty stripped value (only "./")', () => {
      expect(resolveImageSrc('./', '/notes/today')).toBe('./');
    });
  });
});
