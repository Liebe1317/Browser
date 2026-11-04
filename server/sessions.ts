/**
 * In-memory browser sessions and scoped proxy capabilities.
 *
 * A proxy token is bound to:
 *   - one Aegis browser session,
 *   - one browsing context (regular profile or a private tab),
 *   - one exact top-level hostname.
 *
 * The cookie jar is partitioned by the same context + hostname tuple. This prevents a hostile
 * sibling subdomain from borrowing cookies that were created while the user visited another
 * sibling as a top-level page.
 */
import crypto from 'crypto';
import type { Request, Response } from 'express';
import { getDomain } from 'tldts';
import { CookieJar } from './cookieJar.ts';
import { DEFAULT_SHIELD_FLAGS, decodeShieldFlags, type ShieldFlags } from '../src/utils/shieldFlags.ts';

export const SESSION_COOKIE = 'aegis_sid';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_TTL_MS = 60 * 60 * 1000;
const MAX_SESSIONS = 1000;
const MAX_JARS_PER_SESSION = 500;
const MAX_TOKENS = 50_000;
const SID_FORMAT = /^[a-f0-9]{64}$/;
const TOKEN_FORMAT = /^[a-f0-9]{48}$/;
const CONTEXT_FORMAT = /^(?:regular|private-[A-Za-z0-9._:-]{1,120})$/;

export interface Session {
  /** Key: `${contextId}|${exactHostname}`. */
  jars: Map<string, CookieJar>;
  shield: ShieldFlags;
  lastUsed: number;
}

interface TokenRecord {
  sid: string;
  contextId: string;
  site: string;
  expires: number;
}

const sessions = new Map<string, Session>();
const tokens = new Map<string, TokenRecord>();
const tokenIndex = new Map<string, string>();

/** Registrable domain helper for SameSite/tracker policy; not used as a credential boundary. */
export function siteOf(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return getDomain(host, { allowPrivateDomains: true }) ?? host;
}

/** Exact hostname key used for security isolation (not an eTLD+1). */
export function hostKeyOf(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  if (!header) return out;
  for (const pair of header.split(';')) {
    const i = pair.indexOf('=');
    if (i === -1) continue;
    const name = pair.slice(0, i).trim();
    if (name) out[name] = pair.slice(i + 1).trim();
  }
  return out;
}

function isHttps(req: Request): boolean {
  // Do not trust X-Forwarded-Proto unless Express is explicitly configured behind a trusted proxy.
  return req.secure;
}

function lookupSessionFromCookie(req: Request): string | null {
  const sid = parseCookieHeader(req.headers.cookie)[SESSION_COOKIE];
  return sid && SID_FORMAT.test(sid) && sessions.has(sid) ? sid : null;
}

