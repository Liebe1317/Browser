/**
 * Encrypted vault for bookmarks + history.
 *
 * - The passphrase is never stored. Only a random salt and a "verifier"
 *   (a known string encrypted with the derived key) are kept in localStorage.
 * - The derived key lives only in memory (module variable) while unlocked,
 *   and is dropped on lock.
 * - Failed-attempt delays below are a client-side speed bump only. Anyone who
 *   can read localStorage can attack the ciphertext offline, so the real
 *   protection is a strong passphrase + the PBKDF2 cost.
 */
import { deriveKey, encryptWithKey, decryptWithKey, randomBytes, toBase64, fromBase64, KDF_ITERATIONS } from './crypto';

const META_KEY = 'aegis_vault_meta';
const DATA_KEY = 'aegis_vault_data';
const FAILS_KEY = 'aegis_vault_fails';
const VERIFIER_PLAINTEXT = 'aegis-vault-v1';

export const MIN_PASSPHRASE_LENGTH = 8;

interface VaultMeta {
  v: 1;
  salt: string; // base64
  iterations: number;
  verifier: string; // base64 envelope
}

// Flat shape (not a discriminated union) so it narrows correctly even without strictNullChecks.
export interface UnlockResult {
  ok: boolean;
  reason?: 'wrong' | 'locked-out' | 'corrupt';
  retryAfterMs?: number;
}

let sessionKey: CryptoKey | null = null;
let writeChain: Promise<void> = Promise.resolve();

function readMeta(): VaultMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as VaultMeta) : null;
  } catch {
    return null;
  }
}

export function isVaultSetUp(): boolean {
  return readMeta() !== null;
}

export function isVaultUnlocked(): boolean {
  return sessionKey !== null;
}

// ---- failed attempt throttling (speed bump only) ----
function readFails(): { count: number; until: number } {
  try {
    const raw = localStorage.getItem(FAILS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { count: 0, until: 0 };
}

function lockoutRemaining(): number {
  return Math.max(0, readFails().until - Date.now());
}

function recordFailure(): void {
  const { count } = readFails();
  const next = count + 1;
  // free attempts: 2; then 2s, 4s, 8s ... capped at 5 minutes
  const delayMs = next >= 3 ? Math.min(2 ** (next - 2) * 1000, 5 * 60 * 1000) : 0;
  try {
    localStorage.setItem(FAILS_KEY, JSON.stringify({ count: next, until: Date.now() + delayMs }));
  } catch {}
}

function clearFailures(): void {
  try {
    localStorage.removeItem(FAILS_KEY);
  } catch {}
}

// ---- public API ----

/** Creates the vault with a new passphrase and stores `initialData` encrypted. Leaves the vault unlocked. */
export async function createVault(passphrase: string, initialData: string): Promise<void> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`كلمة المرور يجب ألا تقل عن ${MIN_PASSPHRASE_LENGTH} أحرف`);
  }
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt, KDF_ITERATIONS);
  const meta: VaultMeta = {
    v: 1,
    salt: toBase64(salt),
    iterations: KDF_ITERATIONS,
    verifier: await encryptWithKey(VERIFIER_PLAINTEXT, key),
  };
  const data = await encryptWithKey(initialData, key);
  // Write data first so a crash in between never leaves a vault without data.
  localStorage.setItem(DATA_KEY, data);
  localStorage.setItem(META_KEY, JSON.stringify(meta));
  clearFailures();
  sessionKey = key;
}

export async function unlockVault(passphrase: string): Promise<UnlockResult> {
  const meta = readMeta();
  if (!meta) return { ok: false, reason: 'corrupt' };

  const remaining = lockoutRemaining();
  if (remaining > 0) return { ok: false, reason: 'locked-out', retryAfterMs: remaining };

  try {
    const key = await deriveKey(passphrase, fromBase64(meta.salt), meta.iterations);
    const check = await decryptWithKey(meta.verifier, key);
    if (check !== VERIFIER_PLAINTEXT) throw new Error('verifier mismatch');
    sessionKey = key;
    clearFailures();
    return { ok: true };
  } catch {
    recordFailure();
    const retry = lockoutRemaining();
    return retry > 0
      ? { ok: false, reason: 'locked-out', retryAfterMs: retry }
      : { ok: false, reason: 'wrong' };
  }
}

/** Drops the key from memory. Encrypted data stays in localStorage. */
export function lockVault(): void {
  sessionKey = null;
}

/** Encrypts and stores `plaintext`. Writes are serialized so an older save can't overwrite a newer one. */
export function saveVaultData(plaintext: string): Promise<void> {
  const key = sessionKey;
  if (!key) return Promise.resolve();
  writeChain = writeChain
    .then(async () => {
      const envelope = await encryptWithKey(plaintext, key);
      localStorage.setItem(DATA_KEY, envelope);
    })
    .catch((e) => console.warn('Vault save failed:', e));
  return writeChain;
}

/** Returns the decrypted data, or null if nothing was stored yet. Throws if decryption fails. */
export async function loadVaultData(): Promise<string | null> {
  if (!sessionKey) throw new Error('Vault is locked');
  const envelope = localStorage.getItem(DATA_KEY);
  if (!envelope) return null;
  return decryptWithKey(envelope, sessionKey);
}

/** Removes the vault completely (data, metadata, attempt counter) and forgets the key. */
export function destroyVault(): void {
  sessionKey = null;
  try {
    localStorage.removeItem(META_KEY);
    localStorage.removeItem(DATA_KEY);
    localStorage.removeItem(FAILS_KEY);
  } catch {}
}
