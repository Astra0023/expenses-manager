import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildInsights,
  buildReport,
  buildReportWorkbook,
  bytesToBase64,
  summarizeReport,
  computeBudget,
  createAuthService,
  createCategoryService,
  createExpenseService,
  filterExpenses,
  formatMoney,
  monthRange,
  reportMonthLabel,
  SESSION_DURATION_MS,
  type KeyValueStorage,
  type PersistedSession,
  type SessionStorage,
} from './index';

const memory = (): KeyValueStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
};
let n = 0;
const rnd = (len: number) => Uint8Array.from({ length: len }, () => ++n % 256);
const reg = { firstName: 'Ann', lastName: 'Lee', username: 'ann', password: 'secret-pass' };

describe('auth & profile', () => {
  it('hashes passwords, verifies login, updates profile and password', async () => {
    const s = memory();
    const auth = createAuthService(s, rnd);
    const acc = await auth.register(reg);
    expect(s.data.get('me:accounts')).not.toContain('secret-pass');
    await expect(auth.login('ann', 'wrong-pass')).rejects.toThrow();
    await expect(auth.register({ ...reg, username: 'ANN' })).rejects.toThrow('exists');

    expect(acc.currency).toBe('USD');
    const updated = await auth.updateProfile(acc.id, { firstName: 'Anna', lastName: 'Lee', currency: 'EUR', monthlyIncome: 3000, taxRate: 20, savingsRate: 10 });
    expect(updated.monthlyIncome).toBe(3000);
    expect(updated.currency).toBe('EUR');
    await expect(auth.updateProfile(acc.id, { ...updated, taxRate: 120 })).rejects.toThrow('Tax rate');

    await expect(auth.changePassword(acc.id, 'nope-nope', 'new-password')).rejects.toThrow('incorrect');
    await auth.changePassword(acc.id, 'secret-pass', 'new-password');
    await expect(auth.login('ann', 'secret-pass')).rejects.toThrow();
    expect((await auth.login('ann', 'new-password')).firstName).toBe('Anna');
    expect((await auth.login('ann', 'new-password')).currency).toBe('EUR');

    const png = 'data:image/png;base64,AAAA';
    expect((await auth.updateAvatar(acc.id, png)).avatar).toBe(png);
    await expect(auth.updateAvatar(acc.id, 'data:text/html;base64,AAAA')).rejects.toThrow('Unsupported');
    expect((await auth.updateAvatar(acc.id, null)).avatar).toBeUndefined();
  });
});

describe('budget', () => {
  it('computes tax, net, savings and spend limit', () => {
    expect(computeBudget({ monthlyIncome: 1000, taxRate: 20, savingsRate: 25 })).toEqual({
      gross: 1000, tax: 200, net: 800, savings: 200, spendLimit: 600,
    });
  });
});

describe('categories', () => {
  it('seeds defaults, edits, soft-deletes and rejects duplicates', async () => {
    const svc = createCategoryService(memory(), rnd, 'u1');
    expect((await svc.list()).length).toBeGreaterThan(0);
    const c = await svc.add('Pets');
    await expect(svc.add('pets')).rejects.toThrow('exists');
    await svc.update(c.id, 'Pet care');
    await svc.setStatus(c.id, 'inactive');
    const found = (await svc.list()).find((x) => x.id === c.id);
    expect(found).toMatchObject({ name: 'Pet care', status: 'inactive' });
  });
});

