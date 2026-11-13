import type { Payment } from '@manage-expenses/core';
import { addMonthsClamped, daysBetween } from './dates';

export type PaymentStatus = 'overdue' | 'due-today' | 'reminder' | 'upcoming';

export const RECURRENCE_LABELS: Record<Payment['recurrence'], string> = {
  none: 'One-time',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export const STATUS_LABELS: Record<PaymentStatus, string> = {
  overdue: 'Overdue',
  'due-today': 'Due today',
  reminder: 'Due soon',
  upcoming: 'Scheduled',
};

export const DEFAULT_REMINDER_DAYS = 3;
export const MAX_REMINDER_DAYS = 60;

export function paymentStatus(payment: Payment, today: string): PaymentStatus {
  const days = daysBetween(today, payment.dueDate);
  if (days < 0) return 'overdue';
  if (days === 0) return 'due-today';
  if (days <= payment.reminderDays) return 'reminder';
  return 'upcoming';
}

/** True once the payment is inside its reminder window (or overdue) and still unpaid. */
export function needsAttention(payment: Payment, today: string): boolean {
  return paymentStatus(payment, today) !== 'upcoming';
}

export function describeDue(payment: Payment, today: string): string {
  const days = daysBetween(today, payment.dueDate);
  if (days < -1) return `Overdue by ${-days} days`;
  if (days === -1) return 'Overdue by 1 day';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

export function sortByDueDate(payments: Payment[]): Payment[] {
  return [...payments].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
}

/** Next due date after marking paid; null for one-time payments. Used only by the in-memory demo. */
export function nextDueDate(payment: Payment): string | null {
  if (payment.recurrence === 'monthly') return addMonthsClamped(payment.dueDate, 1);
  if (payment.recurrence === 'yearly') return addMonthsClamped(payment.dueDate, 12);
  return null;
}