/**
 * @file 项目自动化脚本 - shared
 *
 * 组织 shared 的核心逻辑、类型和协作边界，供 项目自动化脚本 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import type { Options as ExecaOptions } from 'execa';

// 函数 execCommand：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function execCommand(cmd: string, args: string[], options?: ExecaOptions): Promise<string> {
  const { execa } = await import('execa');
  // 局部常量 res：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const res = await execa(cmd, args, options);
  return ((res?.stdout as string)?.trim?.() as string) || '';
}

// 函数 notNullish：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function notNullish<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}

// 函数 partition：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function partition<T>(array: T[], ...filters: Array<(e: T, idx: number, arr: T[]) => boolean>): T[][] {
  const result: T[][] = Array.from({ length: filters.length + 1 }, () => [] as T[]);
  array.forEach((e, idx, arr) => {
    let i = 0;
    for (const filter of filters) {
      if (filter(e, idx, arr)) {
        result[i].push(e);
        return;
      }
      i += 1;
    }
    result[i].push(e);
  });
  return result;
}

// 函数 groupBy：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function groupBy<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T,
  groups: Record<string, T[]> = {}
): Record<string, T[]> {
  for (const item of items) {
    // 局部常量 v：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const v = String(item[key]);
    groups[v] ||= [];
    groups[v].push(item);
  }
  return groups;
}

// 函数 capitalize：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// 函数 join：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function join(array: readonly string[] | undefined, glue: string = ', ', finalGlue: string = ' and '): string {
  if (!array || array.length === 0) return '';
  if (array.length === 1) return array[0];
  if (array.length === 2) return array.join(finalGlue);
  return `${array.slice(0, -1).join(glue)}${finalGlue}${array.slice(-1)}`;
}
