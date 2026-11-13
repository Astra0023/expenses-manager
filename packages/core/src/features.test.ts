import { describe, expect, it } from 'vitest';
import {
  categoryBudgetAlerts, createAppDataService, createAuthService, decryptBackup, encryptBackup,
  isValidISODate, nextPaymentDate, paymentStatus, validateAppData,
  type KeyValueStorage, type NewPayment, type Payment,
} from './index';

function memory() {
  const data = new Map<string, string>();
  const failure = { before: false, after: false, unreadable: false };
  const storage: KeyValueStorage = {
    async getItem(key) {
      if (failure.unreadable) throw new Error('Read failed');
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      if (failure.before) throw new Error('Write failed');
      data.set(key, value);
      if (failure.after) throw new Error('Acknowledgement failed');
    },
    async removeItem(key) { data.delete(key); },
  };
  return { data, failure, storage };
}

function random() {
  let state = 123456;
  return (length: number) => Uint8Array.from({ length }, () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return state & 255;
  });
}

const registration = { firstName: 'Ann', lastName: 'Lee', username: 'ann', password: 'account-password' };
const password = 'backup-password';
const payment: NewPayment = {
  title: 'Rent', amount: 100, categoryId: 'Housing', dueDate: '2024-01-31',
  recurrence: 'monthly', reminderDays: 3,
};

async function setup() {
  const m = memory();
  const rnd = random();
  const auth = createAuthService(m.storage, rnd);
  const user = await auth.register(registration);
  const service = createAppDataService(auth, m.storage, rnd, user.id, () => '2026-11-13');
  return { ...m, rnd, auth, user, service };
}

describe('payment calendar validation and reminders', () => {
  it.each(['2025-02-29', '2024-02-30', '2026-04-31', '0000-01-01', '2026-13-01', '2026-1-01', '2026-01-01T00:00:00Z'])('rejects invalid date %s', (date) => {
    expect(isValidISODate(date)).toBe(false);
  });

  it('accepts leap dates and handles dates before year 100 without JS date coercion', () => {
    expect(isValidISODate('2024-02-29')).toBe(true);
    expect(nextPaymentDate({ ...payment, id: 'p', dueDate: '0099-01-31' })).toBe('0099-02-28');
  });

  it('restores the original monthly/yearly calendar day after clamping', () => {
    const monthly: Payment = { ...payment, id: 'p' };
    expect(nextPaymentDate(monthly)).toBe('2024-02-29');
    expect(nextPaymentDate({ ...monthly, dueDate: '2024-02-29' }, 31)).toBe('2024-03-31');
    expect(nextPaymentDate({ ...monthly, dueDate: '2025-12-31' }, 31)).toBe('2026-01-31');
    const annual: Payment = { ...monthly, recurrence: 'yearly', dueDate: '2024-02-29' };
    expect(nextPaymentDate(annual)).toBe('2025-02-28');
    expect(nextPaymentDate({ ...annual, dueDate: '2027-02-28' }, 29)).toBe('2028-02-29');
    expect(() => nextPaymentDate({ ...annual, dueDate: '9999-02-28' })).toThrow('range');
    expect(() => nextPaymentDate({ ...monthly, recurrence: 'none' })).toThrow();
  });

  it('uses reminder lead time and reports overdue separately', () => {
    const p = { ...payment, id: 'p', dueDate: '2026-03-10' };
    expect(paymentStatus(p, '2026-03-06')).toBe('upcoming');
    expect(paymentStatus(p, '2026-03-07')).toBe('due');
    expect(paymentStatus(p, '2026-03-10')).toBe('due');
    expect(paymentStatus(p, '2026-03-11')).toBe('overdue');
    expect(() => paymentStatus(p, 'not-a-date')).toThrow();
  });
});

