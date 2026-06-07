import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resolveStenoAssetUrls,
  setStenoAssetDataDir,
  stenoAssetAbsolutePath,
  stenoAssetDisplaySrc,
  stenoAssetRelativePath,
  subscribeStenoAssetDataDir,
} from './stenoAssets';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  convertFileSrc: (path: string) => `asset://${path}`,
}));

describe('stenoAssets', () => {
  beforeEach(() => {
    setStenoAssetDataDir(null);
  });

  it('resolves steno-asset URLs under the configured data directory', () => {
    expect(stenoAssetRelativePath('steno-asset:images/2026-05-28/paste.png')).toBe(
      'images/2026-05-28/paste.png',
    );
    expect(
      stenoAssetAbsolutePath('steno-asset:images/2026-05-28/paste.png', '/tmp/steno'),
    ).toBe('/tmp/steno/images/2026-05-28/paste.png');
  });

  it('resolves legacy home-steno image URLs, including full-width tilde', () => {
    expect(
      stenoAssetDisplaySrc('～/.steno/images/2026-05-28/paste.png', '/tmp/steno'),
    ).toBe('/tmp/steno/images/2026-05-28/paste.png');
    expect(
      stenoAssetDisplaySrc('~/.steno/images/2026-05-28/paste.png', '/tmp/steno'),
    ).toBe('/tmp/steno/images/2026-05-28/paste.png');
  });

  it('rewrites markdown image URLs for preview rendering', () => {
    expect(
      resolveStenoAssetUrls(
        '![pasted image](～/.steno/images/2026-05-28/paste.png)',
        '/tmp/steno',
      ),
    ).toBe('![pasted image](/tmp/steno/images/2026-05-28/paste.png)');
  });

  it('does not resolve unsafe relative asset paths', () => {
    expect(stenoAssetAbsolutePath('steno-asset:../secrets.png', '/tmp/steno')).toBeNull();
    expect(stenoAssetDisplaySrc('https://example.com/a.png', '/tmp/steno')).toBe(
      'https://example.com/a.png',
    );
  });

  it('notifies subscribers when the data dir changes, dedupes equal values, and stops after unsubscribe', () => {
    let count = 0;
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
