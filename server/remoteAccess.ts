import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export interface RemoteAccessCredentials {
  username: string;
  password: string;
}

/** Only loopback binds are considered local. Wildcard and LAN/public binds require authentication. */
export function isRemoteBind(host: string): boolean {
  const value = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!value || value === 'localhost' || value === '::1') return false;
  const octets = value.split('.').map(Number);
  if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && octets[0] === 127) {
    return false;
  }
  return true;
}

export function resolveRemoteAccessCredentials(
  env: NodeJS.ProcessEnv
): RemoteAccessCredentials {
  const username = env.AKRAM_REMOTE_AUTH_USER || '';
  const password = env.AKRAM_REMOTE_AUTH_PASSWORD || '';
  if (!username || username.includes(':') || username.length > 128 || password.length < 24 || password.length > 256) {
    throw new Error(
      'Remote binding refused: set AKRAM_REMOTE_AUTH_USER and AKRAM_REMOTE_AUTH_PASSWORD (24-256 characters) before exposing Akram.'
    );
  }
  return { username, password };
}

function credentialDigest(username: string, password: string): Buffer {
  return crypto.createHash('sha256').update(username).update('\0').update(password).digest();
}

/** Validate HTTP Basic credentials without variable-length timingSafeEqual comparisons. */
export function verifyBasicAuthorization(
  header: string | undefined,
  expectedUsername: string,
  expectedPassword: string
): boolean {
  if (!header || !/^Basic\s+[A-Za-z0-9+/]+={0,2}$/i.test(header)) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(header.replace(/^Basic\s+/i, ''), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const separator = decoded.indexOf(':');
  if (separator <= 0) return false;
  const supplied = credentialDigest(decoded.slice(0, separator), decoded.slice(separator + 1));
  const expected = credentialDigest(expectedUsername, expectedPassword);
  return crypto.timingSafeEqual(supplied, expected);
}

export function createBasicAuthMiddleware(username: string, password: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // CORS preflights carry no credentials by design; the actual request remains authenticated.
    if (req.method.toUpperCase() === 'OPTIONS') {
      next();
      return;
    }
    if (verifyBasicAuthorization(req.headers.authorization, username, password)) {
      next();
      return;
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Akram Browser", charset="UTF-8"');
    res.setHeader('Cache-Control', 'no-store');
    res.status(401).type('text/plain').send('Authentication required.');
  };
}
