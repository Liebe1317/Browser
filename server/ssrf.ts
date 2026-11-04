/**
 * SSRF protection + safe outbound fetching for the proxy.
 *
 * Three layers:
 *  1. isBlockedUrl(): fast syntactic check (scheme, port, hostname, IP literals incl. IPv6 forms).
 *  2. A connect-time DNS lookup (guardedLookup) that rejects any hostname resolving to a
 *     private/reserved address. Validation happens on the exact address that is connected to,
 *     so DNS-rebinding tricks (resolve public first, private second) don't work.
 *  3. safeFetch(): follows redirects MANUALLY and re-validates every hop.
 */
import dns from 'node:dns';
import net from 'node:net';
import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';
import { getAksaDispatcher } from './aksaVpn.ts';

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

export class BodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Response body exceeds ${maxBytes} bytes`);
    this.name = 'BodyTooLargeError';
  }
}

// ---------------------------------------------------------------- IP checks

const blockList = new net.BlockList();
const v4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local + cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];
for (const [addr, prefix] of v4) blockList.addSubnet(addr, prefix, 'ipv4');

const v6: Array<[string, number]> = [
  ['::', 128],
  ['::1', 128],
  ['100::', 64], // discard-only
  ['2001::', 23], // IETF protocol assignments (incl. Teredo)
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['64:ff9b:1::', 48], // local-use NAT64
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (deprecated)
  ['ff00::', 8], // multicast
];
for (const [addr, prefix] of v6) blockList.addSubnet(addr, prefix, 'ipv6');

/** Parses an IPv6 literal into 8 16-bit groups, or null if malformed. */
function parseIPv6(input: string): number[] | null {
  let ip = input;
  if (ip.includes('%')) return null; // zone ids are never legitimate here
  // embedded dotted IPv4 tail, e.g. ::ffff:127.0.0.1
  const lastColon = ip.lastIndexOf(':');
  const tail = ip.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!net.isIPv4(tail)) return null;
    const o = tail.split('.').map(Number);
    ip = ip.slice(0, lastColon + 1) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const parts = halves.length === 1 ? head : [...head, ...Array(missing).fill('0'), ...rest];
  const groups = parts.map((p) => (/^[0-9a-fA-F]{1,4}$/.test(p) ? parseInt(p, 16) : NaN));
  return groups.some(Number.isNaN) ? null : groups;
}

/** True if the IP is private, reserved, loopback, link-local, multicast, or otherwise not public. */
export function isBlockedIp(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '');
  if (net.isIPv4(clean)) return blockList.check(clean, 'ipv4');
  if (!net.isIPv6(clean)) return true; // not an IP at all -> refuse

  const g = parseIPv6(clean);
  if (!g) return true;

  const embedded = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  const first5Zero = g.slice(0, 5).every((x) => x === 0);
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judge by the embedded IPv4
  if (first5Zero && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0 && g[6] === 0 && g[7] <= 1) return true; // :: and ::1
    return blockList.check(embedded(g[6], g[7]), 'ipv4');
  }
  // NAT64 well-known prefix 64:ff9b::/96 -> embedded IPv4
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return blockList.check(embedded(g[6], g[7]), 'ipv4');
  }
  return blockList.check(clean, 'ipv6');
}

// ------------------------------------------------------------ URL checks

const BLOCKED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110,
  111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3306, 3389, 5060, 5061, 5432,
  5900, 6000, 6379, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 9200, 10080, 11211, 27017,
]);

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.home.arpa', '.lan', '.intranet', '.corp'];

export function isBlockedHostname(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return true;
  if (net.isIP(host)) return isBlockedIp(host);
  if (host === 'localhost') return true;
  if (!host.includes('.')) return true; // single-label names resolve via the host's search domains
  return BLOCKED_SUFFIXES.some((s) => host.endsWith(s));
}

/** Syntactic check only (no DNS). The connect-time lookup covers hostnames that resolve to private IPs. */
export function isBlockedUrl(input: string | URL): boolean {
  try {
    const u = typeof input === 'string' ? new URL(input) : input;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
    if (u.username || u.password) return true; // credentials in URLs are a classic parser-confusion vector
    if (u.port && BLOCKED_PORTS.has(Number(u.port))) return true;
    return isBlockedHostname(u.hostname);
  } catch {
    return true;
  }
}

// ----------------------------------------------------------- DNS guarding

/** DNS lookup used for every outbound connection: refuses hostnames that resolve to non-public IPs. */
export function guardedLookup(
  hostname: string,
  options: any,
  callback: (err: Error | null, address?: any, family?: number) => void
): void {
  const opts = typeof options === 'object' && options ? options : {};
  dns.lookup(hostname, { family: opts.family, hints: opts.hints, all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0) return callback(new Error(`No DNS records for ${hostname}`));
    const bad = list.find((a) => isBlockedIp(a.address));
    if (bad) return callback(new SsrfBlockedError(`${hostname} resolves to a non-public address`));
    if (opts.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

// ------------------------------------------------------------- safe fetch

export interface SafeFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  signal?: AbortSignal;
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  /** Rewrite http:// to https:// on every hop (privacy-first default for the proxy). */
  upgradeHttp?: boolean;
  /** Extra headers computed per hop (e.g. per-host Cookie/Referer). */
  headersFor?: (url: URL) => Record<string, string>;
  /** Called for every response, including intermediate redirects (e.g. to store Set-Cookie). */
  onResponse?: (url: URL, response: Awaited<ReturnType<typeof undiciFetch>>) => void;
}

export type SafeResponse = Awaited<ReturnType<typeof undiciFetch>>;

export interface SafeFetcherConfig {
  /** Overridable for tests only. */
  lookup?: typeof guardedLookup;
  isBlockedUrl?: (u: URL) => boolean;
  /** Optional browser-scoped VPN dispatcher. It must fail closed; never fall back to direct fetch. */
  getDispatcher?: () => Dispatcher | undefined;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Only browser presentation headers may cross an origin-changing redirect.
// CSRF, authorization, cookies, content metadata and custom headers are origin-bound.
const SAFE_REDIRECT_HEADERS = new Set([
  'accept',
  'accept-language',
  'user-agent',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'upgrade-insecure-requests',
  'dnt',
  'sec-gpc',
]);

export function createSafeFetcher(config: SafeFetcherConfig = {}) {
  const urlBlocked = config.isBlockedUrl ?? isBlockedUrl;
  const agent = new Agent({
    connect: { lookup: (config.lookup ?? guardedLookup) as any, timeout: 10_000 },
    headersTimeout: 20_000,
    bodyTimeout: 30_000,
  });

  return async function safeFetch(
    start: string | URL,
    init: SafeFetchInit = {},
    opts: SafeFetchOptions = {}
  ): Promise<{ response: SafeResponse; finalUrl: URL }> {
    const maxRedirects = opts.maxRedirects ?? 5;
    let url = new URL(start.toString());
    let method = (init.method ?? 'GET').toUpperCase();
    let body = init.body;
    let baseHeaders = { ...(init.headers ?? {}) };

    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (opts.upgradeHttp && url.protocol === 'http:') url.protocol = 'https:';
      if (urlBlocked(url)) throw new SsrfBlockedError(`Blocked target: ${url.hostname}`);

      const response = await undiciFetch(url, {
        method,
        headers: { ...baseHeaders, ...(opts.headersFor?.(url) ?? {}) },
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        signal: init.signal,
        redirect: 'manual',
        dispatcher: config.getDispatcher?.() ?? agent,
      });
      opts.onResponse?.(url, response);

      const location = response.headers.get('location');
      if (!REDIRECT_STATUSES.has(response.status) || !location) {
        return { response, finalUrl: url };
      }

      await response.body?.cancel().catch(() => {});
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new Error('Invalid redirect location');
      }

      // Never forward site-bound or custom headers to a different origin after redirect.
      if (next.origin !== url.origin) {
        baseHeaders = Object.fromEntries(
          Object.entries(baseHeaders).filter(([name]) => SAFE_REDIRECT_HEADERS.has(name.toLowerCase()))
        );
      }

      // Per the Fetch spec: 303 (and 301/302 after POST) become GET without a body
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
        if (method !== 'HEAD') method = 'GET';
        body = undefined;
        baseHeaders = Object.fromEntries(
          Object.entries(baseHeaders).filter(([k]) => !/^content-(type|length)$/i.test(k))
        );
      }
      url = next;
    }
    throw new Error('Too many redirects');
  };
}

export const safeFetch = createSafeFetcher({ getDispatcher: getAksaDispatcher });

/** Reads a response body but aborts if it exceeds `maxBytes` (protects server memory). */
export async function readBodyCapped(response: SafeResponse, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new BodyTooLargeError(maxBytes);
  }
  if (!response.body) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
