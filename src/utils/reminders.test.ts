/**
 * @file 前端工具函数 - reminders
 *
 * 覆盖 reminders 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { describe, expect, it } from 'vitest';

import type { ReminderOption } from '@/types/steno';
import { computeReminderTime } from './reminders';

// 测试用例：验证「computeReminderTime」场景，锁定 reminders 的用户可见行为。
describe('computeReminderTime', () => {
  // 局部常量 now：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const now = new Date('2026-05-26T08:30:00.000Z');

  it.each([
    ['minute', 30, 30 * 60 * 1000],
    ['hour', 2, 2 * 60 * 60 * 1000],
    ['day', 1, 24 * 60 * 60 * 1000]
  ] as const)('computes relative %s reminders', (unit, value, delta) => {
    const option: ReminderOption = {
      id: `${unit}-${value}`,
      label: '相对提醒',
      type: 'relative',
      value,
      unit
    };

    expect(new Date(computeReminderTime(option, now)).getTime()).toBe(now.getTime() + delta);
  });

  // 测试用例：验证「computes absolute reminders using local calendar day and time」场景，锁定 reminders 的用户可见行为。
  it('computes absolute reminders using local calendar day and time', () => {
    const option: ReminderOption = {
      id: 'tomorrow-16',
      label: '明天下午 4 点',
      type: 'absolute',
      value: 0,
      unit: 'minute',
      absoluteTime: '16:00',
      dayOffset: 1
    };

    // 局部常量 actual：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const actual = new Date(computeReminderTime(option, now));
    // 局部常量 expected：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const expected = new Date(now);
    expected.setDate(now.getDate() + 1);
    expected.setHours(16, 0, 0, 0);

    expect(actual.getTime()).toBe(expected.getTime());
  });
});
