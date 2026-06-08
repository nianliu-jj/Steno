/**
 * @file 前端工具函数 - reminders
 *
 * 组织 reminders 的核心逻辑、类型和协作边界，供 前端工具函数 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import type { ReminderOption } from '@/types/steno';

const UNIT_TO_MS: Record<ReminderOption['unit'], number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000
};

// 函数 computeReminderTime：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function computeReminderTime(option: ReminderOption, now = new Date()): string {
  if (option.type === 'relative') {
    return new Date(now.getTime() + option.value * UNIT_TO_MS[option.unit]).toISOString();
  }

  const [hourText = '0', minuteText = '0'] = (option.absoluteTime ?? '00:00').split(':');
  // 局部常量 next：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const next = new Date(now);
  next.setDate(now.getDate() + (option.dayOffset ?? 0));
  next.setHours(Number(hourText), Number(minuteText), 0, 0);
  return next.toISOString();
}
