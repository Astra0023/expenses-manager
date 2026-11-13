export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type RandomBytes = (length: number) => Uint8Array;

export const DEFAULT_CATEGORY_NAMES = [
  'Food',
  'Transport',
  'Housing',
  'Utilities',
  'Health',
  'Entertainment',
  'Shopping',
  'Other',
] as const;

export const DEFAULT_CURRENCY = 'USD';
export const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'US Dollar (USD)' },
  { value: 'CAD', label: 'Canadian Dollar (CAD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'GBP', label: 'British Pound (GBP)' },
  { value: 'AUD', label: 'Australian Dollar (AUD)' },
  { value: 'NZD', label: 'New Zealand Dollar (NZD)' },
  { value: 'JPY', label: 'Japanese Yen (JPY)' },
  { value: 'CNY', label: 'Chinese Yuan (CNY)' },
  { value: 'INR', label: 'Indian Rupee (INR)' },
  { value: 'PHP', label: 'Philippine Peso (PHP)' },
] as const;
export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number]['value'];

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && CURRENCY_OPTIONS.some((option) => option.value === value);
}

export type CategoryStatus = 'active' | 'inactive';

export interface Category {
  id: string;
  name: string;
  status: CategoryStatus;
}

/** date is ISO local date: YYYY-MM-DD */
export interface Expense {
  id: string;
  amount: number;
  categoryId: string;
  note: string;
  date: string;
}

export type NewExpense = Omit<Expense, 'id'>;

/** A manually settled scheduled payment; dueDate is a calendar date, not an instant. */
export interface Payment {
  id: string;
  title: string;
  amount: number;
  categoryId: string;
  dueDate: string;
  recurrence: 'none' | 'monthly' | 'yearly';
  reminderDays: number;
}

export type NewPayment = Omit<Payment, 'id'>;

export interface Profile {
  firstName: string;
  lastName: string;
  currency: CurrencyCode;
  monthlyIncome: number;
  /** percent of income withheld as tax (0-100) */
  taxRate: number;
  /** percent of net income to set aside as savings (0-100) */
  savingsRate: number;
}

export interface Account extends Profile {
  id: string;
  username: string;
  /** small image as a data URL, resized by the app before saving */
  avatar?: string;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
}

export interface ExpenseFilter {
  from?: string;
  to?: string;
  categoryId?: string | 'All';
}

export type ReportPeriod = 'monthly' | 'quarterly' | 'yearly';

export interface ReportRow {
  key: string;
  label: string;
  total: number;
  count: number;
  byCategory: Record<string, number>;
}
