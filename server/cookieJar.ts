/**
 * Minimal RFC 6265-style cookie jar, used by the proxy on behalf of ONE browser session.
 * Each session gets its own jar (see sessions.ts) so cookies never leak between users.
 *
 * Known limitation: there is no Public Suffix List, so a site could set a cookie for a
 * multi-part suffix like "co.uk" inside its own session's jar. Add `tldts`/`psl` if needed.
 */

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  hostOnly: boolean;
  path: string;
  expires: number | null; // epoch ms, null = session cookie
}

const MAX_COOKIE_BYTES = 4096;
const MAX_COOKIES_PER_JAR = 500;
const MAX_LIFETIME_MS = 400 * 24 * 60 * 60 * 1000;

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

export class CookieJar {
  private cookies = new Map<string, StoredCookie>(); // key: domain|path|name

  get size(): number {
    return this.cookies.size;
  }

  clear(): void {
    this.cookies.clear();
  }

  /** Stores cookies from the Set-Cookie headers of a response to `requestUrl`. */
  setFromResponse(requestUrl: URL, setCookieHeaders: string[], now: number = Date.now()): void {
    const host = requestUrl.hostname.toLowerCase();
    for (const header of setCookieHeaders) {
      this.storeOne(host, requestUrl.pathname, header, now);
    }
  }

  private storeOne(host: string, requestPath: string, header: string, now: number): void {
    if (header.length > MAX_COOKIE_BYTES) return;
    const parts = header.split(';');
    const first = parts.shift() ?? '';
    const eq = first.indexOf('=');
    if (eq <= 0) return;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!name) return;

    let domainAttr: string | null = null;
    let pathAttr: string | null = null;
    let expires: number | null = null;
    let maxAge: number | null = null;

    for (const raw of parts) {
      const i = raw.indexOf('=');
      const key = (i === -1 ? raw : raw.slice(0, i)).trim().toLowerCase();
      const val = i === -1 ? '' : raw.slice(i + 1).trim();
      if (key === 'domain') domainAttr = val.replace(/^\./, '').toLowerCase();
      else if (key === 'path') pathAttr = val;
      else if (key === 'expires') {
        const t = Date.parse(val);
        if (!Number.isNaN(t)) expires = t;
      } else if (key === 'max-age') {
        if (/^-?\d+$/.test(val)) maxAge = parseInt(val, 10);
      }
    }

    // Domain attribute must cover the request host and must not be a bare TLD / single label.
    let domain = host;
    let hostOnly = true;
    if (domainAttr) {
      const covers = host === domainAttr || host.endsWith('.' + domainAttr);
      if (!covers || !domainAttr.includes('.')) return;
      domain = domainAttr;
      hostOnly = false;
    }

    const path = pathAttr && pathAttr.startsWith('/') ? pathAttr : defaultPath(requestPath);

    // Cookie name prefixes (the proxy always talks https upstream, so Secure is satisfied)
    if (name.startsWith('__Host-') && (domainAttr || path !== '/')) return;

    // Max-Age wins over Expires
    if (maxAge !== null) expires = now + maxAge * 1000;
    if (expires !== null) expires = Math.min(expires, now + MAX_LIFETIME_MS);

    const key = `${domain}|${path}|${name}`;
    if (expires !== null && expires <= now) {
      this.cookies.delete(key); // expired/deleted by the server (e.g. logout)
      return;
    }

    this.cookies.delete(key); // re-insert so insertion order = recency
    this.cookies.set(key, { name, value, domain, hostOnly, path, expires });

    while (this.cookies.size > MAX_COOKIES_PER_JAR) {
      const oldest = this.cookies.keys().next().value;
      if (oldest === undefined) break;
      this.cookies.delete(oldest);
    }
  }

  /** Builds the Cookie header value for a request to `requestUrl` ('' if none apply). */
  headerFor(requestUrl: URL, now: number = Date.now()): string {
    const host = requestUrl.hostname.toLowerCase();
    const matched: StoredCookie[] = [];

    for (const [key, c] of this.cookies) {
      if (c.expires !== null && c.expires <= now) {
        this.cookies.delete(key);
        continue;
      }
      if (domainMatches(host, c.domain, c.hostOnly) && pathMatches(requestUrl.pathname, c.path)) {
        matched.push(c);
      }
    }
    // Longer paths first (stable, so older cookies stay first among equals)
    matched.sort((a, b) => b.path.length - a.path.length);
    return matched.map((c) => `${c.name}=${c.value}`).join('; ');
  }
}
