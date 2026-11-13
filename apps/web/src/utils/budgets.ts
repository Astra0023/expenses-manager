import type { Expense } from '@manage-expenses/core';

export const BUDGET_WARN_PERCENT = 80;

export type BudgetLevel = 'ok' | 'warn' | 'over';

export interface CategoryBudgetStatus {
  categoryId: string;
  budget: number;
  spent: number;
  percent: number;
  level: BudgetLevel;
}

export function totalsByCategory(expenses: Expense[]): Map<string, number> {
  const totals = new Map<string, number>();
  expenses.forEach((e) => totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + e.amount));
  return totals;
}

export function budgetLevel(percent: number): BudgetLevel {
  if (percent > 100) return 'over';
  if (percent >= BUDGET_WARN_PERCENT) return 'warn';
  return 'ok';
}

/** Budget usage for every category that has a positive monthly limit, most-used first. */
export function categoryBudgetStatuses(monthExpenses: Expense[], budgets: Record<string, number>): CategoryBudgetStatus[] {
  const totals = totalsByCategory(monthExpenses);
  return Object.entries(budgets)
    .filter(([, budget]) => budget > 0)
    .map(([categoryId, budget]) => {
      const spent = totals.get(categoryId) ?? 0;
      const percent = (spent / budget) * 100;
      return { categoryId, budget, spent, percent, level: budgetLevel(percent) };
    })
    .sort((a, b) => b.percent - a.percent);
}