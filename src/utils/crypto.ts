/**
 * Military-grade AES-GCM-256 and PBKDF2 encryption utilities
 * Powered by Web Crypto API for zero-plaintext storage
 */

// Generate or derive a cryptographic key from a passphrase or machine seed
export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt payload to Base64 envelope containing Salt, IV, and Ciphertext
export async function encryptData(data: string, secretKeyStr: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV standard for AES-GCM

  const key = await deriveKey(secretKeyStr, salt);
  const encodedData = enc.encode(data);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    encodedData
  );

  // Pack salt (16 bytes) + iv (12 bytes) + ciphertext into single base64 string
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  // Safe chunked base64 conversion to prevent RangeError: Maximum call stack size exceeded
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < combined.length; i += chunkSize) {
    const chunk = combined.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }

  return btoa(binary);
}

// Decrypt Base64 envelope back to plaintext
export async function decryptData(encryptedEnvelope: string, secretKeyStr: string): Promise<string> {
  try {
    const raw = atob(encryptedEnvelope);
    const combined = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      combined[i] = raw.charCodeAt(i);
    }

    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);

    const key = await deriveKey(secretKeyStr, salt);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (err) {
    console.error('Decryption failed: corrupted envelope or invalid key', err);
    throw new Error('فشل فك التشفير: المفتاح غير صالح أو البيانات معطوبة');
  }
}

// Compute SHA-256 fingerprint of any URL or string
export async function sha256Fingerprint(input: string): Promise<string> {
  const enc = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', enc.encode(input));
  const hashArray = Array.from(new Uint8Array(buffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
