/**
 * @file 项目自动化脚本 - changelog
 *
 * 组织 changelog 的核心逻辑、类型和协作边界，供 项目自动化脚本 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { generateChangelog, generateTotalChangelog } from '../changelog';
import type { ChangelogOption } from '../changelog';

// 函数 genChangelog：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function genChangelog(options?: Partial<ChangelogOption>, total = false) {
  if (total) {
    await generateTotalChangelog(options);
  } else {
    await generateChangelog(options);
  }
}
