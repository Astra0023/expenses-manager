import { bytesToHex } from '@noble/hashes/utils';
import { DEFAULT_CURRENCY, isCurrencyCode, type CurrencyCode, type Expense, type ExpenseFilter, type KeyValueStorage, type NewExpense, type RandomBytes } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value) || value.slice(0, 4) === '0000') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const todayISO = () => toISODate(new Date());
export const currentMonth = () => todayISO().slice(0, 7);

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function validateExpense(e: NewExpense): void {
  if (!Number.isFinite(e.amount) || e.amount <= 0) throw new Error('Amount must be greater than 0');
  if (!isValidISODate(e.date)) throw new Error('Date must be a valid YYYY-MM-DD');
  if (typeof e.categoryId !== 'string' || !e.categoryId.trim()) throw new Error('Category is required');
  if (typeof e.note !== 'string') throw new Error('Note must be text');
}

/** Returns first/last day (YYYY-MM-DD) for a YYYY-MM month. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: `${month}-${pad(new Date(y, m, 0).getDate())}` };
}

export function filterExpenses(expenses: Expense[], f: ExpenseFilter): Expense[] {
  return expenses
    .filter((e) => (!f.from || e.date >= f.from) && (!f.to || e.date <= f.to))
    .filter((e) => !f.categoryId || f.categoryId === 'All' || e.categoryId === f.categoryId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function formatMoney(n: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  if (!isCurrencyCode(currency)) throw new Error('Unsupported currency');
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
}

export function createExpenseService(storage: KeyValueStorage, randomBytes: RandomBytes, userId: string) {
  const key = `me:expenses:${userId}`;
  const load = async (): Promise<Expense[]> => {
    const raw = await storage.getItem(key);
    const list = raw ? (JSON.parse(raw) as (Expense & { category?: string })[]) : [];
    // First version stored the category name in `category`.
    return list.map(({ category, ...e }) => ({ ...e, categoryId: e.categoryId ?? category ?? 'Other' }));
  };
  const save = (list: Expense[]) => storage.setItem(key, JSON.stringify(list));

  return {
    list: load,
    async add(input: NewExpense): Promise<Expense> {
      validateExpense(input);
      const expense: Expense = { ...input, id: bytesToHex(randomBytes(8)) };
      await save([...(await load()), expense]);
      return expense;
    },
    async update(id: string, input: NewExpense): Promise<void> {
      validateExpense(input);
      const list = await load();
      const index = list.findIndex((e) => e.id === id);
      if (index < 0) throw new Error('Expense not found');
      list[index] = { ...input, id };
      await save(list);
    },
    async remove(id: string): Promise<void> {
      await save((await load()).filter((e) => e.id !== id));
    },
  };
}

export type ExpenseService = ReturnType<typeof createExpenseService>;
