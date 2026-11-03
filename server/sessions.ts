/**
 * Per-browser-session state for the proxy.
 *
 * A random session id is issued in an HttpOnly, SameSite=Strict cookie on the app's own origin.
 * It is never forwarded upstream and cannot be read by proxied page scripts (HttpOnly).
 * Each session owns a private CookieJar, so one user's logins can never be used by another.
 */
import crypto from 'crypto';
import type { Request, Response } from 'express';
import { CookieJar } from './cookieJar.ts';

export const SESSION_COOKIE = 'aegis_sid';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // idle expiry
const MAX_SESSIONS = 1000;
const SID_FORMAT = /^[a-f0-9]{64}$/;

interface Session {
  jar: CookieJar;
  lastUsed: number;
}

const sessions = new Map<string, Session>();

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const i = pair.indexOf('=');
    if (i === -1) continue;
    out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return out;
}

function isHttps(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

export function getSessionId(req: Request): string | null {
  const sid = parseCookieHeader(req.headers.cookie)[SESSION_COOKIE];
  return sid && SID_FORMAT.test(sid) && sessions.has(sid) ? sid : null;
}

/** Returns this client's session, creating one (and setting the cookie) if needed. */
export function getOrCreateSession(req: Request, res: Response): { id: string; jar: CookieJar } {
  const existing = getSessionId(req);
  if (existing) {
    const s = sessions.get(existing)!;
    s.lastUsed = Date.now();
    return { id: existing, jar: s.jar };
  }

  if (sessions.size >= MAX_SESSIONS) {
    // evict the least recently used session
    let oldestId: string | null = null;
    let oldestTime = Infinity;
    for (const [id, s] of sessions) {
      if (s.lastUsed < oldestTime) {
        oldestTime = s.lastUsed;
        oldestId = id;
      }
    }
    if (oldestId) sessions.delete(oldestId);
  }

  const id = crypto.randomBytes(32).toString('hex');
  const session: Session = { jar: new CookieJar(), lastUsed: Date.now() };
  sessions.set(id, session);

  // No Max-Age: a browser-session cookie. Strict: never sent on cross-site requests.
  const attrs = [`${SESSION_COOKIE}=${id}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (isHttps(req)) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));

  return { id, jar: session.jar };
}

/** Empties the proxy cookie jar of the requesting client's session. */
export function clearSessionCookies(req: Request): void {
  const id = getSessionId(req);
  if (id) sessions.get(id)!.jar.clear();
}

// Drop idle sessions so memory can't grow forever
const sweeper = setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions) if (s.lastUsed < cutoff) sessions.delete(id);
}, 10 * 60 * 1000);
sweeper.unref();
