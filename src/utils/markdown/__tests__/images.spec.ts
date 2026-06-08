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
  convertFileSrc: (p: string) => `asset://${encodeURI(p)}`
}));

// 测试用例：验证「resolveImageSrc」场景，锁定 images 的用户可见行为。
describe('resolveImageSrc', () => {
  // 测试用例：验证「absolute URLs are passed through」场景，锁定 images 的用户可见行为。
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
      '～/.steno/images/foo.png'
    ])('keeps %s untouched', src => {
      expect(resolveImageSrc(src, '/notes/2026/05/28')).toBe(src);
    });
  });

  // 测试用例：验证「relative paths」场景，锁定 images 的用户可见行为。
  describe('relative paths', () => {
    // 测试用例：验证「returns original src when noteDir is missing」场景，锁定 images 的用户可见行为。
    it('returns original src when noteDir is missing', () => {
      expect(resolveImageSrc('./img/a.png')).toBe('./img/a.png');
      expect(resolveImageSrc('img/a.png', undefined)).toBe('img/a.png');
    });

    // 测试用例：验证「joins relative path with noteDir」场景，锁定 images 的用户可见行为。
    it('joins relative path with noteDir', () => {
      // jsdom + isTauri()=false 直接返回拼接后的绝对路径
      expect(resolveImageSrc('./img/a.png', '/notes/today')).toBe('/notes/today/img/a.png');
      expect(resolveImageSrc('img/a.png', '/notes/today')).toBe('/notes/today/img/a.png');
    });

    // 测试用例：验证「normalizes trailing slash and backslash in noteDir」场景，锁定 images 的用户可见行为。
    it('normalizes trailing slash and backslash in noteDir', () => {
      expect(resolveImageSrc('./a.png', 'D:\\notes\\today\\')).toBe('D:/notes/today/a.png');
      expect(resolveImageSrc('a.png', '/notes/today/')).toBe('/notes/today/a.png');
    });

    // 测试用例：验证「handles empty src by returning the original」场景，锁定 images 的用户可见行为。
    it('handles empty src by returning the original', () => {
      expect(resolveImageSrc('', '/notes/today')).toBe('');
    });

    // 测试用例：验证「skips empty stripped value (only 」场景，锁定 images 的用户可见行为。
    it('skips empty stripped value (only "./")', () => {
      expect(resolveImageSrc('./', '/notes/today')).toBe('./');
    });
  });
});
