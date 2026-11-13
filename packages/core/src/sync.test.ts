import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAppDataService, createAuthService, inProcessLock, navigatorLocks,
  type AccountLock, type KeyValueStorage, type NewPayment,
} from './index';

function random(seed: number) {
  let state = seed;
  return (length: number) => Uint8Array.from({ length }, () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return state & 255;
  });
}

/** One shared backing store; each "tab" gets its own adapter object that yields between operations. */
function sharedBacking() {
  const data = new Map<string, string>();
  const tab = (): KeyValueStorage => ({
    async getItem(k) { await new Promise((r) => setTimeout(r, 1)); return data.get(k) ?? null; },
    async setItem(k, v) { await new Promise((r) => setTimeout(r, 1)); data.set(k, v); },
    async removeItem(k) { data.delete(k); },
  });
  return { data, tab };
}

/** Stand-in for navigator.locks: exclusive across every tab sharing it. */
function crossContextLock(): AccountLock & { active: number; maxActive: number } {
  let queue: Promise<unknown> = Promise.resolve();
  const lock = {
    scope: 'cross-context' as const, active: 0, maxActive: 0,
    run<T>(_name: string, work: () => Promise<T>): Promise<T> {
      const result = queue.then(async () => {
        lock.active++; lock.maxActive = Math.max(lock.maxActive, lock.active);
        try { return await work(); } finally { lock.active--; }
      });
      queue = result.catch(() => undefined);
      return result;
    },
  };
  return lock;
}

const reg = { firstName: 'Ann', lastName: 'Lee', username: 'ann', password: 'account-password' };
const payment: NewPayment = { title: 'Rent', amount: 100, categoryId: 'Housing', dueDate: '2026-01-31', recurrence: 'monthly', reminderDays: 1 };

async function twoTabs(lock?: AccountLock) {
  const backing = sharedBacking();
  const s1 = backing.tab(), s2 = backing.tab();
  const r1 = random(11), r2 = random(97);
  const auth1 = createAuthService(s1, r1, undefined, { lock: lock ?? inProcessLock(s1) });
  const user = await auth1.register(reg);
  const auth2 = createAuthService(s2, r2, undefined, { lock: lock ?? inProcessLock(s2) });
  await auth2.login('ann', reg.password);
  return {
    ...backing, user, auth1, auth2,
    tab1: createAppDataService(auth1, s1, r1, user.id, () => '2026-11-13'),
    tab2: createAppDataService(auth2, s2, r2, user.id, () => '2026-11-13'),
  };
}

const expense = (amount: number) => ({ amount, categoryId: 'Food', note: String(amount), date: '2026-11-13' });

afterEach(() => vi.unstubAllGlobals());

