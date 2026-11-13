import { describe, expect, it } from 'vitest';
import type { Payment } from '@manage-expenses/core';
import { buildReminderPlan, reminderDate } from './reminderPlan';

const payment = (overrides: Partial<Payment> = {}): Payment => ({
  id: 'one', title: 'Private bill', amount: 100, categoryId: 'private-category',
  dueDate: '2028-03-01', recurrence: 'monthly', reminderDays: 1, ...overrides,
});

describe('mobile reminder plan', () => {
  it('uses 9 AM local calendar time across month and leap-year boundaries', () => {
    const date = reminderDate(payment());
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2028, 1, 29, 9]);
  });
  it('allows same-day reminders and never sends missed reminders retroactively', () => {
    const item = payment({ reminderDays: 0 });
    expect(buildReminderPlan([item], new Date(2028, 2, 1, 8).getTime()).scheduled).toHaveLength(1);
    expect(buildReminderPlan([item], new Date(2028, 2, 1, 9).getTime()).scheduled).toHaveLength(0);
  });
  it('limits pending notifications to the nearest 50', () => {
    const payments = Array.from({ length: 60 }, (_, index) => payment({ id: String(index).padStart(2, '0') })).reverse();
    const result = buildReminderPlan(payments, new Date(2028, 0, 1).getTime());
    expect(result.scheduled).toHaveLength(50);
    expect(result.deferred).toBe(10);
    expect(result.scheduled[0].payment.id).toBe('00');
    expect(payments[0].id).toBe('59');
  });
  it('reflects due-date/reminder changes and removals without keeping prior entries', () => {
    const now = new Date(2028, 0, 1).getTime();
    const first = buildReminderPlan([payment()], now).scheduled[0].date;
    const changed = buildReminderPlan([payment({ reminderDays: 4 })], now).scheduled[0].date;
    expect(changed.getTime()).toBeLessThan(first.getTime());
    expect(buildReminderPlan([], now).scheduled).toEqual([]);
  });
  it('does not independently generate monthly/yearly future occurrences', () => {
    const plan = buildReminderPlan([payment(), payment({ id: 'annual', recurrence: 'yearly' })], new Date(2028, 0, 1).getTime());
    expect(plan.scheduled.map(({ payment: item }) => item.id)).toEqual(['annual', 'one']);
  });
});
