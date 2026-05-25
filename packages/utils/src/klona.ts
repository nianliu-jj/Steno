/**
 * @file 深克隆工具 — 基于 klona/json 的 JSON 兼容深拷贝。
 *
 * `klona/json` 比 `structuredClone` 更快且支持更广泛的 JSON 兼容类型，
 * 比 `JSON.parse(JSON.stringify(x))` 更安全（正确处理 `Date`、`RegExp` 等）。
 */

import { klona as jsonClone } from 'klona/json';

/** JSON 兼容的深克隆函数。重新导出为 `jsonClone` 以明确语义。 */
export { jsonClone };
