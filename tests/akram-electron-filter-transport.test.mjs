'use strict';

import assert from 'node:assert/strict';
import { ReadableStream } from 'node:stream/web';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createElectronFilterListFetcher, guardedLookup, blockedIp } = require('../akram/shield/electron-filter-transport.cjs');

assert.equal(blockedIp('127.0.0.1'), true);
assert.equal(blockedIp('10.1.2.3'), true);
assert.equal(blockedIp('::1'), true);
assert.equal(blockedIp('::ffff:192.168.1.1'), true);
assert.equal(blockedIp('8.8.8.8'), false);
assert.equal(blockedIp('2606:4700:4700::1111'), false);

let enabled = false;
let dispatches = 0;
let captured;
const fetcher = createElectronFilterListFetcher({
  vpnStatus: () => ({ enabled, connected: true }),
  lookup: (_host, _options, callback) => callback(null, '8.8.8.8', 4),
  fetchImpl: async (url, init) => {
    dispatches++;
    captured = { url, init };
    return {
      status: 200,
      headers: new Headers({ 'content-type': 'text/plain' }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('||ads.example^'));
          controller.close();
        },
      }),
    };
  },
});
const result = await fetcher('https://filters.example.test/list.txt', {
  headers: {
    Accept: 'text/plain',
    'If-None-Match': '"v1"',
    Authorization: 'Bearer must-not-leak',
    Cookie: 'session=must-not-leak',
  },
  maxBytes: 1024,
});
assert.equal(result.response.status, 200);
assert.equal(Buffer.from(result.response.body).toString('utf8'), '||ads.example^');
assert.equal(captured.init.redirect, 'manual');
assert.equal(captured.init.headers.accept, 'text/plain');
assert.equal(captured.init.headers['if-none-match'], '"v1"');
assert.equal(captured.init.headers.authorization, undefined);
assert.equal(captured.init.headers.cookie, undefined);
assert.ok(captured.init.dispatcher, 'request uses a guarded Undici dispatcher');

enabled = true;
await assert.rejects(() => fetcher('https://filters.example.test/list.txt'), /VPN is enabled/);
assert.equal(dispatches, 1, 'enabled VPN prevents all direct network dispatch');
await fetcher.close();

const redirectFetcher = createElectronFilterListFetcher({
  vpnStatus: () => ({ enabled: false }),
  lookup: (_host, _options, callback) => callback(null, '8.8.8.8', 4),
  fetchImpl: async () => ({
    status: 302,
    headers: new Headers({ location: 'https://elsewhere.example/list.txt' }),
    body: null,
  }),
});
await assert.rejects(() => redirectFetcher('https://filters.example.test/list.txt'), /redirects are not permitted/);
await redirectFetcher.close();

let oversizedCancelled = false;
const cappedFetcher = createElectronFilterListFetcher({
  vpnStatus: () => ({ enabled: false }),
  lookup: (_host, _options, callback) => callback(null, '8.8.8.8', 4),
  fetchImpl: async () => ({
    status: 200,
    headers: new Headers({ 'content-length': '9' }),
    body: new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('123456789')); },
      cancel() { oversizedCancelled = true; },
    }),
  }),
});
await assert.rejects(() => cappedFetcher('https://filters.example.test/list.txt', { maxBytes: 8 }), /byte limit/);
assert.equal(oversizedCancelled, true);
await cappedFetcher.close();

console.log('PASS - Electron filter transport enforces DNS/IP guards, VPN fail-closed, redirects and byte caps');