describe('cross-tab account lock', () => {
  it('demonstrates the lost-update hazard when tabs only have in-process locks', async () => {
    const { tab1, tab2 } = await twoTabs();
    await Promise.all([tab1.addExpense(expense(1)), tab2.addExpense(expense(2))]);
    expect((await tab1.list()).expenses.length).toBeLessThan(2);
  });

  it('preserves concurrent expense writes from separate tabs', async () => {
    const lock = crossContextLock();
    const { tab1, tab2 } = await twoTabs(lock);
    await Promise.all([1, 2, 3, 4, 5, 6].map((n) => (n % 2 ? tab1 : tab2).addExpense(expense(n))));
    expect((await tab2.list()).expenses.map((e) => e.amount).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(lock.maxActive).toBe(1);
  });

  it('serializes profile, avatar and password writes with data writes across tabs', async () => {
    const { tab1, tab2, auth1, user } = await twoTabs(crossContextLock());
    await Promise.all([
      tab1.updateProfile({ ...user, firstName: 'Anna', monthlyIncome: 4000 }),
      tab2.addExpense(expense(7)),
      tab2.updateAvatar('data:image/png;base64,AAAA'),
      tab1.setCategoryBudget('Food', 50),
      tab2.changePassword(reg.password, 'second-password'),
      tab1.addPayment(payment),
    ]);
    const data = await tab1.list();
    expect(data.expenses).toHaveLength(1);
    expect(data.categoryBudgets).toEqual({ Food: 50 });
    expect(data.payments).toHaveLength(1);
    const { account } = await auth1.readAccountData(user.id);
    expect(account).toMatchObject({ firstName: 'Anna', monthlyIncome: 4000, avatar: 'data:image/png;base64,AAAA' });
    await expect(auth1.login('ann', reg.password)).rejects.toThrow();
    expect(await auth1.login('ann', 'second-password')).toMatchObject({ firstName: 'Anna' });
  });

  it('charges a payment cycle once when two tabs mark it paid at the same time', async () => {
    const { tab1, tab2 } = await twoTabs(crossContextLock());
    await tab1.addPayment(payment);
    const p = (await tab1.list()).payments[0];
    const results = await Promise.allSettled([tab1.markPaymentPaid(p.id, p.dueDate), tab2.markPaymentPaid(p.id, p.dueDate)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: expect.objectContaining({ message: expect.stringContaining('already changed') }) });
    const data = await tab2.list();
    expect(data.expenses).toHaveLength(1);
    expect(data.payments[0].dueDate).toBe('2026-02-28');
  });

  it('a restore in one tab is not overwritten by a concurrent write from another tab', async () => {
    const { tab1, tab2 } = await twoTabs(crossContextLock());
    await tab1.addExpense(expense(1));
    const backup = await tab1.createBackup('backup-password');
    await tab1.addExpense(expense(2));
    await Promise.all([tab1.restoreBackup(backup, 'backup-password'), tab2.addExpense(expense(3))]);
    const amounts = (await tab1.list()).expenses.map((e) => e.amount).sort();
    // Whichever ran last wins atomically; never a mix that drops the restore partially.
    expect([[1], [1, 3]]).toContainEqual(amounts);
  });

  it('registers unique usernames across tabs', async () => {
    const backing = sharedBacking();
    const lock = crossContextLock();
    const a = createAuthService(backing.tab(), random(3), undefined, { lock });
    const b = createAuthService(backing.tab(), random(4), undefined, { lock });
    const results = await Promise.allSettled([a.register(reg), b.register({ ...reg, username: 'ANN' }), b.register({ ...reg, username: 'bob' })]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(JSON.parse(backing.data.get('me:accounts')!)).toHaveLength(2);
  });

  it('releases the lock after failures so later writes proceed', async () => {
    const { tab1, tab2 } = await twoTabs(crossContextLock());
    await expect(tab1.addExpense({ ...expense(1), date: 'bad' })).rejects.toThrow();
    await expect(tab2.changePassword('wrong-password', 'another-password')).rejects.toThrow('incorrect');
    await tab2.addExpense(expense(2));
    expect((await tab1.list()).expenses).toHaveLength(1);
  });
});

describe('navigatorLocks', () => {
  it('returns null and reports in-process scope when the Web Locks API is unavailable', () => {
    vi.stubGlobal('navigator', {});
    expect(navigatorLocks()).toBeNull();
    expect(createAuthService(sharedBacking().tab(), random(1)).lockScope).toBe('in-process');
  });

  it('uses navigator.locks.request with an exclusive named lock', async () => {
    const request = vi.fn((_name: string, _options: object, callback: () => Promise<unknown>) => callback());
    vi.stubGlobal('navigator', { locks: { request } });
    const lock = navigatorLocks()!;
    expect(lock.scope).toBe('cross-context');
    const auth = createAuthService(sharedBacking().tab(), random(2), undefined, { lock });
    expect(auth.lockScope).toBe('cross-context');
    await auth.register(reg);
    expect(request).toHaveBeenCalledWith('manage-expenses:accounts', { mode: 'exclusive' }, expect.any(Function));
  });
});
