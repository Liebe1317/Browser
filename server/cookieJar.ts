/**
 * Bounded cookie store for one Aegis browsing-context + top-level-host partition.
 * Security attributes are retained and enforced when cookies are accepted and sent.
 */
import net from 'node:net';
import { getDomain } from 'tldts';

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  hostOnly: boolean;
  path: string;
  expires: number | null;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none' | null;
}

export interface CookieRequestContext {
  /** Exact hostname of the top-level page whose partition owns this jar. */
  topLevelHost?: string;
}

const MAX_COOKIE_BYTES = 4096;
const MAX_COOKIES_PER_JAR = 500;
const MAX_LIFETIME_MS = 400 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function domainMatches(host: string, domain: string, hostOnly: boolean): boolean {
  if (host === domain) return true;
  return !hostOnly && host.endsWith('.' + domain);
}

function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/';
}

function defaultPath(requestPath: string): string {
  if (!requestPath.startsWith('/')) return '/';
  const idx = requestPath.lastIndexOf('/');
  return idx <= 0 ? '/' : requestPath.slice(0, idx);
}

function isPublicSuffix(domain: string): boolean {
  if (!domain || net.isIP(domain) !== 0) return true;
  return getDomain(domain, { allowPrivateDomains: true }) === null;
}

export class CookieJar {
  private cookies = new Map<string, StoredCookie>();

  get size(): number {
    return this.cookies.size;
  }

  clear(): void {
    this.cookies.clear();
  }

  /** Stores separate Set-Cookie response headers from the given upstream URL. */
  setFromResponse(requestUrl: URL, setCookieHeaders: string[], now: number = Date.now()): void {
    const host = requestUrl.hostname.toLowerCase().replace(/\.$/, '');
    const secureTransport = requestUrl.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1' || host === '::1';
    for (const header of setCookieHeaders) {
      this.storeOne(host, requestUrl.pathname, header, secureTransport, now);
    }
  }

  private storeOne(host: string, requestPath: string, header: string, secureTransport: boolean, now: number): void {
    if (header.length > MAX_COOKIE_BYTES) return;

    const parts = header.split(';');
    const first = parts.shift() ?? '';
    const eq = first.indexOf('=');
    if (eq <= 0) return;

    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!COOKIE_NAME.test(name) || /[\u0000-\u001f\u007f;]/.test(value)) return;

    let domainAttr: string | null = null;
    let pathAttr: string | null = null;
    let expires: number | null = null;
    let maxAge: number | null = null;
    let secure = false;
    let httpOnly = false;
    let sameSite: StoredCookie['sameSite'] = null;

    for (const raw of parts) {
      const i = raw.indexOf('=');
      const key = (i === -1 ? raw : raw.slice(0, i)).trim().toLowerCase();
      const val = i === -1 ? '' : raw.slice(i + 1).trim();
      if (key === 'domain') domainAttr = val.replace(/^\.+/, '').toLowerCase();
      else if (key === 'path') pathAttr = val;
      else if (key === 'expires') {
        const timestamp = Date.parse(val);
        if (!Number.isNaN(timestamp)) expires = timestamp;
      } else if (key === 'max-age') {
        if (/^-?\d+$/.test(val)) maxAge = Number.parseInt(val, 10);
      } else if (key === 'secure') secure = true;
      else if (key === 'httponly') httpOnly = true;
      else if (key === 'samesite') {
        const normalized = val.toLowerCase();
        if (normalized === 'strict' || normalized === 'lax' || normalized === 'none') sameSite = normalized;
      }
    }

    // Secure cookies must originate from a secure transport.
    if (secure && !secureTransport) return;
    if (sameSite === 'none' && !secure) return;

    let domain = host;
    let hostOnly = true;
    if (domainAttr !== null) {
      const covers = host === domainAttr || host.endsWith('.' + domainAttr);
      if (!covers || isPublicSuffix(domainAttr)) return;
      domain = domainAttr;
      hostOnly = false;
    }

    const path = pathAttr && pathAttr.startsWith('/') ? pathAttr : defaultPath(requestPath);

    // Enforce the cookie-prefix contracts before storing the cookie.
    if (name.startsWith('__Secure-') && !secure) return;
    if (
      name.startsWith('__Host-') &&
      (!secure || domainAttr !== null || path !== '/' || !hostOnly)
    ) return;

    // Max-Age takes precedence over Expires.
    if (maxAge !== null) {
      expires = now + Math.max(-1, Math.min(maxAge, MAX_LIFETIME_MS / 1000)) * 1000;
    }
    if (expires !== null) expires = Math.min(expires, now + MAX_LIFETIME_MS);

    const key = `${domain}|${path}|${name}`;
    if (expires !== null && expires <= now) {
      this.cookies.delete(key);
      return;
    }

    this.cookies.delete(key);
    this.cookies.set(key, { name, value, domain, hostOnly, path, expires, secure, httpOnly, sameSite });

    while (this.cookies.size > MAX_COOKIES_PER_JAR) {
      const oldest = this.cookies.keys().next().value;
      if (oldest === undefined) break;
      this.cookies.delete(oldest);
    }
  }

  /** Builds a Cookie header while enforcing Secure and SameSite restrictions. */
  headerFor(
    requestUrl: URL,
    now: number = Date.now(),
    context: CookieRequestContext = {}
  ): string {
    const host = requestUrl.hostname.toLowerCase().replace(/\.$/, '');
    const topLevelHost = (context.topLevelHost ?? host).toLowerCase().replace(/\.$/, '');
    const secureTransport = requestUrl.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const matched: StoredCookie[] = [];

    for (const [key, cookie] of this.cookies) {
      if (cookie.expires !== null && cookie.expires <= now) {
        this.cookies.delete(key);
        continue;
      }
      if (cookie.secure && !secureTransport) continue;
      if (!domainMatches(host, cookie.domain, cookie.hostOnly)) continue;
      if (!pathMatches(requestUrl.pathname, cookie.path)) continue;

      // Aegis intentionally applies a stricter host boundary than browser SameSite's eTLD+1
      // rule. Strict/Lax cookies are never sent to sibling hosts through the proxy.
      if (cookie.sameSite !== 'none' && host !== topLevelHost) continue;
      matched.push(cookie);
    }

    matched.sort((a, b) => b.path.length - a.path.length);
    return matched.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  }
}