describe('expenses & reports', () => {
  it('edits, filters and builds monthly/quarterly/yearly reports', async () => {
    const s = memory();
    const svc = createExpenseService(s, rnd, 'u1');
    await svc.add({ amount: 10, categoryId: 'Food', note: '', date: '2026-10-05' });
    const t = await svc.add({ amount: 20, categoryId: 'Transport', note: '', date: '2026-10-31' });
    await svc.add({ amount: 5, categoryId: 'Food', note: '', date: '2026-11-01' });
    await svc.add({ amount: 7, categoryId: 'Food', note: '', date: '2025-02-01' });
    await svc.update(t.id, { amount: 25, categoryId: 'Transport', note: 'bus', date: '2026-10-31' });
    await expect(svc.add({ amount: -1, categoryId: 'Food', note: '', date: '2026-10-05' })).rejects.toThrow();

    const all = await svc.list();
    const { from, to } = monthRange('2026-10');
    expect(filterExpenses(all, { from, to })).toHaveLength(2);
    expect(filterExpenses(all, { from, to, categoryId: 'Food' })).toHaveLength(1);

    expect(buildReport(all, { period: 'monthly', year: '2026' }).map((r) => [r.key, r.total])).toEqual([['2026-11', 5], ['2026-10', 35]]);
    expect(buildReport(all, { period: 'quarterly' }).map((r) => [r.key, r.total])).toEqual([['2026-Q4', 40], ['2025-Q1', 7]]);
    const annualComparison = buildReport(all, { period: 'yearly', year: '2026', categoryId: 'Food' }, new Date(2027, 0, 1));
    expect(annualComparison).toHaveLength(12);
    expect(annualComparison.slice(0, 2).map((r) => [r.key, r.total])).toEqual([['2026-12', 0], ['2026-11', 5]]);
    expect(annualComparison.find((r) => r.key === '2026-10')).toMatchObject({ total: 10, count: 1 });
    expect(annualComparison.reduce((total, row) => total + row.total, 0)).toBe(15);
    expect(summarizeReport(annualComparison)).toMatchObject({ total: 15, count: 2, average: 1.25 });
    expect(summarizeReport(annualComparison).highest?.key).toBe('2026-10');
    expect(buildReport(all, { period: 'yearly', year: '2025' }).filter((r) => r.total > 0).map((r) => [r.key, r.total])).toEqual([['2025-02', 7]]);
  });

  it('compares elapsed months including zeroes and excludes future months from the report and export', () => {
    const now = new Date(2026, 2, 15);
    const expenses = [
      { id: '1', amount: 10, categoryId: 'Food', note: 'January', date: '2026-01-05' },
      { id: '2', amount: 20, categoryId: 'Food', note: 'Current month', date: '2026-03-30' },
      { id: '3', amount: 30, categoryId: 'Food', note: 'Future month', date: '2026-04-01' },
      { id: '4', amount: 40, categoryId: 'Food', note: 'Future year', date: '2027-01-01' },
    ];
    const options = { period: 'yearly' as const, year: '2026' };
    const rows = buildReport(expenses, options, now);
    expect(rows.map((r) => [r.key, r.total, r.count])).toEqual([
      ['2026-03', 20, 1], ['2026-02', 0, 0], ['2026-01', 10, 1],
    ]);
    expect(summarizeReport(rows)).toMatchObject({ total: 30, count: 2, average: 10 });
    expect(buildReport([], options, now).map((r) => r.total)).toEqual([0, 0, 0]);
    expect(buildReport(expenses, { ...options, categoryId: 'Transport' }, now).map((r) => r.total)).toEqual([0, 0, 0]);
    expect(buildReport([], options, new Date(2026, 0, 1))).toHaveLength(1);
    expect(buildReport([], options, new Date(2026, 11, 1))).toHaveLength(12);
    expect(buildReport(expenses, { ...options, year: '2025' }, now)).toHaveLength(12);
    expect(buildReport(expenses, { ...options, year: '2027' }, now)).toEqual([]);
    expect(buildReport(expenses, { period: 'monthly', year: '2026' }, now).some((r) => r.key === '2026-04')).toBe(true);

    const files = unzipSync(buildReportWorkbook(expenses, [], options, now));
    const summary = strFromU8(files['xl/worksheets/sheet1.xml']);
    const details = strFromU8(files['xl/worksheets/sheet2.xml']);
    expect(summary).toContain('2026-02');
    expect(summary).not.toContain('2026-04');
    expect(details).toContain('Current month');
    expect(details).not.toContain('Future month');
    expect(details).not.toContain('Future year');
  });

  it('formats yearly chart month labels', () => {
    expect(reportMonthLabel('2026-01')).toBe(new Date(2000, 0, 1).toLocaleString(undefined, { month: 'short' }));
    expect(reportMonthLabel('2026-12')).toBe(new Date(2000, 11, 1).toLocaleString(undefined, { month: 'short' }));
    expect(reportMonthLabel('2026-13')).toBe('2026-13');
  });

  it('reads legacy expenses that stored a category name', async () => {
    const s = memory();
    s.data.set('me:expenses:u1', JSON.stringify([{ id: 'a', amount: 1, category: 'Food', note: '', date: '2026-01-01' }]));
    expect((await createExpenseService(s, rnd, 'u1').list())[0].categoryId).toBe('Food');
  });

  it('summarizes a report and exports a valid xlsx', () => {
    const expenses = [
      { id: '1', amount: 10, categoryId: 'Food', note: '=1+1 & <b>', date: '2026-10-05' },
      { id: '2', amount: 30, categoryId: 'Transport', note: '', date: '2026-11-05' },
    ];
    const rows = buildReport(expenses, { period: 'monthly' });
    const s = summarizeReport(rows);
    expect(s).toMatchObject({ total: 40, count: 2, average: 20 });
    expect(s.highest?.key).toBe('2026-11');
    expect(s.categories[0]).toMatchObject({ id: 'Transport', percent: 75 });

    const files = unzipSync(buildReportWorkbook(expenses, [{ id: 'Food', name: 'Food', status: 'active' }], { period: 'monthly' }));
    expect(Object.keys(files)).toContain('xl/worksheets/sheet2.xml');
    const details = strFromU8(files['xl/worksheets/sheet2.xml']);
    expect(details).toContain('=1+1 &amp; &lt;b&gt;');
    expect(details).toContain('t="inlineStr"');
    expect(bytesToBase64(new Uint8Array([77, 97, 110, 1]))).toBe(btoa('Man\x01'));
  });

  it('produces an over-budget insight', () => {
    const profile = { firstName: 'A', lastName: 'B', currency: 'USD' as const, monthlyIncome: 100, taxRate: 0, savingsRate: 0 };
    const insights = buildInsights([{ id: '1', amount: 150, categoryId: 'Food', note: '', date: '2026-11-02' }], [], profile, '2026-11');
    expect(insights[0].level).toBe('danger');
  });
});

