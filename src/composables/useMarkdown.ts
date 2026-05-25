/**
 * @file Markdown 纯前端工具集
 *
 * 提供三个独立函数：
 * - `renderHtml` — 用 marked 渲染 Markdown → HTML（预览面板使用）
 * - `countWords` — CJK 单字 + 拉丁单词混合计数（UI 即时字数显示）
 * - `extractTags` — 抽取 `#tag`，仅供 UI 即时 chips 显示
 *
 * **重要区分**：
 * - 前端 `extractTags` 仅用于 UI 即时反馈（输入 `#tag` 后立即显示 chip）
 * - 最终入库的 tags 以 **Rust 端** `extract_tags` 的结果为准（`db.rs`）
 * - 前端 `countWords` 与 Rust `word_count` 保持类似口径，但不保证完全一致
 *
 * **XSS 注意**：`renderHtml` 的输出会进入 `v-html`。marked 16 已移除内置
 * sanitizer，这里仅做 GFM 渲染。MVP 阶段所有内容都是本地用户自己写的，
 * XSS 风险极低；如需隔离应在调用方加 DOMPurify。
 */

import { marked } from 'marked';

/**
 * 标签正则：匹配 `#` 后跟字母/数字/下划线/连字符/中文的标签。
 *
 * 使用 `u` flag 以正确匹配 Unicode 字符（中文等）。
 * 使用 `g` flag 以在一次 `matchAll` 中匹配所有标签。
 *
 * @example 匹配结果
 * ```
 * '#hello'       → match[1] = 'hello'
 * '#前端'        → match[1] = '前端'
 * '#my-tag_01'   → match[1] = 'my-tag_01'
 * ```
 */
const TAG_REGEX = /#([\w一-龥][\w一-龥-]*)/gu;

/**
 * Markdown 工具集。
 *
 * @returns `{ renderHtml, countWords, extractTags }`
 */
export function useMarkdown() {
  /**
   * 将 Markdown 渲染为 HTML（GFM 语法）。
   *
   * @param md - Markdown 原文
   * @returns HTML 字符串；输入为空时返回 `''`
   */
  function renderHtml(md: string): string {
    if (!md) {
      return '';
    }
    // `async: false` 确保同步返回 string — marked 在同步模式下不返回 Promise
    return marked.parse(md, { async: false }) as string;
  }

  /**
   * 混合字数统计：CJK 单字逐个算一词，拉丁连续字母/数字算一词。
   *
   * **为什么不用 `split(/\s+/)`**：
   * 中文写作通常不用空格分词，`split` 会把整段中文算作一词。
   * 这里采用"CJK 单字一词 + 拉丁单词"的混合策略，更贴近用户感知的字数。
   *
   * **与 Rust 端差异**：Rust `word_count` 用 `split_whitespace().count()`，
   * 对纯中文不精确。未来可统一为 unicode-segmentation grapheme cluster 计数。
   *
   * @param md - Markdown 原文
   * @returns 估算字数
   *
   * @example
   * ```ts
   * countWords('Hello world');     // → 2 (两个拉丁单词)
   * countWords('你好世界');         // → 4 (四个 CJK 单字)
   * countWords('Hello 你好 world');// → 2 + 2 = 4
   * ```
   */
  function countWords(md: string): number {
    if (!md) {
      return 0;
    }
    // CJK 统一表意文字 + 日文假名：每个字符算一词
    const cjk = md.match(/[一-龥぀-ヿ]/gu)?.length ?? 0;
    // 拉丁字母和数字的连续序列算一词
    const latin = md.match(/[A-Za-z0-9]+/gu)?.length ?? 0;
    return cjk + latin;
  }

  /**
   * 从 Markdown 文本中抽取所有 `#tag`（去重、小写）。
   *
   * **仅供 UI 即时显示**：FloatingEditor 底部标签栏随输入实时更新。
   * 最终入库标签以后端 `extract_tags` 为准（会合并 extra_tags 参数）。
   *
   * @param md - Markdown 原文
   * @returns 去重后的标签数组（已转为小写）
   *
   * @example
   * ```ts
   * extractTags('#todo #前端 今天写完 #Todo');
   * // → ['todo', '前端']  （'Todo' 与 'todo' 去重，取小写）
   * ```
   */
  function extractTags(md: string): string[] {
    if (!md) {
      return [];
    }
    const seen = new Set<string>();
    const out: string[] = [];
    // matchAll 配合 g flag 返回迭代器，一次扫描全部匹配
    for (const match of md.matchAll(TAG_REGEX)) {
      const tag = match[1].toLowerCase();
      if (!seen.has(tag)) {
        seen.add(tag);
        out.push(tag);
      }
    }
    return out;
  }

  return { renderHtml, countWords, extractTags };
}
