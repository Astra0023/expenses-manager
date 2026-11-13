import type { Payment } from '@manage-expenses/core';

export function reminderDate(payment: Payment) {
  const [year, month, day] = payment.dueDate.split('-').map(Number);
  const date = new Date(year, month - 1, day, 9);
  date.setDate(date.getDate() - payment.reminderDays);
  return date;
}

export function buildReminderPlan(payments: Payment[], now = Date.now()) {
  const future = payments.map((payment) => ({ payment, date: reminderDate(payment) }))
    .filter(({ date }) => Number.isFinite(date.getTime()) && date.getTime() > now)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.payment.id.localeCompare(b.payment.id));
  return { scheduled: future.slice(0, 50), deferred: Math.max(0, future.length - 50) };
}
