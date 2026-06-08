/**
 * @file 前端工具函数 - steno Assets
 *
 * 组织 steno Assets 的核心逻辑、类型和协作边界，供 前端工具函数 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { convertFileSrc, isTauri } from '@tauri-apps/api/core';

// 导出常量 STENO_ASSET_PREFIX：为其他模块提供稳定配置、选项或 helper 入口。
export const STENO_ASSET_PREFIX = 'steno-asset:';

// 类型 DataPathsLike：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
export interface DataPathsLike {
  dataDir: string;
}

let cachedDataDir: string | null = null;
// 局部常量 LEGACY_HOME_STENO_RE：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const LEGACY_HOME_STENO_RE = /^(?:~|～)\/\.steno\//;
// 局部常量 MARKDOWN_IMAGE_RE：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

/** 数据目录变化监听器集合 —— 供图片 NodeView 在 dataDir 异步就绪后刷新自身。 */
type DataDirListener = () => void;
// 局部常量 dataDirListeners：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const dataDirListeners = new Set<DataDirListener>();

// 函数 trimTrailingSlashes：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function trimTrailingSlashes(path: string): string {
  return path.replace(/[\\/]+$/, '');
}

// 函数 safeRelativeAssetPath：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function safeRelativeAssetPath(relativePath: string): string | null {
  if (!relativePath || relativePath.startsWith('/') || relativePath.includes('..') || relativePath.includes('\\')) {
    return null;
  }
  return relativePath;
}

// 函数 legacyStenoAssetRelativePath：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function legacyStenoAssetRelativePath(url: string): string | null {
  // 局部常量 match：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const match = LEGACY_HOME_STENO_RE.exec(url.trim());
  if (!match) return null;
  return safeRelativeAssetPath(url.trim().slice(match[0].length));
}

// 函数 fileUrlPath：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function fileUrlPath(url: string): string | null {
  if (!url.startsWith('file://')) return null;
  try {
    return decodeURI(new URL(url).pathname);
  } catch {
    return null;
  }
}

// 函数 setStenoAssetDataDir：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function setStenoAssetDataDir(dataDir: string | null | undefined) {
  // 局部常量 next：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const next = dataDir || null;
  if (next === cachedDataDir) return;
  cachedDataDir = next;
  // 通知所有订阅者（图片 NodeView）数据目录已变化，以便刷新已渲染但当时 dataDir
  // 尚未就绪的图片。单个监听器抛错不应影响其余刷新。
  for (const listener of dataDirListeners) {
    try {
      listener();
    } catch {
      // 忽略单个监听器异常
    }
  }
}

/**
 * 订阅数据目录变化。
 *
 * 图片 NodeView 据此在数据目录异步就绪后刷新已渲染图片：首帧渲染时 `cachedDataDir`
 * 可能尚未就绪（`getDataPaths` 是异步 IPC），导致 `steno-asset:` 路径无法解析、图片
 * 加载失败；速记浮窗是独立 webview，其 `cachedDataDir` 初始为空，尤为明显。
 *
 * @returns 取消订阅函数
 */
export function subscribeStenoAssetDataDir(listener: DataDirListener): () => void {
  dataDirListeners.add(listener);
  return () => {
    dataDirListeners.delete(listener);
  };
}

// 函数 isStenoAssetUrl：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function isStenoAssetUrl(url: string): boolean {
  return url.startsWith(STENO_ASSET_PREFIX);
}

// 函数 stenoAssetRelativePath：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function stenoAssetRelativePath(url: string): string | null {
  if (!isStenoAssetUrl(url)) return null;
  // 局部常量 relativePath：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const relativePath = url.slice(STENO_ASSET_PREFIX.length);
  return safeRelativeAssetPath(relativePath);
}

// 函数 stenoAssetAbsolutePath：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function stenoAssetAbsolutePath(url: string, dataDir = cachedDataDir): string | null {
  // 局部常量 relativePath：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const relativePath = stenoAssetRelativePath(url) ?? legacyStenoAssetRelativePath(url);
  if (relativePath && dataDir) return `${trimTrailingSlashes(dataDir)}/${relativePath}`;

  if (!dataDir) return null;
  // 局部常量 root：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const root = trimTrailingSlashes(dataDir);
  // 局部常量 localPath：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const localPath = fileUrlPath(url) ?? url;
  if (localPath === root || localPath.startsWith(`${root}/`)) return localPath;
  return null;
}

// 函数 stenoAssetDisplaySrc：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function stenoAssetDisplaySrc(url: string, dataDir = cachedDataDir): string {
  // 局部常量 absolutePath：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const absolutePath = stenoAssetAbsolutePath(url, dataDir);
  if (!absolutePath) return url;
  return isTauri() ? convertFileSrc(absolutePath) : absolutePath;
}

// 函数 resolveStenoAssetUrls：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function resolveStenoAssetUrls(markdown: string, dataDir = cachedDataDir): string {
  if (
    !dataDir &&
    !markdown.includes(STENO_ASSET_PREFIX) &&
    !markdown.includes('~/.steno/') &&
    !markdown.includes('～/.steno/')
  ) {
    return markdown;
  }
  return markdown.replace(MARKDOWN_IMAGE_RE, (match, alt: string, url: string) => {
    // 局部常量 displaySrc：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const displaySrc = stenoAssetDisplaySrc(url, dataDir);
    return displaySrc === url ? match : `![${alt}](${displaySrc})`;
  });
}
