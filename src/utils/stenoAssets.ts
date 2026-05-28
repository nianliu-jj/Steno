import { convertFileSrc, isTauri } from '@tauri-apps/api/core';

export const STENO_ASSET_PREFIX = 'steno-asset:';

export interface DataPathsLike {
  dataDir: string;
}

let cachedDataDir: string | null = null;

export function setStenoAssetDataDir(dataDir: string | null | undefined) {
  cachedDataDir = dataDir || null;
}

export function isStenoAssetUrl(url: string): boolean {
  return url.startsWith(STENO_ASSET_PREFIX);
}

export function stenoAssetRelativePath(url: string): string | null {
  if (!isStenoAssetUrl(url)) return null;
  const relativePath = url.slice(STENO_ASSET_PREFIX.length);
  if (
    relativePath.startsWith('/')
    || relativePath.includes('..')
    || relativePath.includes('\\')
  ) {
    return null;
  }
  return relativePath;
}

export function stenoAssetAbsolutePath(url: string, dataDir = cachedDataDir): string | null {
  const relativePath = stenoAssetRelativePath(url);
  if (!relativePath || !dataDir) return null;
  return `${dataDir.replace(/[\\/]+$/, '')}/${relativePath}`;
}

export function stenoAssetDisplaySrc(url: string, dataDir = cachedDataDir): string {
  const absolutePath = stenoAssetAbsolutePath(url, dataDir);
  if (!absolutePath) return url;
  return isTauri() ? convertFileSrc(absolutePath) : absolutePath;
}

export function resolveStenoAssetUrls(markdown: string, dataDir = cachedDataDir): string {
  if (!markdown.includes(STENO_ASSET_PREFIX)) return markdown;
  return markdown.replace(
    /!\[([^\]]*)\]\((steno-asset:[^)]+)\)/g,
    (_match, alt: string, url: string) => `![${alt}](${stenoAssetDisplaySrc(url, dataDir)})`,
  );
}
