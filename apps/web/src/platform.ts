import type { KeyValueStorage, PersistedSession, RandomBytes, SessionStorage } from '@manage-expenses/core';

export const SESSION_KEY = 'me:web-session';

export const webSessionStorage: SessionStorage = {
  read: () => {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw === null ? null : JSON.parse(raw) as PersistedSession;
  },
  write: (session) => localStorage.setItem(SESSION_KEY, JSON.stringify(session)),
  clear: () => localStorage.removeItem(SESSION_KEY),
};

export const webStorage: KeyValueStorage = {
  getItem: async (k) => localStorage.getItem(k),
  setItem: async (k, v) => localStorage.setItem(k, v),
  removeItem: async (k) => localStorage.removeItem(k),
};

export const randomBytes: RandomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