function createSession(req: Request, res: Response): string {
  if (sessions.size >= MAX_SESSIONS) {
    let oldestId: string | null = null;
    let oldestTime = Infinity;
    for (const [id, session] of sessions) {
      if (session.lastUsed < oldestTime) {
        oldestTime = session.lastUsed;
        oldestId = id;
      }
    }
    if (oldestId) {
      sessions.delete(oldestId);
      for (const [token, record] of tokens) {
        if (record.sid === oldestId) {
          tokens.delete(token);
          tokenIndex.delete(`${record.sid}|${record.contextId}|${record.site}`);
        }
      }
    }
  }

  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, { jars: new Map(), shield: { ...DEFAULT_SHIELD_FLAGS }, lastUsed: Date.now() });

  const attrs = [`${SESSION_COOKIE}=${id}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (isHttps(req)) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
  return id;
}

/** Returns the cookie jar for one exact top-level hostname and browsing context. */
export function jarFor(session: Session, contextId: string, site: string): CookieJar {
  const key = `${contextId}|${site}`;
  let jar = session.jars.get(key);
  if (!jar) {
    if (session.jars.size >= MAX_JARS_PER_SESSION) {
      const oldest = session.jars.keys().next().value;
      if (oldest !== undefined) session.jars.delete(oldest);
    }
    jar = new CookieJar();
    session.jars.set(key, jar);
  }
  return jar;
}

function getOrMintToken(sid: string, contextId: string, site: string): string {
  const key = `${sid}|${contextId}|${site}`;
  const existing = tokenIndex.get(key);
  if (existing) {
    const record = tokens.get(existing);
    if (record && record.expires > Date.now() + 5 * 60 * 1000) return existing;
  }

  if (tokens.size >= MAX_TOKENS) {
    const oldest = tokens.keys().next().value;
    if (oldest !== undefined) {
      const record = tokens.get(oldest);
      if (record) tokenIndex.delete(`${record.sid}|${record.contextId}|${record.site}`);
      tokens.delete(oldest);
    }
  }

  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { sid, contextId, site, expires: Date.now() + TOKEN_TTL_MS });
  tokenIndex.set(key, token);
  return token;
}

export interface ProxyAuth {
  session: Session;
  contextId: string;
  /** Exact hostname of the top-level page, not its registrable domain. */
  site: string;
  token: string;
  shield: ShieldFlags;
  isPageLoad: boolean;
}
export interface ProxyAuthError {
  error: true;
  status: number;
  message: string;
}

/**
 * Token requests are untrusted page subresources. They receive only the jar belonging to the
 * token's own context + exact top-level hostname. A page cannot choose another context via query.
 *
 * Tokenless requests are accepted only for a same-origin iframe navigation initiated by Aegis UI.
 * The outer server middleware validates the local Host and app API origin before this function runs.
 */
export function authorizeProxyRequest(req: Request, res: Response, target: URL): ProxyAuth | ProxyAuthError {
  const now = Date.now();
  const token = typeof req.query.t === 'string' ? req.query.t : '';

  if (token) {
    const record = TOKEN_FORMAT.test(token) ? tokens.get(token) : undefined;
    const session = record ? sessions.get(record.sid) : undefined;
    if (!record || !session || record.expires <= now) {
      return { error: true, status: 403, message: 'Aegis Shield: invalid or expired page capability.' };
    }
    session.lastUsed = now;
    return {
      session,
      contextId: record.contextId,
      site: record.site,
      token,
      shield: session.shield,
      isPageLoad: false,
    };
  }

  const fetchSite = req.headers['sec-fetch-site'];
  const fetchMode = req.headers['sec-fetch-mode'];
  const fetchDest = req.headers['sec-fetch-dest'];
  const contextId = typeof req.query.ctx === 'string' ? req.query.ctx : '';

  if (
    fetchSite !== 'same-origin' ||
    fetchMode !== 'navigate' ||
    fetchDest !== 'iframe' ||
    !CONTEXT_FORMAT.test(contextId)
  ) {
    return { error: true, status: 403, message: 'Aegis Shield: only the Aegis UI may open a proxied page.' };
  }

  const sid = lookupSessionFromCookie(req) ?? createSession(req, res);
  const session = sessions.get(sid)!;
  session.lastUsed = now;

  const flags = decodeShieldFlags(req.query.s);
  if (flags) session.shield = flags;

  const site = hostKeyOf(target.hostname);
  return {
    session,
    contextId,
    site,
    token: getOrMintToken(sid, contextId, site),
    shield: session.shield,
    isPageLoad: true,
  };
}

/** Adds the page capability to proxy URLs inside a text response. */
export function addTokenToProxyUrls(text: string, token: string): string {
  return text.split('/api/proxy?url=').join(`/api/proxy?t=${token}&url=`);
}

/** Empties every cookie partition of the requesting Aegis session. */
export function clearSessionCookies(req: Request): void {
  const sid = lookupSessionFromCookie(req);
  if (sid) sessions.get(sid)!.jars.clear();
}

// Drop idle sessions and all associated capabilities.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.lastUsed < now - SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
  for (const [token, record] of tokens) {
    if (record.expires <= now || !sessions.has(record.sid)) {
      tokens.delete(token);
      const key = `${record.sid}|${record.contextId}|${record.site}`;
      if (tokenIndex.get(key) === token) tokenIndex.delete(key);
    }
  }
}, 5 * 60 * 1000);
sweeper.unref();
