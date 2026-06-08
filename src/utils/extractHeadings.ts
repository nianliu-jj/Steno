/**
 * @file 前端工具函数 - extract Headings
 *
 * 组织 extract Headings 的核心逻辑、类型和协作边界，供 前端工具函数 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

export interface OutlineHeading {
  id: string;
  level: number;
  text: string;
}

// 局部常量 HEADING_RE：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const HEADING_RE = /^(#{1,6})[ \t]+(.+)$/gm;

// 函数 extractHeadings：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function extractHeadings(markdown: string): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  let index = 0;

  for (const match of markdown.matchAll(HEADING_RE)) {
    // 局部常量 text：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const text = match[2].trim();
    if (!text) continue;

    out.push({
      id: `heading-${index++}`,
      level: match[1].length,
      text
    });
  }

  return out;
}
