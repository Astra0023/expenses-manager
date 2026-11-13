import { bytesToHex } from '@noble/hashes/utils';
import { UncertainWriteError, validateAvatar, validateProfile, type AuthService } from './auth';
import { decryptBackup, encryptBackup } from './backup';
import { todayISO, validateExpense } from './expenses';
import { nextPaymentDate, validatePayment } from './payments';
import {
  DEFAULT_CATEGORY_NAMES,
  DEFAULT_CURRENCY,
  type Account, type Category, type Expense, type KeyValueStorage, type NewExpense,
  type NewPayment, type Payment, type Profile, type RandomBytes,
} from './types';

export interface AppData {
  version: 1;
  expenses: Expense[];
  categories: Category[];
  payments: Payment[];
  categoryBudgets: Record<string, number>;
  /** Original calendar day, retained across February and other short months. */
  paymentAnchors: Record<string, number>;
}

type PersonalProfile = Profile & { avatar?: string };

const paymentActionsByStorage = new WeakMap<KeyValueStorage, Set<string>>();

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid data object');
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${label}`);
  return value;
}

function uniqueIds<T extends { id: string }>(list: T[]): T[] {
  const ids = new Set<string>();
  for (const item of list) {
    text(item.id, 'id');
    if (ids.has(item.id)) throw new Error('Duplicate id');
    ids.add(item.id);
  }
  return list;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid data list');
  return value;
}

/** Fully validates and whitelists imported/persisted data before any write. */
export function validateAppData(value: unknown): AppData {
  const data = object(value);
  if (data.version !== 1) throw new Error('Unsupported app data version');
  const categories = uniqueIds(array(data.categories).map((value): Category => {
    const c = object(value);
    if (c.status !== 'active' && c.status !== 'inactive') throw new Error('Invalid category status');
    return { id: text(c.id, 'category id'), name: text(c.name, 'category name'), status: c.status };
  }));
  if (new Set(categories.map((c) => c.name.trim().toLowerCase())).size !== categories.length) throw new Error('Duplicate category name');
  const ids = new Set(categories.map((c) => c.id));
  const category = (id: string) => {
    if (!ids.has(id)) throw new Error('Category not found');
  };
  const expenses = uniqueIds(array(data.expenses).map((value): Expense => {
    const e = object(value);
    const expense = { id: text(e.id, 'expense id'), amount: e.amount as number, date: e.date as string, note: e.note as string, categoryId: e.categoryId as string };
    validateExpense(expense);
    category(expense.categoryId);
    return expense;
  }));
  const payments = uniqueIds(array(data.payments).map((value): Payment => {
    const p = object(value);
    const payment: Payment = {
      id: text(p.id, 'payment id'), title: p.title as string, amount: p.amount as number,
      categoryId: p.categoryId as string, dueDate: p.dueDate as string,
      recurrence: p.recurrence as Payment['recurrence'], reminderDays: p.reminderDays as number,
    };
    validatePayment(payment);
    category(payment.categoryId);
    return payment;
  }));
  const categoryBudgets = Object.fromEntries(Object.entries(object(data.categoryBudgets)).map(([id, amount]) => {
    category(id);
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) throw new Error('Invalid category budget');
    return [id, amount];
  }));
  const anchors = object(data.paymentAnchors);
  const recurring = payments.filter((p) => p.recurrence !== 'none');
  if (Object.keys(anchors).length !== recurring.length) throw new Error('Invalid recurrence anchors');
  const paymentAnchors = Object.fromEntries(recurring.map((p) => {
    const day = anchors[p.id];
    if (!Object.prototype.hasOwnProperty.call(anchors, p.id) || typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 31) {
      throw new Error('Invalid recurrence anchor');
    }
    const date = new Date(`${p.dueDate}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1, 0);
    if (Math.min(day, date.getUTCDate()) !== Number(p.dueDate.slice(8))) throw new Error('Inconsistent recurrence anchor');
    return [p.id, day];
  }));
  return { version: 1, expenses, categories, payments, categoryBudgets, paymentAnchors };
}

