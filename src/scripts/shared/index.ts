/**
 * @file 项目自动化脚本 - shared
 *
 * 组织 shared 的核心逻辑、类型和协作边界，供 项目自动化脚本 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import type { Options } from 'execa';

// 函数 execCommand：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function execCommand(cmd: string, args: string[], options?: Options) {
  const { execa } = await import('execa');
  // 局部常量 res：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const res = await execa(cmd, args, options);
  return (res?.stdout as string)?.trim() || '';
}
