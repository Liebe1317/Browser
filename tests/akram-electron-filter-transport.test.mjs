'use strict';

import assert from 'node:assert/strict';
import { ReadableStream } from 'node:stream/web';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createElectronFilterListFetcher, createGuardedLookup, blockedIp } = require('../akram/shield/electron-filter-transport.cjs');

assert.equal(blockedIp('127.0.0.1'), true);
assert.equal(blockedIp('10.1.2.3'), true);
assert.equal(blockedIp('::1'), true);
assert.equal(blockedIp('::ffff:192.168.1.1'), true);
assert.equal(blockedIp('8.8.8.8'), false);
assert.equal(blockedIp('2606:4700:4700::1111'), false);
assert.equal(blockedIp('::8.8.8.8'), true, 'IPv4-compatible IPv6 forms are blocked');
assert.equal(blockedIp('64:ff9b::808:808'), true, 'NAT64 literals are conservatively blocked');

const rebindingLookup = createGuardedLookup((_hostname, _options, callback) => {
  callback(null, [
    { address: '8.8.8.8', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]);
});
await new Promise((resolve) => {
  rebindingLookup('filters.example.test', {}, (error) => {
    assert.ok(error, 'a mixed public/private DNS answer must be rejected');
    resolve();
  });
});
const pinnedLookup = createGuardedLookup((_hostname, _options, callback) => {
  callback(null, [
    { address: '8.8.8.8', family: 4 },
    { address: '1.1.1.1', family: 4 },
  ]);
});
await new Promise((resolve, reject) => {
  pinnedLookup('filters.example.test', {}, (error, address, family) => {
    if (error) return reject(error);
    assert.equal(address, '8.8.8.8', 'the socket receives the already-validated address');
    assert.equal(family, 4);
    resolve();
  });
});
console.log('PASS - DNS rebinding guard rejects mixed public/private answers and pins the validated socket address');


let dispatches = 0;
let captured;
const fetcher = createElectronFilterListFetcher({
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

await fetcher('https://filters.example.test/list.txt');
assert.equal(dispatches, 2, 'filter transport operates independently of VPN state');
await fetcher.close();

const redirectFetcher = createElectronFilterListFetcher({
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

console.log('PASS - Electron filter transport enforces DNS/IP guards, redirects and byte caps');

const stalledFetcher = createElectronFilterListFetcher({
  vpnStatus: () => ({ enabled: false }),
  lookup: (_host, _options, callback) => callback(null, '8.8.8.8', 4),
  fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  }),
});
const stalled = stalledFetcher('https://filters.example.test/stalled.txt');
await new Promise((resolve) => setImmediate(resolve));
stalledFetcher.abortAll(new Error('Shield transport shutdown'));
await assert.rejects(() => stalled, /Shield transport shutdown/);
await stalledFetcher.close();
console.log('PASS - Shield transport can abort an in-flight request');

