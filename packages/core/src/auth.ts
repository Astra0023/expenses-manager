import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import type { Account, KeyValueStorage, Profile, RandomBytes, RegisterInput } from './types';
import { KEY_LENGTH, createEncryptedStorage, isSealed, open, seal } from './vault';

const ACCOUNTS_KEY = 'me:accounts';
const LEGACY_SESSION_KEY = 'me:session';
const ITERATIONS = 100_000;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_AVATAR_LENGTH = 400_000;

export class UncertainWriteError extends Error {
  constructor() {
    super('Could not confirm whether data was saved. Reload the account before retrying.');
    this.name = 'UncertainWriteError';
  }
}

export interface PersistedSession {
  id: string;
  key: string;
  expiresAt: number;
}

export interface SessionStorage {
  read(): PersistedSession | null;
  write(session: PersistedSession): void;
  clear(): void;
}

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

/**
 * Exclusive lock guarding every read-modify-write of `me:accounts`.
 * Core never requests the lock while already holding it, so non-reentrant locks are safe.
 */
export interface AccountLock {
  scope: 'cross-context' | 'in-process';
  run<T>(name: string, work: () => Promise<T>): Promise<T>;
}

export interface AuthServiceOptions {
  /** Web should pass `navigatorLocks()`; without it only callers sharing this storage object are serialized. */
  lock?: AccountLock;
}

export const ACCOUNT_LOCK_NAME = 'manage-expenses:accounts';
const localQueues = new WeakMap<KeyValueStorage, Promise<unknown>>();

/** Serializes callers in this JS context that share the same storage object. */
export function inProcessLock(storage: KeyValueStorage): AccountLock {
  return {
    scope: 'in-process',
    run(_name, work) {
      const result = (localQueues.get(storage) ?? Promise.resolve()).then(work);
      localQueues.set(storage, result.catch(() => undefined));
      return result;
    },
  };
}

interface LockManagerLike {
  request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T>): Promise<T>;
}

/** Cross-tab/worker exclusive lock via the Web Locks API; null when unsupported. */
export function navigatorLocks(): AccountLock | null {
  const locks = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator?.locks;
  if (!locks || typeof locks.request !== 'function') return null;
  return { scope: 'cross-context', run: (name, work) => locks.request(name, { mode: 'exclusive' }, work) };
}

export interface AccountData {
  account: Account;
  appData: unknown;
}

export interface AppDataUpdate {
  appData: unknown;
  /** When present, replaces personal profile fields (never id, username or credentials). */
  profile?: Profile & { avatar?: string };
}

/** Only what is needed to sign in is stored in the clear; everything personal lives in `sealed`. */
interface StoredAccount {
  id: string;
  username: string;
  salt: string;
  hash: string;
  iterations: number;
  keySalt?: string;
  /** random data key, encrypted with a key derived from the password */
  wrappedKey?: string;
  /** encrypted JSON of SealedProfile */
  sealed?: string;
  // Fields below only exist on accounts created before encryption was added.
  firstName?: string;
  lastName?: string;
  monthlyIncome?: number;
  taxRate?: number;
  savingsRate?: number;
  avatar?: string;
}

interface SealedProfile extends Profile {
  avatar?: string;
  appData?: unknown;
}

function derive(password: string, salt: Uint8Array, iterations: number): string {
  return bytesToHex(pbkdf2(sha256, password, salt, { c: iterations, dkLen: 32 }));
}

