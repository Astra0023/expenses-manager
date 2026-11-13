import { formatMoney, monthRange, shiftMonth } from './expenses';
import type { Category, Expense, Profile } from './types';

export interface Budget {
  gross: number;
  tax: number;
  net: number;
  savings: number;
  /** what can be spent per month after tax and savings */
  spendLimit: number;
}

export function computeBudget(p: Pick<Profile, 'monthlyIncome' | 'taxRate' | 'savingsRate'>): Budget {
  const gross = p.monthlyIncome;
  const tax = (gross * p.taxRate) / 100;
  const net = gross - tax;
  const savings = (net * p.savingsRate) / 100;
  return { gross, tax, net, savings, spendLimit: net - savings };
}

export type InsightLevel = 'good' | 'info' | 'warn' | 'danger';
export interface Insight {
  level: InsightLevel;
  text: string;
}

const GENERAL_TIPS = [
  'Pay yourself first: move your savings out as soon as income arrives.',
  'Review recurring subscriptions every quarter and cancel what you do not use.',
  'Wait 24 hours before any non-essential purchase over your usual spend.',
  'Build an emergency fund covering 3–6 months of essential expenses.',
  'Track small daily purchases; they often add up to your biggest category.',
  'Plan meals for the week to cut food and grocery costs.',
  'Set a separate limit for entertainment so it never crowds out essentials.',
];

export function spentInMonth(expenses: Expense[], month: string): number {
  const { from, to } = monthRange(month);
  return expenses.filter((e) => e.date >= from && e.date <= to).reduce((s, e) => s + e.amount, 0);
}

/** Monthly category alerts start at 80%, with danger at/above the limit. */
export function categoryBudgetAlerts(
  expenses: Expense[],
  categories: Category[],
  budgets: Record<string, number>,
  month: string,
): Insight[] {
  const { from, to } = monthRange(month);
  return Object.entries(budgets).flatMap(([id, limit]): Insight[] => {
    if (!Number.isFinite(limit) || limit <= 0) throw new Error('Invalid category budget');
    const category = categories.find((c) => c.id === id);
    if (!category) throw new Error('Category not found');
    const spent = expenses.filter((e) => e.categoryId === id && e.date >= from && e.date <= to).reduce((sum, e) => sum + e.amount, 0);
    if (spent < limit * 0.8) return [];
    return [{
      level: spent >= limit ? 'danger' : 'warn',
      text: `${category.name}: ${Math.round(spent / limit * 100)}% of monthly category budget used (${formatMoney(spent)} / ${formatMoney(limit)}).`,
    }];
  });
}

/** Local, data-driven suggestions plus a rotating general tip (no network). */
export function buildInsights(
  expenses: Expense[],
  categories: Category[],
  profile: Profile,
  month: string,
  now: Date = new Date(),
  categoryBudgets: Record<string, number> = {},
): Insight[] {
  const out: Insight[] = categoryBudgetAlerts(expenses, categories, categoryBudgets, month);
  const { from, to } = monthRange(month);
  const inMonth = expenses.filter((e) => e.date >= from && e.date <= to);
  const spent = inMonth.reduce((s, e) => s + e.amount, 0);
  const budget = computeBudget(profile);

  if (profile.monthlyIncome <= 0) {
    out.push({ level: 'info', text: 'Set your monthly income in Profile to get a personalised spending limit.' });
  } else {
    const pct = budget.spendLimit > 0 ? (spent / budget.spendLimit) * 100 : 100;
    if (spent > budget.spendLimit) {
      out.push({ level: 'danger', text: `You are ${formatMoney(spent - budget.spendLimit)} over your monthly spending limit.` });
    } else if (pct >= 80) {
      out.push({ level: 'warn', text: `You have used ${Math.round(pct)}% of your monthly limit; ${formatMoney(budget.spendLimit - spent)} left.` });
    } else {
      out.push({ level: 'good', text: `On track: ${Math.round(pct)}% of your monthly limit used.` });
    }
  }

  if (inMonth.length === 0) {
    out.push({ level: 'info', text: 'No expenses recorded this month yet. Add one in Manage Expenses.' });
  } else {
    const totals = new Map<string, number>();
    inMonth.forEach((e) => totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + e.amount));
    const [topId, topAmount] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
    const name = categories.find((c) => c.id === topId)?.name ?? topId;
    out.push({ level: 'info', text: `Your biggest category this month is ${name} (${Math.round((topAmount / spent) * 100)}% of spending).` });
  }

  const previous = spentInMonth(expenses, shiftMonth(month, -1));
  if (previous > 0 && spent > 0) {
    const change = Math.round(((spent - previous) / previous) * 100);
    if (change > 0) out.push({ level: 'warn', text: `Spending is up ${change}% compared with last month.` });
    else if (change < 0) out.push({ level: 'good', text: `Spending is down ${Math.abs(change)}% compared with last month.` });
  }

  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000);
  out.push({ level: 'info', text: GENERAL_TIPS[dayOfYear % GENERAL_TIPS.length] });
  return out;
}