describe('encryption at rest', () => {
  it('restores a shared web session, enforces expiry, and logs out other tabs', async () => {
    const storage = memory();
    let saved: PersistedSession | null = null;
    const sessions: SessionStorage = {
      read: () => saved,
      write: (value) => { saved = value; },
      clear: () => { saved = null; },
    };
    const first = createAuthService(storage, rnd, sessions);
    const before = Date.now();
    const account = await first.register(reg);
    expect(first.sessionExpiresAt()).toBeGreaterThanOrEqual(before + SESSION_DURATION_MS);
    const secure = first.encryptedStorage(storage);
    await secure.setItem('test', 'private');
    const second = createAuthService(storage, rnd, sessions);
    expect((await second.currentUser())?.id).toBe(account.id);
    expect(await second.encryptedStorage(storage).getItem('test')).toBe('private');
    await second.logout();
    expect(await first.currentUser()).toBeNull();
    expect(() => secure.getItem('test')).toThrow('Session expired');

    await first.login('ann', 'secret-pass');
    expect(saved).not.toBeNull();
    sessions.write({ ...sessions.read()!, expiresAt: Date.now() - 1 });
    expect(await first.currentUser()).toBeNull();
    expect(sessions.read()).toBeNull();
    expect(await createAuthService(storage, rnd, sessions).currentUser()).toBeNull();
  });

  it('keeps the default in-memory session locked after recreation', async () => {
    const storage = memory();
    await createAuthService(storage, rnd).register(reg);
    expect(await createAuthService(storage, rnd).currentUser()).toBeNull();
  });

  it('keeps expenses and profile unreadable in storage and locks after logout', async () => {
    const s = memory();
    const auth = createAuthService(s, rnd);
    const acc = await auth.register(reg);
    await auth.updateProfile(acc.id, { firstName: 'Zed', lastName: 'Lee', currency: 'USD', monthlyIncome: 4321, taxRate: 0, savingsRate: 0 });
    const exp = createExpenseService(auth.encryptedStorage(s), rnd, acc.id);
    await exp.add({ amount: 77.7, categoryId: 'Food', note: 'secret lunch', date: '2026-01-01' });

    const dump = [...s.data.values()].join('|');
    for (const leak of ['secret lunch', 'Zed', 'Food', 'Lee']) expect(dump).not.toContain(leak);

    await auth.logout();
    expect(await auth.currentUser()).toBeNull();
    await expect(auth.updateProfile(acc.id, acc as never)).rejects.toThrow('Session expired');
    const again = await auth.login('ann', 'secret-pass');
    expect(again.firstName).toBe('Zed');
    expect(await createExpenseService(auth.encryptedStorage(s), rnd, acc.id).list()).toHaveLength(1);
  });

  describe('currency formatting', () => {
    it('formats amounts with the selected currency and rejects unsupported currencies', () => {
      expect(formatMoney(1234.5, 'EUR')).toBe(new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(1234.5));
      expect(() => formatMoney(10, 'XXX' as never)).toThrow('Unsupported currency');
    });
  });

  it('encrypts data from plain-text accounts on first login', async () => {
    const s = memory();
    const first = createAuthService(s, rnd);
    const acc = await first.register(reg);
    await first.logout();
    // rewrite as an old-format account with plain data
    const stored = JSON.parse(s.data.get('me:accounts')!)[0];
    s.data.set('me:accounts', JSON.stringify([{ id: stored.id, username: 'ann', salt: stored.salt, hash: stored.hash, iterations: stored.iterations, firstName: 'Old', lastName: 'User', monthlyIncome: 98765, taxRate: 5, savingsRate: 20 }]));
    s.data.set(`me:expenses:${acc.id}`, JSON.stringify([{ id: 'a', amount: 12345, categoryId: 'Food', note: 'plain note', date: '2026-01-01' }]));

    const auth = createAuthService(s, rnd);
    expect((await auth.login('ann', 'secret-pass')).firstName).toBe('Old');
    expect([...s.data.values()].join('|')).not.toMatch(/plain note|Old|User/);
    expect(await createExpenseService(auth.encryptedStorage(s), rnd, acc.id).list()).toHaveLength(1);
  });
});