function deriveKey(password: string, salt: Uint8Array): Uint8Array {
  return pbkdf2(sha256, password, salt, { c: ITERATIONS, dkLen: KEY_LENGTH });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function assertPercent(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${label} must be between 0 and 100`);
}

export function validateProfile(p: Profile): void {
  if (typeof p.firstName !== 'string' || !p.firstName.trim()) throw new Error('First name is required');
  if (typeof p.lastName !== 'string' || !p.lastName.trim()) throw new Error('Last name is required');
  if (!Number.isFinite(p.monthlyIncome) || p.monthlyIncome < 0) throw new Error('Monthly income must be 0 or more');
  assertPercent(p.taxRate, 'Tax rate');
  assertPercent(p.savingsRate, 'Savings rate');
}

export function validateAvatar(avatar: unknown): asserts avatar is string | undefined {
  if (avatar === undefined) return;
  if (typeof avatar !== 'string' || !/^data:image\/(png|jpeg|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(avatar)) {
    throw new Error('Unsupported image');
  }
  if (avatar.length > MAX_AVATAR_LENGTH) throw new Error('Image is too large');
}

function assertPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

export function createAuthService(
  storage: KeyValueStorage,
  randomBytes: RandomBytes,
  sessionStorage?: SessionStorage,
  options: AuthServiceOptions = {},
) {
  let session: { id: string; key: Uint8Array; expiresAt?: number } | null = null;
  const lock = options.lock ?? inProcessLock(storage);
  const locked = <T>(work: () => Promise<T>): Promise<T> => lock.run(ACCOUNT_LOCK_NAME, work);

  function readSession(): PersistedSession | null {
    if (!sessionStorage) return null;
    const saved = sessionStorage.read();
    if (!saved) return null;
    if (typeof saved.id !== 'string' || !saved.id || typeof saved.key !== 'string' ||
        !/^[0-9a-f]{64}$/.test(saved.key) || !Number.isSafeInteger(saved.expiresAt)) {
      throw new Error('Stored session is invalid. Sign in again after clearing the session.');
    }
    if (saved.expiresAt <= Date.now()) {
      sessionStorage.clear();
      return null;
    }
    return saved;
  }

  function saveSession(id: string, key: Uint8Array): void {
    if (sessionStorage) {
      const saved = { id, key: bytesToHex(key), expiresAt: Date.now() + SESSION_DURATION_MS };
      sessionStorage.write(saved);
      session = { id, key, expiresAt: saved.expiresAt };
    } else {
      session = { id, key };
    }
  }

  async function load(): Promise<StoredAccount[]> {
    const raw = await storage.getItem(ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as StoredAccount[]) : [];
  }
  const save = (list: StoredAccount[]) => storage.setItem(ACCOUNTS_KEY, JSON.stringify(list));

  function wrapKey(dataKey: Uint8Array, password: string): Pick<StoredAccount, 'keySalt' | 'wrappedKey'> {
    const keySalt = randomBytes(16);
    return {
      keySalt: bytesToHex(keySalt),
      wrappedKey: seal(bytesToHex(dataKey), deriveKey(password, keySalt), randomBytes),
    };
  }

  function toAccount(stored: StoredAccount, key: Uint8Array): Account {
    const { appData: _data, ...profile } = JSON.parse(open(stored.sealed!, key)) as SealedProfile;
    return { id: stored.id, username: stored.username, ...profile };
  }

  function sealProfile(profile: SealedProfile, key: Uint8Array): string {
    return seal(JSON.stringify(profile), key, randomBytes);
  }

  /** Encrypts data written by older versions, which stored everything in plain text. */
  async function migrateLegacy(stored: StoredAccount, password: string): Promise<{ stored: StoredAccount; key: Uint8Array }> {
    const key = randomBytes(KEY_LENGTH);
    const profile: SealedProfile = {
      firstName: stored.firstName ?? '',
      lastName: stored.lastName ?? '',
      monthlyIncome: stored.monthlyIncome ?? 0,
      taxRate: stored.taxRate ?? 0,
      savingsRate: stored.savingsRate ?? 20,
      ...(stored.avatar ? { avatar: stored.avatar } : {}),
    };
    for (const name of [`me:expenses:${stored.id}`, `me:categories:${stored.id}`]) {
      const raw = await storage.getItem(name);
      if (raw !== null && !isSealed(raw)) await storage.setItem(name, seal(raw, key, randomBytes));
    }
    const next: StoredAccount = {
      id: stored.id,
      username: stored.username,
      salt: stored.salt,
      hash: stored.hash,
      iterations: stored.iterations,
      ...wrapKey(key, password),
      sealed: sealProfile(profile, key),
    };
    return { stored: next, key };
  }

  function requireSession(id: string): Uint8Array {
    if (!session || session.id !== id) throw new Error('Session expired. Please sign in again.');
    if (sessionStorage) {
      const saved = readSession();
      if (!saved || saved.id !== session.id || saved.key !== bytesToHex(session.key) || saved.expiresAt !== session.expiresAt) {
        session = null;
        throw new Error('Session expired. Please sign in again.');
      }
    }
    return session.key;
  }

  async function findOrThrow(id: string): Promise<{ accounts: StoredAccount[]; index: number }> {
    const accounts = await load();
    const index = accounts.findIndex((a) => a.id === id);
    if (index < 0) throw new Error('Account not found');
    return { accounts, index };
  }

  function unseal(stored: StoredAccount, key: Uint8Array): SealedProfile {
    return JSON.parse(open(stored.sealed!, key)) as SealedProfile;
  }

  /** Writes the list; on a failed acknowledgement, reads back to tell committed from not committed. */
  async function saveVerified(accounts: StoredAccount[], id: string): Promise<void> {
    const expected = accounts.find((a) => a.id === id)!;
    try {
      await save(accounts);
    } catch (reason) {
      let persisted: StoredAccount | undefined;
      try {
        persisted = (await load()).find((account) => account.id === id);
      } catch {
        throw new UncertainWriteError();
      }
      if (persisted?.sealed !== expected.sealed || persisted?.hash !== expected.hash) throw reason;
    }
  }

  return {
    /** 'cross-context' only when a cross-tab lock such as navigatorLocks() was supplied. */
    lockScope: lock.scope,

    register: (input: RegisterInput): Promise<Account> => locked(async () => {
      const username = input.username.trim();
      if (!username) throw new Error('Username is required');
      assertPassword(input.password);
      const profile: Profile = {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        monthlyIncome: 0,
        taxRate: 0,
        savingsRate: 20,
      };
      validateProfile(profile);
      const accounts = await load();
      if (accounts.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
        throw new Error('Username already exists');
      }
      const salt = randomBytes(16);
      const key = randomBytes(KEY_LENGTH);
      const stored: StoredAccount = {
        id: bytesToHex(randomBytes(8)),
        username,
        salt: bytesToHex(salt),
        hash: derive(input.password, salt, ITERATIONS),
        iterations: ITERATIONS,
        ...wrapKey(key, input.password),
        sealed: sealProfile(profile, key),
      };
      await save([...accounts, stored]);
      saveSession(stored.id, key);
      return toAccount(stored, key);
    }),

    // Locked as a whole so a legacy migration cannot overwrite a concurrent account write.
    login: (username: string, password: string): Promise<Account> => locked(async () => {
      const accounts = await load();
      const index = accounts.findIndex((a) => a.username.toLowerCase() === username.trim().toLowerCase());
      const fail = new Error('Invalid username or password');
      if (index < 0) throw fail;
      let stored = accounts[index];
      const hash = derive(password, hexToBytes(stored.salt), stored.iterations);
      if (!timingSafeEqual(hash, stored.hash)) throw fail;

      let key: Uint8Array;
      if (stored.wrappedKey && stored.keySalt && stored.sealed) {
        key = hexToBytes(open(stored.wrappedKey, deriveKey(password, hexToBytes(stored.keySalt))));
      } else {
        ({ stored, key } = await migrateLegacy(stored, password));
        accounts[index] = stored;
        await save(accounts);
      }
      await storage.removeItem(LEGACY_SESSION_KEY);
      saveSession(stored.id, key);
      return toAccount(stored, key);
    }),

    /** Restores a valid persisted session when a session storage adapter is configured. */
    async currentUser(): Promise<Account | null> {
      if (sessionStorage) {
        const saved = readSession();
        session = saved ? { id: saved.id, key: hexToBytes(saved.key), expiresAt: saved.expiresAt } : null;
      }
      if (!session) return null;
      const active = session;
      const stored = (await load()).find((a) => a.id === active.id);
      if (!session || session.id !== active.id || bytesToHex(session.key) !== bytesToHex(active.key) || session.expiresAt !== active.expiresAt) return null;
      if (sessionStorage) {
        const saved = readSession();
        if (!saved || saved.id !== active.id || saved.key !== bytesToHex(active.key) || saved.expiresAt !== active.expiresAt) {
          session = null;
          return null;
        }
      }
      if (!stored) throw new Error('Stored session account not found. Please sign in again.');
      return toAccount(stored, active.key);
    },

    sessionExpiresAt(): number | null {
      return session?.expiresAt ?? null;
    },

    /** Storage that encrypts everything written for the signed-in user. */
    encryptedStorage(inner: KeyValueStorage): KeyValueStorage {
      if (!session) throw new Error('Not signed in');
      const id = session.id;
      const key = requireSession(id);
      const encrypted = createEncryptedStorage(inner, key, randomBytes);
      return {
        getItem: (name) => { requireSession(id); return encrypted.getItem(name); },
        setItem: (name, value) => { requireSession(id); return encrypted.setItem(name, value); },
        removeItem: (name) => { requireSession(id); return encrypted.removeItem(name); },
      };
    },

    updateProfile: (id: string, profile: Profile): Promise<Account> => locked(async () => {
      const key = requireSession(id);
      const clean: Profile = {
        firstName: profile.firstName?.trim?.() ?? profile.firstName, lastName: profile.lastName?.trim?.() ?? profile.lastName,
        monthlyIncome: profile.monthlyIncome, taxRate: profile.taxRate, savingsRate: profile.savingsRate,
      };
      validateProfile(clean);
      const { accounts, index } = await findOrThrow(id);
      const current = unseal(accounts[index], key);
      const next: SealedProfile = { ...clean, ...(current.avatar ? { avatar: current.avatar } : {}), appData: current.appData };
      accounts[index] = { ...accounts[index], sealed: sealProfile(next, key) };
      await saveVerified(accounts, id);
      return toAccount(accounts[index], key);
    }),

    updateAvatar: (id: string, avatar: string | null): Promise<Account> => locked(async () => {
      const key = requireSession(id);
      if (avatar !== null) validateAvatar(avatar);
      const { accounts, index } = await findOrThrow(id);
      const { avatar: _old, ...rest } = unseal(accounts[index], key);
      accounts[index] = { ...accounts[index], sealed: sealProfile({ ...rest, ...(avatar ? { avatar } : {}) }, key) };
      await saveVerified(accounts, id);
      return toAccount(accounts[index], key);
    }),

    /** Account profile and app data from one consistent read. */
    async readAccountData(id: string): Promise<AccountData> {
      const key = requireSession(id);
      const { accounts, index } = await findOrThrow(id);
      return { account: toAccount(accounts[index], key), appData: unseal(accounts[index], key).appData };
    },

    /**
     * Atomic read-modify-write under the account lock: `update` receives the latest persisted
     * state and its result is committed in a single encrypted write. Throwing aborts with no write.
     */
    updateAppData: (id: string, update: (current: AccountData) => AppDataUpdate | Promise<AppDataUpdate>): Promise<Account> => locked(async () => {
      const key = requireSession(id);
      const { accounts, index } = await findOrThrow(id);
      const current = unseal(accounts[index], key);
      const { appData, profile } = await update({ account: toAccount(accounts[index], key), appData: current.appData });
      requireSession(id);
      if (profile) { validateProfile(profile); validateAvatar(profile.avatar); }
      const personal: SealedProfile = profile ? {
        firstName: profile.firstName.trim(), lastName: profile.lastName.trim(),
        monthlyIncome: profile.monthlyIncome, taxRate: profile.taxRate, savingsRate: profile.savingsRate,
        ...(profile.avatar !== undefined ? { avatar: profile.avatar } : {}),
      } : current;
      accounts[index] = { ...accounts[index], sealed: sealProfile({ ...personal, appData }, key) };
      await saveVerified(accounts, id);
      return toAccount(accounts[index], key);
    }),

    changePassword: (id: string, currentPassword: string, newPassword: string): Promise<void> => locked(async () => {
      assertPassword(newPassword);
      const key = requireSession(id);
      const { accounts, index } = await findOrThrow(id);
      const account = accounts[index];
      const current = derive(currentPassword, hexToBytes(account.salt), account.iterations);
      if (!timingSafeEqual(current, account.hash)) throw new Error('Current password is incorrect');
      const salt = randomBytes(16);
      accounts[index] = {
        ...account,
        salt: bytesToHex(salt),
        hash: derive(newPassword, salt, ITERATIONS),
        iterations: ITERATIONS,
        ...wrapKey(key, newPassword),
      };
      await saveVerified(accounts, id);
    }),

    async logout(): Promise<void> {
      if (sessionStorage && session) {
        const saved = readSession();
        if (saved && saved.id === session.id && saved.key === bytesToHex(session.key) && saved.expiresAt === session.expiresAt) {
          sessionStorage.clear();
        }
      }
      session = null;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
