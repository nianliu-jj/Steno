/**
 * @file 项目自动化脚本 - update pkg
 *
 * 组织 update pkg 的核心逻辑、类型和协作边界，供 项目自动化脚本 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { execCommand } from '../shared';

// 函数 updatePkg：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function updatePkg(args: string[] = ['--deep', '-u']) {
  execCommand('npx', ['npm-check-updates', ...args], { stdio: 'inherit' });
}
