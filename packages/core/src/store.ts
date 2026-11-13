import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthService } from './auth';
import { createAppDataService } from './data';
import { formatMoney } from './expenses';
import type { Account, Category, Expense, KeyValueStorage, NewExpense, NewPayment, Payment, Profile, RandomBytes } from './types';

export interface AppContextValue {
  user: Account;
  expenses: Expense[];
  categories: Category[];
  payments: Payment[];
  categoryBudgets: Record<string, number>;
  activeCategories: Category[];
  isLoading: boolean;
  /** Initial loading failures are visible instead of becoming unhandled rejections. */
  error: string | null;
  categoryName: (id: string) => string;
  addExpense: (e: NewExpense) => Promise<void>;
  updateExpense: (id: string, e: NewExpense) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  addCategory: (name: string) => Promise<void>;
  renameCategory: (id: string, name: string) => Promise<void>;
  setCategoryActive: (id: string, isActive: boolean) => Promise<void>;
  addPayment: (input: NewPayment) => Promise<void>;
  removePayment: (id: string) => Promise<void>;
  markPaymentPaid: (id: string) => Promise<void>;
  setCategoryBudget: (categoryId: string, amount: number) => Promise<void>;
  createBackup: (password: string) => Promise<string>;
  restoreBackup: (data: string, password: string) => Promise<void>;
  /** Re-reads persisted data, e.g. after a `storage` event from another tab. */
  reload: () => Promise<void>;
  updateProfile: (p: Profile) => Promise<void>;
  updateAvatar: (avatar: string | null) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function useMoney(): (amount: number) => string {
  const { user } = useApp();
  return useCallback((amount: number) => formatMoney(amount, user.currency), [user.currency]);
}

interface AppProviderProps {
  auth: AuthService;
  storage: KeyValueStorage;
  randomBytes: RandomBytes;
  user: Account;
  onLogout: () => void;
  children: ReactNode;
}

export function AppProvider({ auth, storage, randomBytes, user: initialUser, onLogout, children }: AppProviderProps) {
  const [user, setUser] = useState(initialUser);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dataSvc = useMemo(() => createAppDataService(auth, storage, randomBytes, user.id), [auth, storage, randomBytes, user.id]);

  const refresh = useCallback(async () => {
    const data = await dataSvc.list();
    setExpenses(data.expenses);
    setCategories(data.categories);
    setPayments(data.payments);
    setCategoryBudgets(data.categoryBudgets);
    setError(null);
  }, [dataSvc]);

  useEffect(() => {
    setIsLoading(true);
    refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsLoading(false));
  }, [refresh]);

  const value: AppContextValue = {
    user,
    expenses,
    categories,
    payments,
    categoryBudgets,
    activeCategories: categories.filter((c) => c.status === 'active'),
    isLoading,
    error,
    categoryName: (id) => categories.find((c) => c.id === id)?.name ?? id,
    addExpense: async (e) => { await dataSvc.addExpense(e); await refresh(); },
    updateExpense: async (id, e) => { await dataSvc.updateExpense(id, e); await refresh(); },
    removeExpense: async (id) => { await dataSvc.removeExpense(id); await refresh(); },
    addCategory: async (name) => { await dataSvc.addCategory(name); await refresh(); },
    renameCategory: async (id, name) => { await dataSvc.renameCategory(id, name); await refresh(); },
    setCategoryActive: async (id, isActive) => { await dataSvc.setCategoryActive(id, isActive); await refresh(); },
    addPayment: async (input) => { await dataSvc.addPayment(input); await refresh(); },
    removePayment: async (id) => { await dataSvc.removePayment(id); await refresh(); },
    markPaymentPaid: async (id) => {
      const payment = payments.find((p) => p.id === id);
      if (!payment) throw new Error('Payment not found');
      await dataSvc.markPaymentPaid(id, payment.dueDate);
      await refresh();
    },
    setCategoryBudget: async (id, amount) => { await dataSvc.setCategoryBudget(id, amount); await refresh(); },
    createBackup: (password) => dataSvc.createBackup(password),
    restoreBackup: async (data, password) => { setUser(await dataSvc.restoreBackup(data, password)); await refresh(); },
    reload: async () => {
      try {
        const { account } = await auth.readAccountData(user.id);
        setUser(account);
        await refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
        throw reason;
      }
    },
    updateProfile: async (p) => setUser(await dataSvc.updateProfile(p)),
    updateAvatar: async (avatar) => setUser(await dataSvc.updateAvatar(avatar)),
    changePassword: (current, next) => dataSvc.changePassword(current, next),
    logout: async () => { await auth.logout(); onLogout(); },
  };

  return createElement(AppContext.Provider, { value }, children);
}
