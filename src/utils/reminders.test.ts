import { describe, expect, it } from 'vitest';

import type { ReminderOption } from '@/types/steno';
import { computeReminderTime } from './reminders';

describe('computeReminderTime', () => {
  const now = new Date('2026-05-26T08:30:00.000Z');

  it.each([
    ['minute', 30, 30 * 60 * 1000],
    ['hour', 2, 2 * 60 * 60 * 1000],
    ['day', 1, 24 * 60 * 60 * 1000],
  ] as const)('computes relative %s reminders', (unit, value, delta) => {
    const option: ReminderOption = {
      id: `${unit}-${value}`,
      label: '相对提醒',
      type: 'relative',
      value,
      unit,
    };

    expect(new Date(computeReminderTime(option, now)).getTime()).toBe(
      now.getTime() + delta,
    );
  });

  it('computes absolute reminders using local calendar day and time', () => {
    const option: ReminderOption = {
      id: 'tomorrow-16',
      label: '明天下午 4 点',
      type: 'absolute',
      value: 0,
      unit: 'minute',
      absoluteTime: '16:00',
      dayOffset: 1,
    };

    const actual = new Date(computeReminderTime(option, now));
    const expected = new Date(now);
    expected.setDate(now.getDate() + 1);
    expected.setHours(16, 0, 0, 0);

    expect(actual.getTime()).toBe(expected.getTime());
  });
});
