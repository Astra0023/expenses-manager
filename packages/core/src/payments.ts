import { isValidISODate } from './expenses';
import type { NewPayment, Payment } from './types';

export function validatePayment(payment: NewPayment): void {
  if (typeof payment.title !== 'string' || !payment.title.trim()) throw new Error('Payment title is required');
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) throw new Error('Amount must be greater than 0');
  if (typeof payment.categoryId !== 'string' || !payment.categoryId.trim()) throw new Error('Category is required');
  if (!isValidISODate(payment.dueDate)) throw new Error('Due date must be a valid YYYY-MM-DD');
  if (!['none', 'monthly', 'yearly'].includes(payment.recurrence)) throw new Error('Invalid recurrence');
  if (!Number.isSafeInteger(payment.reminderDays) || payment.reminderDays < 0) throw new Error('Reminder days must be a non-negative integer');
}

/** Advances exactly one cycle, never skipping overdue payments. Anchor survives short months. */
export function nextPaymentDate(payment: Payment, anchorDay = Number(payment.dueDate.slice(8, 10))): string {
  validatePayment(payment);
  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) throw new Error('Invalid recurrence anchor');
  if (payment.recurrence === 'none') throw new Error('Payment does not recur');
  let [year, month] = payment.dueDate.split('-').map(Number);
  if (payment.recurrence === 'yearly') year++;
  else if (++month > 12) { month = 1; year++; }
  if (year > 9999) throw new Error('Next payment date is out of range');
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  const day = Math.min(anchorDay, date.getUTCDate());
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export type PaymentStatus = 'overdue' | 'due' | 'upcoming';

/** Date-only arithmetic avoids daylight-saving and time-zone drift. */
export function paymentStatus(payment: Payment, today: string): PaymentStatus {
  validatePayment(payment);
  if (!isValidISODate(today)) throw new Error('Invalid current date');
  if (payment.dueDate < today) return 'overdue';
  const days = (Date.parse(`${payment.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days <= payment.reminderDays ? 'due' : 'upcoming';
}
