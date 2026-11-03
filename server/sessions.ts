/**
 * Per-browser-session state for the proxy, with per-site isolation.
 *
 * Two kinds of credentials:
 *  - `aegis_sid` cookie (HttpOnly, SameSite=Strict) on the app's own origin. Only the app UI
 *    (same-origin) can use it, and only to START a page load.
 *  - A per-(session, site) capability TOKEN that is embedded in the URLs of the proxied page.
 *    Proxied pages run in an opaque origin (CSP sandbox), so they can't send the cookie; the token
 *    lets their sub-requests (css, js, images, fetch) reach the proxy.
 *
 * A token is bound to ONE site (registrable domain). It selects a cookie jar partition for that
 * site, so a page can only ever use cookies of its own partition:
 *   - evil.com's token can't read your bank.com login (different partition),
 *   - third-party trackers get partitioned cookies and can't follow you across sites.
 */
import crypto from 'crypto';
import type { Request, Response } from 'express';
import { getDomain } from 'tldts';
import { CookieJar } from './cookieJar.ts';
import { DEFAULT_SHIELD_FLAGS, decodeShieldFlags, type ShieldFlags } from '../src/utils/shieldFlags.ts';

export const SESSION_COOKIE = 'aegis_sid';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // idle expiry
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 1000;
const MAX_JARS_PER_SESSION = 300;
const MAX_TOKENS = 50_000;
const SID_FORMAT = /^[a-f0-9]{64}$/;
const TOKEN_FORMAT = /^[a-f0-9]{48}$/;

export interface Session {
  jars: Map<string, CookieJar>; // key: site (registrable domain)
  shield: ShieldFlags; // the user's privacy settings, sent by the app UI when it opens a page
  lastUsed: number;
}

interface TokenRecord {
  sid: string;
  site: string;
  expires: number;
}

const sessions = new Map<string, Session>();
const tokens = new Map<string, TokenRecord>();
const tokenIndex = new Map<string, string>(); // `${sid}|${site}` -> token

/** Registrable domain ("a.b.example.co.uk" -> "example.co.uk"), with a sane fallback for IPs/odd hosts. */
export function siteOf(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return getDomain(host, { allowPrivateDomains: true }) ?? host;
}

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

function lookupSessionFromCookie(req: Request): string | null {
  const sid = parseCookieHeader(req.headers.cookie)[SESSION_COOKIE];
  return sid && SID_FORMAT.test(sid) && sessions.has(sid) ? sid : null;
}

function createSession(req: Request, res: Response): string {
  if (sessions.size >= MAX_SESSIONS) {
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
  sessions.set(id, { jars: new Map(), shield: { ...DEFAULT_SHIELD_FLAGS }, lastUsed: Date.now() });

  // No Max-Age: a browser-session cookie. Strict: never sent on cross-site requests.
  const attrs = [`${SESSION_COOKIE}=${id}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (isHttps(req)) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
  return id;
}

/** Returns (and creates when needed) the cookie jar of `site` inside a session. */
export function jarFor(session: Session, site: string): CookieJar {
  let jar = session.jars.get(site);
  if (!jar) {
    if (session.jars.size >= MAX_JARS_PER_SESSION) {
      const oldest = session.jars.keys().next().value;
      if (oldest !== undefined) session.jars.delete(oldest);
    }
    jar = new CookieJar();
    session.jars.set(site, jar);
  }
  return jar;
}

function getOrMintToken(sid: string, site: string): string {
  const key = `${sid}|${site}`;
  const existing = tokenIndex.get(key);
  if (existing) {
    const rec = tokens.get(existing);
    if (rec && rec.expires > Date.now() + 60 * 60 * 1000) return existing; // still has > 1h left
  }
  if (tokens.size >= MAX_TOKENS) {
    const oldest = tokens.keys().next().value;
    if (oldest !== undefined) {
      const rec = tokens.get(oldest);
      if (rec) tokenIndex.delete(`${rec.sid}|${rec.site}`);
      tokens.delete(oldest);
    }
  }
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { sid, site, expires: Date.now() + TOKEN_TTL_MS });
  tokenIndex.set(key, token);
  return token;
}

export interface ProxyAuth {
  session: Session;
  site: string;
  token: string;
  shield: ShieldFlags;
  isPageLoad: boolean; // true = the app UI is opening a page; false = a proxied page loading a sub-resource
}
export interface ProxyAuthError {
  error: true;
  status: number;
  message: string;
}

/**
 * Decides who is calling the proxy and which cookie partition applies.
 *  - With a valid `t` token: the caller is a proxied page. The partition is the token's site,
 *    regardless of which URL it asks for (so third-party requests stay inside the page's partition).
 *  - Without a token: only the app UI itself may call (same-origin or user-typed), using the session
 *    cookie, and the partition is the site of the page being opened. Everything else is refused,
 *    so other websites can't use this server as an open proxy.
 */
export function authorizeProxyRequest(req: Request, res: Response, target: URL): ProxyAuth | ProxyAuthError {
  const now = Date.now();
  const t = typeof req.query.t === 'string' ? req.query.t : '';

  if (t) {
    const rec = TOKEN_FORMAT.test(t) ? tokens.get(t) : undefined;
    const session = rec ? sessions.get(rec.sid) : undefined;
    if (!rec || !session || rec.expires <= now) {
      return { error: true, status: 403, message: 'Aegis Shield: invalid or expired page token.' };
    }
    session.lastUsed = now;
    return { session, site: rec.site, token: t, shield: session.shield, isPageLoad: false };
  }

  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') {
    return { error: true, status: 403, message: 'Aegis Shield: cross-site requests are not allowed.' };
  }
  const sid = lookupSessionFromCookie(req) ?? createSession(req, res);
  const session = sessions.get(sid)!;
  session.lastUsed = now;
  // Only the app UI (cookie path) may change the privacy settings; proxied pages never can.
  const flags = decodeShieldFlags(req.query.s);
  if (flags) session.shield = flags;
  const site = siteOf(target.hostname);
  return { session, site, token: getOrMintToken(sid, site), shield: session.shield, isPageLoad: true };
}

/** Adds the page token to every proxied URL inside a text response (HTML/CSS/error pages). */
export function addTokenToProxyUrls(text: string, token: string): string {
  return text.split('/api/proxy?url=').join(`/api/proxy?t=${token}&url=`);
}

/** Empties all proxy cookie jars of the requesting client's session. */
export function clearSessionCookies(req: Request): void {
  const sid = lookupSessionFromCookie(req);
  if (sid) sessions.get(sid)!.jars.clear();
}

// Drop idle sessions and expired tokens so memory can't grow forever
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) if (s.lastUsed < now - SESSION_TTL_MS) sessions.delete(id);
  for (const [token, rec] of tokens) {
    if (rec.expires <= now || !sessions.has(rec.sid)) {
      tokens.delete(token);
      if (tokenIndex.get(`${rec.sid}|${rec.site}`) === token) tokenIndex.delete(`${rec.sid}|${rec.site}`);
    }
  }
}, 10 * 60 * 1000);
sweeper.unref();
