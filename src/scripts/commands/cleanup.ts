/**
 * @file 项目自动化脚本 - cleanup
 *
 * 组织 cleanup 的核心逻辑、类型和协作边界，供 项目自动化脚本 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { rimraf } from 'rimraf';

// 函数 cleanup：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function cleanup(paths: string[]) {
  await rimraf(paths, { glob: true });
}
