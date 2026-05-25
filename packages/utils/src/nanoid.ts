/**
 * @file 唯一 ID 生成器 — 基于 nanoid 的 URL-safe 短 ID。
 *
 * `nanoid` 比 `uuid` 更紧凑（21 字符 vs 36 字符），
 * 且使用 URL-safe 字母表（`A-Za-z0-9_-`），适合用作请求 ID、临时 key 等。
 */

import { nanoid } from 'nanoid';

export { nanoid };
