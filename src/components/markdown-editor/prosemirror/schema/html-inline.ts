/**
 * @file 内联 HTML 白名单与属性清洗
 *
 * 由 PureMark `src/core/schema/index.ts` 顶部的 `SAFE_INLINE_TAGS` 与
 * `parseHtmlAttrs` 原样移植；保留中文注释，便于在 Steno 一侧追踪与维护。
 *
 * 仅服务于 schema 的 `html_inline` mark。块级 HTML 走 `html_block` 节点 +
 * NodeView 的 DOMPurify 清洗管线；两者分工互补。
 */

/** 内联 HTML 标签白名单：仅语义/排版相关标签，禁止 script/iframe/object 等可执行容器。 */
export const SAFE_INLINE_TAGS = new Set<string>([
  'span',
  'mark',
  'u',
  's',
  'del',
  'ins',
  'abbr',
  'kbd',
  'var',
  'cite',
  'small',
  'ruby',
  'rp',
  'rt',
  'samp',
  'q',
  'bdi',
  'bdo',
  'data',
  'time',
  'dfn',
  'label',
  'b',
  'i',
  'em',
  'strong',
  'code',
  'sub',
  'sup',
  'a',
  'font'
]);

/**
 * 解析 HTML 属性字符串为安全属性对象。
 *
 * 安全规则：
 * - 剥离 `on*` 事件属性（onclick / onerror / onload …）
 * - 剥离 `href` / `src` / `action` 中的 `javascript:` / `vbscript:` / `data:` 协议
 * - 其余属性按 `name=value` 形式输出（属性名小写化）
 *
 * @example
 * ```ts
 * parseHtmlAttrs('class="foo" style="color:red"');
 * // → { class: 'foo', style: 'color:red' }
 *
 * parseHtmlAttrs('onclick="alert(1)" href="javascript:void(0)"');
 * // → {}
 * ```
 */
export function parseHtmlAttrs(attrStr: string): Record<string, string> {
  if (!attrStr) return {};
  const result: Record<string, string> = {};
  // 局部常量 re：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    // 局部常量 name：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const name = m[1].toLowerCase();
    // 局部常量 value：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    if (name.startsWith('on')) continue;
    if ((name === 'href' || name === 'src' || name === 'action') && /^\s*(javascript|vbscript|data)\s*:/i.test(value)) {
      continue;
    }
    result[name] = value;
  }
  return result;
}
