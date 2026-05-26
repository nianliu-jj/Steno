import type { ReminderOption } from '@/types/steno';

const UNIT_TO_MS: Record<ReminderOption['unit'], number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
};

export function computeReminderTime(option: ReminderOption, now = new Date()): string {
  if (option.type === 'relative') {
    return new Date(now.getTime() + option.value * UNIT_TO_MS[option.unit]).toISOString();
  }

  const [hourText = '0', minuteText = '0'] = (option.absoluteTime ?? '00:00').split(':');
  const next = new Date(now);
  next.setDate(now.getDate() + (option.dayOffset ?? 0));
  next.setHours(Number(hourText), Number(minuteText), 0, 0);
  return next.toISOString();
}
