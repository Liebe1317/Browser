import { createSafeFetcher, readBodyCapped, type SafeResponse } from './ssrf.ts';
import type { AksaVpnStatus } from './aksaVpn.ts';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_FILTER_BYTES = 10 * 1024 * 1024;
const MAX_TIMEOUT_MS = 120_000;
const ALLOWED_REQUEST_HEADERS = new Set(['accept', 'if-none-match', 'if-modified-since']);

export interface AkramFilterListTransportInit {
  method?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
}

export interface AkramFilterListTransportResponse {
  status: number;
  headers: SafeResponse['headers'];
  body: Buffer | null;
}

export interface AkramFilterListTransportResult {
  finalUrl: string;
  response: AkramFilterListTransportResponse;
}

export interface AkramFilterListTransportDependencies {
  /** Test seam. Production uses the guarded Undici fetcher below. */
  safeFetch?: ReturnType<typeof createSafeFetcher>;
  /** Must be the authoritative VPN state from the runtime that owns this fetcher. */
  vpnStatus: () => AksaVpnStatus;
  readBody?: typeof readBodyCapped;
}

function safeFilterHeaders(input: Record<string, string> | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'text/plain, text/*;q=0.9, application/octet-stream;q=0.8',
  };
  for (const [rawName, rawValue] of Object.entries(input || {})) {
    const name = rawName.toLowerCase();
    if (!ALLOWED_REQUEST_HEADERS.has(name) || typeof rawValue !== 'string') continue;
    if (rawValue.length > 2048 || rawValue.includes(String.fromCharCode(10)) || rawValue.includes(String.fromCharCode(13))) {
      throw new TypeError('Filter transport received an invalid request header.');
    }
    headers[name] = rawValue;
  }
  return headers;
}

/**
 * Creates the network fetcher injected into AkramFilterListUpdater.
 *
 * Direct mode uses the same connect-time guarded DNS lookup as server/ssrf.ts. Aksa's current
 * CONNECT proxy does not expose a destination-IP pinning contract, so this transport refuses
 * to run while the server VPN is enabled instead of silently bypassing it or claiming that
 * proxy-side DNS is pinned. Redirects are never followed for filter subscriptions.
 */
export function createAkramFilterListFetcher(
  dependencies: AkramFilterListTransportDependencies = {}
) {
  const vpnStatus = dependencies.vpnStatus;
  if (typeof vpnStatus !== 'function') {
    throw new TypeError('The owning runtime must inject its authoritative Aksa VPN state.');
  }
  const readBody = dependencies.readBody ?? readBodyCapped;
  const guardedFetch = dependencies.safeFetch ?? createSafeFetcher({
    getDispatcher: () => {
      if (vpnStatus().enabled) {
        throw new Error('Filter updates are paused while Aksa VPN is enabled; destination DNS pinning through the CONNECT proxy is not available.');
      }
      return undefined;
    },
  });

  return async function fetchFilterList(
    target: string,
    init: AkramFilterListTransportInit = {}
  ): Promise<AkramFilterListTransportResult> {
    const url = new URL(target);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    ) {
      throw new TypeError('Filter transport accepts HTTPS URLs without credentials or non-standard ports only.');
    }
    if (init.method && init.method.toUpperCase() !== 'GET') {
      throw new TypeError('Filter transport only permits GET requests.');
    }

    // Check before starting work, then check again in the dispatcher's synchronous selection
    // path. If Aksa becomes enabled between these points, the dispatcher guard still fails closed.
    if (vpnStatus().enabled) {
      throw new Error('Filter updates are paused while Aksa VPN is enabled; no direct fallback is permitted.');
    }

    const timeoutMs = init.timeoutMs ?? 20_000;
    const maxBytes = init.maxBytes ?? 5 * 1024 * 1024;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new RangeError('Filter transport timeout is outside the permitted range.');
    }
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_FILTER_BYTES) {
      throw new RangeError('Filter transport byte limit is outside the permitted range.');
    }

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    const { response, finalUrl } = await guardedFetch(
      url,
      { method: 'GET', headers: safeFilterHeaders(init.headers), signal },
      // No redirects are permitted for subscription sources. A redirect response with a
      // Location header is cancelled by safeFetch before it could contact the next hop.
      { maxRedirects: 0, upgradeHttp: false }
    );

    if (finalUrl.href !== url.href || REDIRECT_STATUSES.has(response.status)) {
      await response.body?.cancel().catch(() => {});
      throw new Error('Filter source redirects are not permitted.');
    }

    let body: Buffer | null = null;
    if (response.status === 200) {
      // Read under the same abort signal and enforce the cap while streaming, not after buffering.
      body = await readBody(response, maxBytes);
    } else {
      await response.body?.cancel().catch(() => {});
    }

    return {
      finalUrl: finalUrl.href,
      response: { status: response.status, headers: response.headers, body },
    };
  };
}
