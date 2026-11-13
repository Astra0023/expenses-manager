import { todayISO, type Category, type Expense, type Payment, type Profile } from '@manage-expenses/core';
import { addDays } from '../utils/dates';

/** Fictional data for the public demo. It is only held in React state and never persisted. */
export interface DemoData {
  profile: Profile;
  categories: Category[];
  expenses: Expense[];
  payments: Payment[];
  categoryBudgets: Record<string, number>;
}

const CATEGORIES: Category[] = [
  { id: 'demo-food', name: 'Food', status: 'active' },
  { id: 'demo-transport', name: 'Transport', status: 'active' },
  { id: 'demo-housing', name: 'Housing', status: 'active' },
  { id: 'demo-utilities', name: 'Utilities', status: 'active' },
  { id: 'demo-fun', name: 'Entertainment', status: 'active' },
  { id: 'demo-health', name: 'Health', status: 'active' },
];

export function createDemoData(today = todayISO()): DemoData {
  const monthStart = `${today.slice(0, 7)}-01`;
  const day = (offset: number) => {
    const date = addDays(monthStart, offset);
    return date > today ? today : date;
  };
  const expenses: Expense[] = [
    { id: 'demo-e1', amount: 1200, categoryId: 'demo-housing', date: day(0), note: 'Rent' },
    { id: 'demo-e2', amount: 86.4, categoryId: 'demo-food', date: day(1), note: 'Weekly groceries' },
    { id: 'demo-e3', amount: 42, categoryId: 'demo-transport', date: day(2), note: 'Transit pass top-up' },
    { id: 'demo-e4', amount: 64.9, categoryId: 'demo-utilities', date: day(3), note: 'Electricity' },
    { id: 'demo-e5', amount: 38.5, categoryId: 'demo-fun', date: day(4), note: 'Cinema' },
    { id: 'demo-e6', amount: 112.75, categoryId: 'demo-food', date: day(6), note: 'Groceries' },
    { id: 'demo-e7', amount: 25, categoryId: 'demo-health', date: day(7), note: 'Pharmacy' },
    { id: 'demo-e8', amount: 58.2, categoryId: 'demo-food', date: day(9), note: 'Dinner out' },
  ].sort((a, b) => b.date.localeCompare(a.date));
  return {
    profile: { firstName: 'Alex', lastName: 'Sample', currency: 'USD', monthlyIncome: 4200, taxRate: 20, savingsRate: 15 },
    categories: CATEGORIES,
    expenses,
    payments: [
      { id: 'demo-p1', title: 'Phone plan', amount: 35, categoryId: 'demo-utilities', dueDate: addDays(today, 2), recurrence: 'monthly', reminderDays: 3 },
      { id: 'demo-p2', title: 'Streaming subscription', amount: 12.99, categoryId: 'demo-fun', dueDate: addDays(today, 9), recurrence: 'monthly', reminderDays: 2 },
      { id: 'demo-p3', title: 'Car insurance', amount: 540, categoryId: 'demo-transport', dueDate: addDays(today, 40), recurrence: 'yearly', reminderDays: 14 },
    ],
    categoryBudgets: { 'demo-food': 300, 'demo-fun': 60, 'demo-transport': 120 },
  };
}