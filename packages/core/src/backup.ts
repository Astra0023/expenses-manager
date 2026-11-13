import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { MIN_PASSWORD_LENGTH } from './auth';
import type { RandomBytes } from './types';
import { KEY_LENGTH, open, seal } from './vault';

const ITERATIONS = 100_000;

function assertPassword(password: string): void {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Backup password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

/** An independent password-derived key: no account credentials, data keys or sessions. */
export function encryptBackup(data: unknown, password: string, randomBytes: RandomBytes): string {
  assertPassword(password);
  const salt = randomBytes(16);
  const key = pbkdf2(sha256, password, salt, { c: ITERATIONS, dkLen: KEY_LENGTH });
  try {
    return JSON.stringify({
      format: 'manage-expenses-backup', version: 1,
      kdf: 'pbkdf2-sha256', iterations: ITERATIONS, salt: bytesToHex(salt),
      payload: seal(JSON.stringify(data), key, randomBytes),
    });
  } finally {
    key.fill(0);
  }
}

export function decryptBackup(data: string, password: string): unknown {
  assertPassword(password);
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(data) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid backup');
  }
  if (!envelope || envelope.format !== 'manage-expenses-backup' || envelope.version !== 1 ||
      envelope.kdf !== 'pbkdf2-sha256' || envelope.iterations !== ITERATIONS ||
      typeof envelope.salt !== 'string' || !/^[0-9a-f]{32}$/.test(envelope.salt) ||
      typeof envelope.payload !== 'string' || !/^enc1:[0-9a-f]{80,}$/.test(envelope.payload)) {
    throw new Error('Invalid or unsupported backup');
  }
  const key = pbkdf2(sha256, password, hexToBytes(envelope.salt), { c: ITERATIONS, dkLen: KEY_LENGTH });
  try {
    return JSON.parse(open(envelope.payload, key)) as unknown;
  } catch {
    throw new Error('Incorrect backup password or damaged backup');
  } finally {
    key.fill(0);
  }
}
