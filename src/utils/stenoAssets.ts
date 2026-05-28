import { convertFileSrc, isTauri } from '@tauri-apps/api/core';

export const STENO_ASSET_PREFIX = 'steno-asset:';

export interface DataPathsLike {
  dataDir: string;
}

let cachedDataDir: string | null = null;
const LEGACY_HOME_STENO_RE = /^(?:~|～)\/\.steno\//;
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

function trimTrailingSlashes(path: string): string {
  return path.replace(/[\\/]+$/, '');
}

function safeRelativeAssetPath(relativePath: string): string | null {
  if (
    !relativePath
    || relativePath.startsWith('/')
    || relativePath.includes('..')
    || relativePath.includes('\\')
  ) {
    return null;
  }
  return relativePath;
}

function legacyStenoAssetRelativePath(url: string): string | null {
  const match = LEGACY_HOME_STENO_RE.exec(url.trim());
  if (!match) return null;
  return safeRelativeAssetPath(url.trim().slice(match[0].length));
}

function fileUrlPath(url: string): string | null {
  if (!url.startsWith('file://')) return null;
  try {
    return decodeURI(new URL(url).pathname);
  } catch {
    return null;
  }
}

export function setStenoAssetDataDir(dataDir: string | null | undefined) {
  cachedDataDir = dataDir || null;
}

export function isStenoAssetUrl(url: string): boolean {
  return url.startsWith(STENO_ASSET_PREFIX);
}

export function stenoAssetRelativePath(url: string): string | null {
  if (!isStenoAssetUrl(url)) return null;
  const relativePath = url.slice(STENO_ASSET_PREFIX.length);
  return safeRelativeAssetPath(relativePath);
}

export function stenoAssetAbsolutePath(url: string, dataDir = cachedDataDir): string | null {
  const relativePath = stenoAssetRelativePath(url) ?? legacyStenoAssetRelativePath(url);
  if (relativePath && dataDir) return `${trimTrailingSlashes(dataDir)}/${relativePath}`;

  if (!dataDir) return null;
  const root = trimTrailingSlashes(dataDir);
  const localPath = fileUrlPath(url) ?? url;
  if (localPath === root || localPath.startsWith(`${root}/`)) return localPath;
  return null;
}

export function stenoAssetDisplaySrc(url: string, dataDir = cachedDataDir): string {
  const absolutePath = stenoAssetAbsolutePath(url, dataDir);
  if (!absolutePath) return url;
  return isTauri() ? convertFileSrc(absolutePath) : absolutePath;
}

export function resolveStenoAssetUrls(markdown: string, dataDir = cachedDataDir): string {
  if (
    !dataDir
    && !markdown.includes(STENO_ASSET_PREFIX)
    && !markdown.includes('~/.steno/')
    && !markdown.includes('～/.steno/')
  ) {
    return markdown;
  }
  return markdown.replace(
    MARKDOWN_IMAGE_RE,
    (match, alt: string, url: string) => {
      const displaySrc = stenoAssetDisplaySrc(url, dataDir);
      return displaySrc === url ? match : `![${alt}](${displaySrc})`;
    },
  );
}
