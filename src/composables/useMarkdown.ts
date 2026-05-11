// Markdown 工具：纯前端"即时反馈"层。
// - renderHtml(md)：用 marked 渲染，给预览面板用
// - countWords(md)：CJK 单字 + 拉丁单词混合计数（与 Rust 端的 word_count
//   计算保持类似口径，便于 UI 显示）
// - extractTags(md)：抽取所有 #tag，**仅供 UI 即时 chips 显示**；最终入库的
//   tags 以 Rust 端 extract_tags 的结果为准（db.rs 已实现）。
//
// renderHtml 的输出会进入 v-html，因此对 marked 启用了默认 sanitize 规则
// （marked 16 已移除内置 sanitizer，这里仅做 GFM 渲染；如需 XSS 隔离应在
// 调用方加 DOMPurify。MVP 阶段所有内容都是本地用户自己写的，先不接入）。

import { marked } from 'marked';

const TAG_REGEX = /#([\w一-龥][\w一-龥-]*)/gu;

export function useMarkdown() {
  function renderHtml(md: string): string {
    if (!md) {
      return '';
    }
    // marked.parse 在配置 async:false 时同步返回 string
    return marked.parse(md, { async: false }) as string;
  }

  function countWords(md: string): number {
    if (!md) {
      return 0;
    }
    // CJK 单字逐个算一词；拉丁连续 ascii / 数字 当作一词。
    const cjk = md.match(/[一-龥぀-ヿ]/gu)?.length ?? 0;
    const latin = md.match(/[A-Za-z0-9]+/gu)?.length ?? 0;
    return cjk + latin;
  }

  function extractTags(md: string): string[] {
    if (!md) {
      return [];
    }
    const seen = new Set<string>();
    const out: string[] = [];
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
