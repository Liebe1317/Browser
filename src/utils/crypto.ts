/**
 * AES-GCM-256 + PBKDF2-SHA256 helpers built on the Web Crypto API.
 * The derived key is non-extractable, so it can be reused for many
 * encrypt/decrypt operations without ever exposing the raw key bytes.
 */

// OWASP (2023) recommends 600,000 iterations for PBKDF2-HMAC-SHA256.
export const KDF_ITERATIONS = 600_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function toBase64(bytes: Uint8Array): string {
  // Chunked to avoid "Maximum call stack size exceeded" on large payloads.
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as unknown as number[]);
  }
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = KDF_ITERATIONS
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt']
  );
}

/** Encrypts text. Output is base64(iv[12] || ciphertext+tag). A fresh random IV is used every call. */
export async function encryptWithKey(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = randomBytes(12);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      encoder.encode(plaintext)
    )
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return toBase64(combined);
}

/** Throws if the key is wrong or the data was modified (GCM authentication failure). */
export async function decryptWithKey(envelope: string, key: CryptoKey): Promise<string> {
  const combined = fromBase64(envelope);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    ciphertext as unknown as BufferSource
  );
  return decoder.decode(plain);
}

// Compute SHA-256 fingerprint of any URL or string
export async function sha256Fingerprint(input: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