describe('atomic scheduled payments', () => {
  it('settles exactly one overdue cycle using the actual local payment date, never skips cycles', async () => {
    const { service, auth, storage, rnd, user } = await setup();
    await service.addPayment(payment);
    const id = (await service.list()).payments[0].id;
    await service.markPaymentPaid(id);
    let data = await service.list();
    expect(data.expenses).toHaveLength(1);
    expect(data.expenses[0]).toMatchObject({ amount: 100, categoryId: 'Housing', note: 'Rent', date: '2026-11-13' });
    expect(data.payments[0].dueDate).toBe('2024-02-29');
    const restarted = createAppDataService(auth, storage, rnd, user.id, () => '2026-11-13');
    await restarted.markPaymentPaid(id);
    data = await restarted.list();
    expect(data.expenses).toHaveLength(2);
    expect(data.payments[0].dueDate).toBe('2024-03-31');
  });

  it('records early payments today without changing the recurrence anchor', async () => {
    const { service } = await setup();
    await service.addPayment({ ...payment, dueDate: '2027-01-31' });
    const id = (await service.list()).payments[0].id;
    await service.markPaymentPaid(id);
    expect((await service.list()).expenses[0].date).toBe('2026-11-13');
    expect((await service.list()).payments[0].dueDate).toBe('2027-02-28');
  });

  it('removes one-off payments, rejects repeat settlement and duplicate concurrent actions', async () => {
    const { service } = await setup();
    await service.addPayment({ ...payment, recurrence: 'none' });
    const id = (await service.list()).payments[0].id;
    const results = await Promise.allSettled([service.markPaymentPaid(id), service.markPaymentPaid(id), service.removePayment(id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await service.list()).expenses).toHaveLength(1);
    expect((await service.list()).payments).toEqual([]);
    await expect(service.markPaymentPaid(id)).rejects.toThrow('not found');
  });

  it('rejects stale scheduled-date actions after a recurring payment was already settled', async () => {
    const { service } = await setup();
    await service.addPayment(payment);
    const id = (await service.list()).payments[0].id;
    await service.markPaymentPaid(id, payment.dueDate);
    await expect(service.markPaymentPaid(id, payment.dueDate)).rejects.toThrow('already changed');
    expect((await service.list()).expenses).toHaveLength(1);
  });

  it('leaves both schedule and expense unchanged if the single write fails', async () => {
    const { service, failure } = await setup();
    await service.addPayment(payment);
    const before = await service.list();
    failure.before = true;
    await expect(service.markPaymentPaid(before.payments[0].id)).rejects.toThrow('Write failed');
    failure.before = false;
    expect(await service.list()).toEqual(before);
    await service.markPaymentPaid(before.payments[0].id);
    expect((await service.list()).expenses).toHaveLength(1);
  });

  it('recovers a committed write whose acknowledgement failed, without a second charge', async () => {
    const { service, failure } = await setup();
    await service.addPayment(payment);
    const id = (await service.list()).payments[0].id;
    failure.after = true;
    await service.markPaymentPaid(id, payment.dueDate);
    failure.after = false;
    await expect(service.markPaymentPaid(id, payment.dueDate)).rejects.toThrow('already changed');
    expect((await service.list()).expenses).toHaveLength(1);
    expect((await service.list()).payments[0].dueDate).toBe('2024-02-29');
  });

  it('blocks retries when an interrupted write cannot be confirmed until the account is reloaded', async () => {
    const { service, storage, failure, auth, user, rnd } = await setup();
    await service.addPayment(payment);
    const id = (await service.list()).payments[0].id;
    const original = storage.setItem;
    storage.setItem = async (key, value) => {
      await original(key, value);
      failure.unreadable = true;
      throw new Error('Lost acknowledgement');
    };
    await expect(service.markPaymentPaid(id)).rejects.toThrow('Reload');
    failure.unreadable = false;
    storage.setItem = original;
    await expect(service.markPaymentPaid(id)).rejects.toThrow('Reload');
    const restarted = createAppDataService(auth, storage, rnd, user.id);
    expect((await restarted.list()).expenses).toHaveLength(1);
    expect((await restarted.list()).payments[0].dueDate).toBe('2024-02-29');
  });

  it('serializes independent mutations without lost expenses', async () => {
    const { service } = await setup();
    await Promise.all(Array.from({ length: 10 }, (_, i) => service.addExpense({ amount: i + 1, categoryId: 'Food', note: '', date: '2026-11-13' })));
    expect((await service.list()).expenses).toHaveLength(10);
  });

  it('coordinates separate service instances sharing the same storage adapter', async () => {
    const { service, auth, storage, rnd, user } = await setup();
    const second = createAppDataService(auth, storage, rnd, user.id);
    await service.addPayment(payment);
    const id = (await service.list()).payments[0].id;
    const results = await Promise.allSettled([service.markPaymentPaid(id), second.markPaymentPaid(id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await Promise.all([
      service.addExpense({ amount: 1, categoryId: 'Food', note: '', date: '2026-11-13' }),
      second.addExpense({ amount: 2, categoryId: 'Food', note: '', date: '2026-11-13' }),
    ]);
    expect((await service.list()).expenses).toHaveLength(3);
  });

  it.each([
    { amount: NaN }, { amount: Infinity }, { amount: 0 }, { amount: -1 }, { amount: '10' },
    { dueDate: '2025-02-29' }, { recurrence: 'weekly' }, { reminderDays: -1 },
    { reminderDays: 1.5 }, { reminderDays: Infinity }, { categoryId: 'missing' }, { title: '' },
  ])('rejects invalid payments without mutation: %j', async (invalid) => {
    const { service, data } = await setup();
    const before = new Map(data);
    await expect(service.addPayment({ ...payment, ...invalid } as NewPayment)).rejects.toThrow();
    expect(data).toEqual(before);
  });

  it('fails before mutation on recurrence overflow, invalid expense dates and unknown categories', async () => {
    const { service } = await setup();
    await service.addPayment({ ...payment, dueDate: '9999-12-31' });
    const before = await service.list();
    await expect(service.markPaymentPaid(before.payments[0].id)).rejects.toThrow('range');
    await expect(service.addExpense({ amount: 1, note: '', categoryId: 'Food', date: '2026-02-30' })).rejects.toThrow();
    await expect(service.addExpense({ amount: 1, note: '', categoryId: 'missing', date: '2026-01-01' })).rejects.toThrow();
    expect(await service.list()).toEqual(before);
  });
});

describe('category budgets', () => {
  it('sets, clears and rejects invalid budgets or category references', async () => {
    const { service } = await setup();
    await service.setCategoryBudget('Food', 100);
    expect((await service.list()).categoryBudgets).toEqual({ Food: 100 });
    for (const amount of [-1, NaN, Infinity]) {
      await expect(service.setCategoryBudget('Food', amount)).rejects.toThrow();
    }
    await expect(service.setCategoryBudget('missing', 0)).rejects.toThrow();
    await service.setCategoryBudget('Food', 0);
    expect((await service.list()).categoryBudgets).toEqual({});
  });

  it('alerts at 80% and 100% including inactive historical categories, in the selected month only', () => {
    const categories = [{ id: 'c', name: 'Food', status: 'inactive' as const }];
    const expense = { id: 'e', amount: 79, categoryId: 'c', note: '', date: '2026-11-13' };
    expect(categoryBudgetAlerts([expense], categories, { c: 100 }, '2026-11')).toEqual([]);
    expect(categoryBudgetAlerts([{ ...expense, amount: 80 }], categories, { c: 100 }, '2026-11')[0].level).toBe('warn');
    expect(categoryBudgetAlerts([{ ...expense, amount: 100 }], categories, { c: 100 }, '2026-11')[0].level).toBe('danger');
    expect(categoryBudgetAlerts([{ ...expense, amount: 150 }], categories, { c: 100 }, '2026-10')).toEqual([]);
  });
});

describe('portable encrypted backups', () => {
  it('roundtrips profile/avatar, expenses, inactive categories, budgets, payments and recurrence anchors across accounts', async () => {
    const { service, auth, user, data, storage, rnd } = await setup();
    await service.updateProfile({ ...user, firstName: 'Anna', monthlyIncome: 5000 });
    await service.updateAvatar('data:image/png;base64,AAAA');
    await service.addCategory('Pets');
    const pets = (await service.list()).categories.find((c) => c.name === 'Pets')!;
    await service.setCategoryActive(pets.id, false);
    await service.setCategoryBudget(pets.id, 50);
    await service.addExpense({ amount: 20, categoryId: pets.id, note: 'Vet', date: '2026-11-01' });
    await service.addPayment(payment);
    const paymentId = (await service.list()).payments[0].id;
    await service.markPaymentPaid(paymentId);
    const expected = await service.list();
    const backup = await service.createBackup(password);
    expect(backup).not.toContain('Anna');
    expect(backup).not.toContain(password);
    const decoded = decryptBackup(backup, password);
    expect(Object.keys(decoded as object).sort()).toEqual(['data', 'profile', 'version']);
    const plain = JSON.stringify(decoded);
    for (const secret of ['wrappedKey', 'keySalt', 'hash', 'salt', 'session', 'username', registration.password, user.id]) expect(plain).not.toContain(secret);

    const sourceRecord = JSON.parse(data.get('me:accounts')!).find((a: { id: string }) => a.id === user.id);
    const target = await auth.register({ ...registration, username: 'target', password: 'target-password' });
    const targetSvc = createAppDataService(auth, storage, rnd, target.id);
    await targetSvc.addExpense({ amount: 999, categoryId: 'Other', note: 'Replace me', date: '2026-01-01' });
    const targetBefore = JSON.parse(data.get('me:accounts')!).find((a: { id: string }) => a.id === target.id);
    const restored = await targetSvc.restoreBackup(backup, password);
    expect(restored).toMatchObject({ id: target.id, username: 'target', firstName: 'Anna', avatar: 'data:image/png;base64,AAAA' });
    expect(await targetSvc.list()).toEqual(expected);
    await targetSvc.markPaymentPaid(paymentId);
    expect((await targetSvc.list()).payments[0].dueDate).toBe('2024-03-31');
    const accounts = JSON.parse(data.get('me:accounts')!);
    expect(accounts.find((a: { id: string }) => a.id === user.id)).toEqual(sourceRecord);
    const { sealed: _old, ...beforeCredentials } = targetBefore;
    const { sealed: _new, ...afterCredentials } = accounts.find((a: { id: string }) => a.id === target.id);
    expect(afterCredentials).toEqual(beforeCredentials);
    expect(await auth.login('target', 'target-password')).toMatchObject({ id: target.id, firstName: 'Anna' });
    expect(await auth.login('ann', registration.password)).toMatchObject({ id: user.id });
  });

  it('clears avatar when absent from the source and persists restored data over later profile edits/password changes', async () => {
    const { service, auth, user } = await setup();
    await service.addPayment(payment);
    const backup = await service.createBackup(password);
    await service.updateAvatar('data:image/png;base64,AAAA');
    await service.addCategory('Remove on restore');
    expect((await service.restoreBackup(backup, password)).avatar).toBeUndefined();
    await service.updateProfile({ ...user, firstName: 'Updated' });
    await service.updateAvatar('data:image/png;base64,AAAA');
    await service.changePassword(registration.password, 'new-account-password');
    expect((await service.list()).payments).toHaveLength(1);
    expect(await auth.login('ann', 'new-account-password')).toMatchObject({ firstName: 'Updated' });
    expect((await service.list()).payments).toHaveLength(1);
  });

  it('rejects wrong passwords, tampering, malformed envelopes and unsupported versions without mutation', async () => {
    const { service, data } = await setup();
    const backup = await service.createBackup(password);
    const before = new Map(data);
    await expect(service.restoreBackup(backup, 'wrong-password')).rejects.toThrow('password');
    const envelope = JSON.parse(backup);
    for (const invalid of ['no json', '{}', 'null', JSON.stringify({ ...envelope, version: 2 }), JSON.stringify({ ...envelope, iterations: 1 }), JSON.stringify({ ...envelope, payload: envelope.payload.slice(0, -2) + '00' })]) {
      await expect(service.restoreBackup(invalid, password)).rejects.toThrow();
    }
    expect(data).toEqual(before);
    await expect(service.createBackup('short')).rejects.toThrow('8');
  });

  it('validates every restored collection, reference and profile before any destructive mutation', async () => {
    const { service, data, rnd } = await setup();
    await service.addPayment(payment);
    const source = decryptBackup(await service.createBackup(password), password) as { version: number; profile: Record<string, unknown>; data: Record<string, unknown> };
    const cases = [
      { ...source, profile: { ...source.profile, monthlyIncome: -1 } },
      { ...source, profile: { ...source.profile, firstName: null } },
      { ...source, profile: { ...source.profile, avatar: 'data:text/html;base64,AAAA' } },
      { ...source, data: { ...source.data, categories: [] } },
      { ...source, data: { ...source.data, expenses: [{ id: 'e', amount: 1, categoryId: 'Housing', date: '2026-02-30', note: '' }] } },
      { ...source, data: { ...source.data, categoryBudgets: { missing: 1 } } },
      { ...source, data: { ...source.data, categoryBudgets: { Food: -1 } } },
      { ...source, data: { ...source.data, paymentAnchors: {} } },
      { ...source, data: { ...source.data, payments: [...source.data.payments as unknown[], ...source.data.payments as unknown[]] } },
      { ...source, data: { ...source.data, expenses: null } },
      { ...source, data: { ...source.data, version: 2 } },
    ];
    const before = new Map(data);
    for (const invalid of cases) await expect(service.restoreBackup(encryptBackup(invalid, password, rnd), password)).rejects.toThrow();
    expect(data).toEqual(before);
  });

  it('commits restore in one write and leaves current data/profile unchanged on storage failure', async () => {
    const { service, failure, auth, user, storage } = await setup();
    const backup = await service.createBackup(password);
    await service.updateProfile({ ...user, firstName: 'Keep' });
    await service.addPayment(payment);
    const before = await service.list();
    failure.before = true;
    await expect(service.restoreBackup(backup, password)).rejects.toThrow('Write failed');
    failure.before = false;
    expect(await service.list()).toEqual(before);
    expect((await auth.currentUser())?.firstName).toBe('Keep');
    let writes = 0;
    const original = storage.setItem;
    storage.setItem = async (key, value) => { writes++; await original(key, value); };
    await service.restoreBackup(backup, password);
    expect(writes).toBe(1);
    expect((await service.list()).payments).toEqual([]);
    expect((await auth.currentUser())?.firstName).toBe('Ann');
  });

  it('migrates existing encrypted expenses/categories on first context mutation and never exposes new data in plaintext', async () => {
    const { service, auth, storage, data, user } = await setup();
    const secure = auth.encryptedStorage(storage);
    await secure.setItem(`me:expenses:${user.id}`, JSON.stringify([{ id: 'old', amount: 5, category: 'Food', note: 'legacy', date: '2026-01-01' }]));
    await service.addPayment(payment);
    expect((await service.list()).expenses[0].categoryId).toBe('Food');
    await secure.setItem(`me:expenses:${user.id}`, '[]');
    expect((await service.list()).expenses).toHaveLength(1);
    expect(data.get('me:accounts')).not.toContain('Rent');
    expect(data.get('me:accounts')).not.toContain('appData');
    expect(() => validateAppData({ version: 1 })).toThrow();
  });
});
