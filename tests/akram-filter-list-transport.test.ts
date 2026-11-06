import assert from 'node:assert/strict';
import { ReadableStream } from 'node:stream/web';
import { BodyTooLargeError } from '../server/ssrf.ts';
import { createAkramFilterListFetcher } from '../server/akramFilterListTransport.ts';

function response(status: number, headers: Record<string, string> = {}, body: Uint8Array | string | null = null) {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  let cancelled = false;
  const stream = bytes
    ? new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(bytes); controller.close(); },
        cancel() { cancelled = true; },
      })
    : null;
  return {
    status,
    headers: new Headers(headers),
    body: stream,
    wasCancelled: () => cancelled,
  };
}

const target = 'https://filters.example.test/easylist.txt';
let captured: any = null;
const okResponse = response(200, { 'content-type': 'text/plain', etag: '"v2"' }, '||ads.example^');
const fetcher = createAkramFilterListFetcher({
  vpnStatus: () => ({ enabled: false } as any),
  safeFetch: async (url: any, init: any, options: any) => {
    captured = { url, init, options };
    return { response: okResponse as any, finalUrl: new URL(url) };
  },
});
const result = await fetcher(target, {
  method: 'GET',
  headers: {
    Accept: 'text/plain',
    'If-None-Match': '"v1"',
    Authorization: 'Bearer must-not-leak',
    Cookie: 'session=must-not-leak',
    'X-Custom': 'must-not-leak',
  },
  timeoutMs: 5000,
  maxRedirects: 3,
  maxBytes: 1024,
});
assert.equal(result.finalUrl, target);
assert.equal(result.response.status, 200);
assert.equal(Buffer.from(result.response.body!).toString('utf8'), '||ads.example^');
assert.equal(captured.options.maxRedirects, 0, 'filter subscriptions never follow redirects');
assert.equal(captured.options.upgradeHttp, false, 'HTTPS is never rewritten or downgraded');
assert.equal(captured.init.method, 'GET');
assert.equal(captured.init.headers.accept, 'text/plain');
assert.equal(captured.init.headers['if-none-match'], '"v1"');
assert.equal(captured.init.headers.authorization, undefined, 'authorization is never sent');
assert.equal(captured.init.headers.cookie, undefined, 'cookies are never sent');
assert.equal(captured.init.headers['x-custom'], undefined, 'custom headers are never sent');
assert.ok(captured.init.signal instanceof AbortSignal, 'request receives a timeout/abort signal');
console.log('PASS - filter transport pins requests to one HTTPS source and strips credential headers');

let callsWhileVpnEnabled = 0;
const vpnBlocked = createAkramFilterListFetcher({
  vpnStatus: () => ({ enabled: true, connected: true } as any),
  safeFetch: async () => { callsWhileVpnEnabled++; throw new Error('must not be called'); },
});
await assert.rejects(() => vpnBlocked(target), /Aksa VPN is enabled/);
assert.equal(callsWhileVpnEnabled, 0, 'VPN-enabled updates fail closed before network dispatch');
console.log('PASS - filter transport never falls back directly while Aksa VPN is enabled');

const redirected = response(302, { location: 'https://other.example/list.txt' }, 'redirect');
const redirectFetcher = createAkramFilterListFetcher({
  vpnStatus: () => ({ enabled: false } as any),
  safeFetch: async (url: any) => ({ response: redirected as any, finalUrl: new URL(url) }),
});
await assert.rejects(() => redirectFetcher(target), /redirects are not permitted/);
assert.equal(redirected.wasCancelled(), true, 'redirect response body is cancelled');
console.log('PASS - redirect responses are rejected and cancelled');

const notModified = response(304, { etag: '"v2"' }, 'unused');
const conditionalFetcher = createAkramFilterListFetcher({
  vpnStatus: () => ({ enabled: false } as any),
  safeFetch: async (url: any) => ({ response: notModified as any, finalUrl: new URL(url) }),
});
const unchanged = await conditionalFetcher(target);
assert.equal(unchanged.response.status, 304);
assert.equal(unchanged.response.body, null, '304 response body is not consumed');
console.log('PASS - 304 responses preserve conditional-update semantics');

const oversized = response(200, { 'content-length': '9' }, '123456789');
const cappedFetcher = createAkramFilterListFetcher({
  vpnStatus: () => ({ enabled: false } as any),
  safeFetch: async (url: any) => ({ response: oversized as any, finalUrl: new URL(url) }),
});
await assert.rejects(() => cappedFetcher(target, { maxBytes: 8 }), BodyTooLargeError);
console.log('PASS - streamed filter response is capped before updater activation');

const timeoutFetcher = createAkramFilterListFetcher({
  vpnStatus: () => ({ enabled: false } as any),
  safeFetch: async (_url: any, init: any) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  }),
});
await assert.rejects(() => timeoutFetcher(target, { timeoutMs: 5 }), /timeout/i);
console.log('PASS - filter transport aborts stalled requests at the configured timeout');

await assert.rejects(() => fetcher('http://filters.example.test/list.txt'), /HTTPS URLs/);
await assert.rejects(() => fetcher('https://user:pass@filters.example.test/list.txt'), /HTTPS URLs/);
await assert.rejects(() => fetcher('https://filters.example.test:8443/list.txt'), /HTTPS URLs/);
await assert.rejects(() => fetcher(target, { method: 'POST' }), /only permits GET/);
console.log('PASS - filter transport rejects unsafe URL and method variants');
