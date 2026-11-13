import { toISODate } from './expenses';
import type { Expense, ReportPeriod, ReportRow } from './types';

export function periodKey(date: string, period: ReportPeriod): string {
  const year = date.slice(0, 4);
  if (period === 'monthly' || period === 'yearly') return date.slice(0, 7);
  return `${year}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
}

export function availableYears(expenses: Expense[]): string[] {
  return [...new Set(expenses.map((e) => e.date.slice(0, 4)))].sort().reverse();
}

export function reportMonthLabel(key: string): string {
  const month = Number(key.slice(5, 7));
  if (!/^\d{4}-\d{2}$/.test(key) || month < 1 || month > 12) return key;
  return new Date(2000, month - 1, 1).toLocaleString(undefined, { month: 'short' });
}

export interface ReportOptions {
  period: ReportPeriod;
  categoryId?: string | 'All';
  year?: string | 'All';
}

/** Expenses matching the selection; yearly comparisons exclude future months. */
export function filterForReport(expenses: Expense[], { period, categoryId = 'All', year = 'All' }: ReportOptions, now = new Date()): Expense[] {
  const latestMonth = toISODate(now).slice(0, 7);
  return expenses.filter(
    (e) =>
      (categoryId === 'All' || e.categoryId === categoryId) &&
      (year === 'All' || e.date.startsWith(year)) &&
      (period !== 'yearly' || e.date.slice(0, 7) <= latestMonth),
  );
}

/** Groups expenses by month/quarter (newest first), or compares elapsed months in a selected year. */
export function buildReport(expenses: Expense[], options: ReportOptions, now = new Date()): ReportRow[] {
  const rows = new Map<string, ReportRow>();
  for (const e of filterForReport(expenses, options, now)) {
    const key = periodKey(e.date, options.period);
    const row = rows.get(key) ?? { key, label: key, total: 0, count: 0, byCategory: {} };
    row.total += e.amount;
    row.count += 1;
    row.byCategory[e.categoryId] = (row.byCategory[e.categoryId] ?? 0) + e.amount;
    rows.set(key, row);
  }

  if (options.period === 'yearly' && options.year && options.year !== 'All' && /^\d{4}$/.test(options.year)) {
    const latestMonth = toISODate(now).slice(0, 7);
    for (let month = 1; month <= 12; month += 1) {
      const key = `${options.year}-${String(month).padStart(2, '0')}`;
      if (key > latestMonth) break;
      if (!rows.has(key)) rows.set(key, { key, label: key, total: 0, count: 0, byCategory: {} });
    }
  }

  return [...rows.values()].sort((a, b) => b.key.localeCompare(a.key));
}

export interface ReportSummary {
  total: number;
  count: number;
  /** Average per displayed period, including zero-spend months in yearly comparisons. */
  average: number;
  highest: ReportRow | null;
  /** categories sorted by amount, with their share of the total (0-100) */
  categories: { id: string; amount: number; percent: number }[];
}

export function summarizeReport(rows: ReportRow[]): ReportSummary {
  const total = rows.reduce((s, r) => s + r.total, 0);
  const byCategory = new Map<string, number>();
  rows.forEach((r) => Object.entries(r.byCategory).forEach(([id, v]) => byCategory.set(id, (byCategory.get(id) ?? 0) + v)));
  return {
    total,
    count: rows.reduce((s, r) => s + r.count, 0),
    average: rows.length ? total / rows.length : 0,
    highest: rows.filter((r) => r.count > 0).reduce<ReportRow | null>((best, r) => (!best || r.total > best.total ? r : best), null),
    categories: [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, amount]) => ({ id, amount, percent: total > 0 ? (amount / total) * 100 : 0 })),
  };
}
