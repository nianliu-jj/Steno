/**
 * @file 前端工具函数 - steno Assets
 *
 * 覆盖 steno Assets 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resolveStenoAssetUrls,
  setStenoAssetDataDir,
  stenoAssetAbsolutePath,
  stenoAssetDisplaySrc,
  stenoAssetRelativePath,
  subscribeStenoAssetDataDir
} from './stenoAssets';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  convertFileSrc: (path: string) => `asset://${path}`
}));

// 测试用例：验证「stenoAssets」场景，锁定 steno Assets 的用户可见行为。
describe('stenoAssets', () => {
  beforeEach(() => {
    setStenoAssetDataDir(null);
  });

  // 测试用例：验证「resolves steno-asset URLs under the configured data directory」场景，锁定 steno Assets 的用户可见行为。
  it('resolves steno-asset URLs under the configured data directory', () => {
    expect(stenoAssetRelativePath('steno-asset:images/2026-05-28/paste.png')).toBe('images/2026-05-28/paste.png');
    expect(stenoAssetAbsolutePath('steno-asset:images/2026-05-28/paste.png', '/tmp/steno')).toBe(
      '/tmp/steno/images/2026-05-28/paste.png'
    );
  });

  // 测试用例：验证「resolves legacy home-steno image URLs, including full-width tilde」场景，锁定 steno Assets 的用户可见行为。
  it('resolves legacy home-steno image URLs, including full-width tilde', () => {
    expect(stenoAssetDisplaySrc('～/.steno/images/2026-05-28/paste.png', '/tmp/steno')).toBe(
      '/tmp/steno/images/2026-05-28/paste.png'
    );
    expect(stenoAssetDisplaySrc('~/.steno/images/2026-05-28/paste.png', '/tmp/steno')).toBe(
      '/tmp/steno/images/2026-05-28/paste.png'
    );
  });

  // 测试用例：验证「rewrites markdown image URLs for preview rendering」场景，锁定 steno Assets 的用户可见行为。
  it('rewrites markdown image URLs for preview rendering', () => {
    expect(resolveStenoAssetUrls('![pasted image](～/.steno/images/2026-05-28/paste.png)', '/tmp/steno')).toBe(
      '![pasted image](/tmp/steno/images/2026-05-28/paste.png)'
    );
  });

  // 测试用例：验证「does not resolve unsafe relative asset paths」场景，锁定 steno Assets 的用户可见行为。
  it('does not resolve unsafe relative asset paths', () => {
    expect(stenoAssetAbsolutePath('steno-asset:../secrets.png', '/tmp/steno')).toBeNull();
    expect(stenoAssetDisplaySrc('https://example.com/a.png', '/tmp/steno')).toBe('https://example.com/a.png');
  });

  // 测试用例：验证「notifies subscribers when the data dir changes, dedupes equal values, and stops after unsubscribe」场景，锁定 steno Assets 的用户可见行为。
  it('notifies subscribers when the data dir changes, dedupes equal values, and stops after unsubscribe', () => {
    let count = 0;
    // 局部常量 unsubscribe：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const unsubscribe = subscribeStenoAssetDataDir(() => {
      count++;
    });
    setStenoAssetDataDir('/tmp/steno'); // null → 值：触发
    expect(count).toBe(1);
    setStenoAssetDataDir('/tmp/steno'); // 相同值：去重，不触发
    expect(count).toBe(1);
    setStenoAssetDataDir('/another'); // 变化：触发
    expect(count).toBe(2);
    unsubscribe();
    setStenoAssetDataDir('/tmp/steno'); // 已取消订阅：不再触发
    expect(count).toBe(2);
  });
});
