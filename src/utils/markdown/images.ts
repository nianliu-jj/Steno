/**
 * @file Tauri 相对图片路径转换工具。
 *
 * 参考 PureMark `src/plugins/imagePathPlugin.ts`，按以下顺序处理 `<img src="">`：
 *   1. 已含 scheme 的 URL（http(s)、data、blob、asset、tauri、mailto、tel、
 *      Steno 自家的 `steno-asset:`、`file:`）→ 原样返回
 *   2. 相对路径 + 有 `noteDir` → 拼接绝对路径 → `convertFileSrc` → `asset://` URL
 *   3. 相对路径但无 `noteDir`（如 `text` 类型笔记不落盘）→ 原样返回
 *
 * Steno 已有的 `steno-asset:` 协议由 `utils/stenoAssets.ts` 在 `renderHtml` 之前
 * 预处理，故本模块仅负责"剩余的相对路径"场景，不替换现有机制。
 */

import { convertFileSrc, isTauri } from '@tauri-apps/api/core';

const ABSOLUTE_URL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const STENO_PROTOCOLS_RE = /^(?:steno-asset|asset|tauri):/i;
const TILDE_STENO_RE = /^[~～]\//;

function trimTrailingSlash(path: string): string {
  return path.replace(/[\\/]+$/, '');
}

function ensureForwardSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * 把相对路径基于 `noteDir` 拼接为可访问的图片 URL。
 *
 * @param src     原始 `<img src="...">` 值（可能是绝对 URL、相对路径或 Steno 协议）
 * @param noteDir 当前笔记所在目录绝对路径；空表示无目录上下文（如 text 类型）
 */
export function resolveImageSrc(src: string, noteDir?: string): string {
  const trimmed = src.trim();
  if (!trimmed) return src;

  // 已经是 steno 自家协议或 tauri/asset 协议（应由其它工具处理）
  if (STENO_PROTOCOLS_RE.test(trimmed)) return src;

  // 已含 scheme（http/https/data/blob/mailto/tel/file 等）或协议相对 `//host`
  if (ABSOLUTE_URL_RE.test(trimmed)) return src;

  // `~/.steno/...` 由 stenoAssets 工具处理，这里不拦
  if (TILDE_STENO_RE.test(trimmed)) return src;

  // 没有 noteDir，留给调用方原样使用（spec: text 类型回退场景）
  if (!noteDir) return src;

  const base = trimForwardSlashed(noteDir);
  const relative = trimmed.replace(/^\.\//, '');
  if (!relative) return src;

  const absolute = `${base}/${relative}`;
  return isTauri() ? convertFileSrc(absolute) : absolute;
}

function trimForwardSlashed(noteDir: string): string {
  return trimTrailingSlash(ensureForwardSlashes(noteDir));
}