function personal(value: unknown): PersonalProfile {
  const p = object(value);
  const profile: PersonalProfile = {
    firstName: p.firstName as string, lastName: p.lastName as string,
    currency: (p.currency ?? DEFAULT_CURRENCY) as PersonalProfile['currency'],
    monthlyIncome: p.monthlyIncome as number, taxRate: p.taxRate as number, savingsRate: p.savingsRate as number,
    ...(p.avatar !== undefined ? { avatar: p.avatar as string } : {}),
  };
  validateProfile(profile);
  validateAvatar(profile.avatar);
  return profile;
}

/**
 * All provider data shares one encrypted account record. Every mutation is a read-modify-write
 * under the auth service's account lock (cross-tab with navigatorLocks()), committed by a single
 * setItem: a settlement (expense + schedule) or restore (profile + all data) has no partial state.
 * Storage adapters must make replacement of one value atomic.
 */
export function createAppDataService(auth: AuthService, storage: KeyValueStorage, randomBytes: RandomBytes, userId: string, paymentDate = todayISO) {
  const legacy = auth.encryptedStorage(storage);
  let paymentActions = paymentActionsByStorage.get(storage);
  if (!paymentActions) {
    paymentActions = new Set<string>();
    paymentActionsByStorage.set(storage, paymentActions);
  }
  const actions = paymentActions;
  let uncertain = false;

  async function fromStored(saved: unknown): Promise<AppData> {
    if (saved !== undefined) return validateAppData(saved);
    const [rawExpenses, rawCategories] = await Promise.all([
      legacy.getItem(`me:expenses:${userId}`), legacy.getItem(`me:categories:${userId}`),
    ]);
    const expenses = rawExpenses ? array(JSON.parse(rawExpenses)).map((value) => {
      const e = object(value);
      return { ...e, categoryId: e.categoryId ?? e.category ?? 'Other' };
    }) : [];
    return validateAppData({
      version: 1, expenses,
      categories: rawCategories ? JSON.parse(rawCategories) : DEFAULT_CATEGORY_NAMES.map((name) => ({ id: name, name, status: 'active' })),
      payments: [], categoryBudgets: {}, paymentAnchors: {},
    });
  }

  async function load(): Promise<AppData> {
    return fromStored((await auth.readAccountData(userId)).appData);
  }

  /** Runs `work` on the latest persisted state inside the account lock; one write or none. */
  async function commit(update: Parameters<AuthService['updateAppData']>[1]): Promise<Account> {
    if (uncertain) throw new UncertainWriteError();
    try {
      return await auth.updateAppData(userId, update);
    } catch (reason) {
      if (reason instanceof UncertainWriteError) uncertain = true;
      throw reason;
    }
  }

  async function mutate(work: (data: AppData) => void): Promise<void> {
    await commit(async ({ appData }) => {
      const data = await fromStored(appData);
      work(data);
      return { appData: validateAppData(data) };
    });
  }

  function guarded(id: string, work: () => Promise<void>): Promise<void> {
    const actionId = `${userId}:${id}`;
    if (actions.has(actionId)) return Promise.reject(new Error('Payment action already in progress'));
    actions.add(actionId);
    return work().finally(() => actions.delete(actionId));
  }

  function newId(list: { id: string }[]): string {
    for (let attempt = 0; attempt < 10; attempt++) {
      const id = bytesToHex(randomBytes(16));
      if (!list.some((item) => item.id === id)) return id;
    }
    throw new Error('Unable to generate a unique id');
  }

  function existing<T extends { id: string }>(list: T[], id: string): T {
    const found = list.find((item) => item.id === id);
    if (!found) throw new Error('Item not found');
    return found;
  }

  function validCategory(data: AppData, id: string): void {
    if (!data.categories.some((c) => c.id === id)) throw new Error('Category not found');
  }

  return {
    list: load,
    addExpense: (input: NewExpense) => mutate((data) => {
      validateExpense(input); validCategory(data, input.categoryId);
      data.expenses.push({ ...input, id: newId(data.expenses) });
    }),
    updateExpense: (id: string, input: NewExpense) => mutate((data) => {
      validateExpense(input); validCategory(data, input.categoryId);
      Object.assign(existing(data.expenses, id), input, { id });
    }),
    removeExpense: (id: string) => mutate((data) => {
      data.expenses = data.expenses.filter((e) => e.id !== id);
    }),
    addCategory: (name: string) => mutate((data) => {
      data.categories.push({ id: newId(data.categories), name: text(name, 'category name').trim(), status: 'active' });
    }),
    renameCategory: (id: string, name: string) => mutate((data) => {
      existing(data.categories, id).name = text(name, 'category name').trim();
    }),
    setCategoryActive: (id: string, active: boolean) => mutate((data) => {
      existing(data.categories, id).status = active ? 'active' : 'inactive';
    }),
    addPayment: (input: NewPayment) => mutate((data) => {
      validatePayment(input); validCategory(data, input.categoryId);
      const payment = { ...input, title: input.title.trim(), id: newId(data.payments) };
      data.payments.push(payment);
      if (payment.recurrence !== 'none') data.paymentAnchors = { ...data.paymentAnchors, [payment.id]: Number(payment.dueDate.slice(8)) };
    }),
    removePayment: (id: string) => guarded(id, () => mutate((data) => {
      existing(data.payments, id);
      data.payments = data.payments.filter((p) => p.id !== id);
      delete data.paymentAnchors[id];
    })),
    /**
     * Pass `expectedDueDate` (AppProvider always does): the check runs inside the account lock,
     * so a repeat from another tab/instance for the same cycle is rejected instead of charged twice.
     */
    markPaymentPaid: (id: string, expectedDueDate?: string) => guarded(id, () => mutate((data) => {
        const payment = existing(data.payments, id);
        if (expectedDueDate !== undefined && payment.dueDate !== expectedDueDate) throw new Error('Payment already changed. Refresh before retrying.');
        // Compute/validate the next date before any persistence, including year overflow.
        const next = payment.recurrence === 'none' ? null : nextPaymentDate(payment, data.paymentAnchors[id]);
        data.expenses.push({
          id: newId(data.expenses), amount: payment.amount, categoryId: payment.categoryId,
          note: payment.title, date: paymentDate(),
        });
        if (next) payment.dueDate = next;
        else data.payments = data.payments.filter((p) => p.id !== id);
    })),
    setCategoryBudget: (id: string, amount: number) => mutate((data) => {
      validCategory(data, id);
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Budget must be 0 or more');
      if (amount === 0) delete data.categoryBudgets[id];
      else data.categoryBudgets = { ...data.categoryBudgets, [id]: amount };
    }),
    updateProfile: (profile: Profile) => auth.updateProfile(userId, personal(profile)),
    updateAvatar: (avatar: string | null) => auth.updateAvatar(userId, avatar),
    changePassword: (current: string, next: string) => auth.changePassword(userId, current, next),
    async createBackup(password: string): Promise<string> {
      // One read gives a consistent profile + data snapshot even while other tabs write.
      const { account, appData } = await auth.readAccountData(userId);
      const data = await fromStored(appData);
      return encryptBackup({ version: 1, profile: personal(account), data }, password, randomBytes);
    },
    async restoreBackup(backup: string, password: string): Promise<Account> {
      // Decrypt and validate fully before taking the lock or touching storage.
      const decoded = object(decryptBackup(backup, password));
      if (decoded.version !== 1) throw new Error('Unsupported backup data version');
      const profile = personal(decoded.profile);
      const data = validateAppData(decoded.data);
      return commit(() => ({ appData: data, profile }));
    },
  };
}

export type AppDataService = ReturnType<typeof createAppDataService>;
