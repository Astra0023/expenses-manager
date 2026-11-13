import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import type { KeyValueStorage, RandomBytes } from './types';

const PREFIX = 'enc1:';
const NONCE_LENGTH = 24;

export const KEY_LENGTH = 32;

export function seal(plain: string, key: Uint8Array, randomBytes: RandomBytes): string {
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = xchacha20poly1305(key, nonce).encrypt(utf8ToBytes(plain));
  return PREFIX + bytesToHex(nonce) + bytesToHex(cipher);
}

export function isSealed(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** Throws if the key is wrong or the value was tampered with (authenticated encryption). */
export function open(sealed: string, key: Uint8Array): string {
  const bytes = hexToBytes(sealed.slice(PREFIX.length));
  const nonce = bytes.slice(0, NONCE_LENGTH);
  const plain = xchacha20poly1305(key, nonce).decrypt(bytes.slice(NONCE_LENGTH));
  return new TextDecoder().decode(plain);
}

/**
 * Wraps a storage so every value is encrypted at rest. Plain values written by older versions
 * are still readable and get encrypted on the next write.
 */
export function createEncryptedStorage(inner: KeyValueStorage, key: Uint8Array, randomBytes: RandomBytes): KeyValueStorage {
  return {
    async getItem(k) {
      const raw = await inner.getItem(k);
      return raw !== null && isSealed(raw) ? open(raw, key) : raw;
    },
    setItem: (k, v) => inner.setItem(k, seal(v, key, randomBytes)),
    removeItem: (k) => inner.removeItem(k),
  };
}
