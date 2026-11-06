import { createRequire } from 'node:module';
import { ReadableStream } from 'node:stream/web';
const require = createRequire(import.meta.url);
const { AkramShieldManager } = require('../akram/core/shield-manager.cjs');
const { AkramFilterListUpdater } = require('../akram/shield/filter-list-updater.cjs');

const checks = [];
function check(value, label) {
  checks.push([!!value, label]);
  console.log((value ? 'PASS' : 'FAIL') + ' - ' + label);
}
const host = 'filters.example.test';
const url = `https://${host}/easylist.txt`;
let responseBody = '||ads.remote.example^$script\nremote.example##.sponsored';
let responseStatus = 200;
let responseHeaders = { 'content-type': 'text/plain; charset=utf-8', etag: '"v1"' };
let finalUrl = url;
const fetchCalls = [];
const manager = new AkramShieldManager();
const updater = new AkramFilterListUpdater({
  manager, allowedHosts: [host], limits: { maxBytes: 128 },
  fetcher: async (target, init) => {
    fetchCalls.push({ target, init });
    return {
      finalUrl,
      response: {
        status: responseStatus,
        headers: responseHeaders,
        body: new ReadableStream({
          start(controller) {
            const bytes = responseBody instanceof Uint8Array ? responseBody : new TextEncoder().encode(responseBody);
            controller.enqueue(bytes);
            controller.close();
          },
        }),
      },
    };
  },
});
updater.registerSource({ id: 'community', url });
let result = await updater.update('community');
check(result.status === 'updated', 'valid remote filter list is fetched and activated');
check(manager.evaluateRequest({ url: 'https://ads.remote.example/ad.js', resourceType: 'script' }).action === 'block', 'validated network rules reach the central Shield Manager');
check(manager.getCosmeticCss('https://remote.example/').includes('.sponsored'), 'validated cosmetic rules reach the central Shield Manager');
check(result.metadata.sha256.length === 64 && result.metadata.byteLength > 0, 'metadata records a SHA-256 content digest and byte count');
check(fetchCalls[0].init.maxRedirects === 3 && fetchCalls[0].init.maxBytes === 128, 'transport receives explicit redirect and response-size limits');

responseStatus = 304;
responseBody = '';
responseHeaders = { 'content-type': 'text/plain', etag: '"v1"' };
result = await updater.update('community');
check(result.status === 'not-modified', '304 keeps the previously validated list without replacing it');
check(manager.evaluateRequest({ url: 'https://ads.remote.example/ad.js', resourceType: 'script' }).action === 'block', '304 leaves active rules unchanged');
check(fetchCalls.at(-1).init.headers['If-None-Match'] === '"v1"', 'ETag is sent for conditional updates');

async function rejected(label, mutate) {
  const before = manager.evaluateRequest({ url: 'https://ads.remote.example/ad.js', resourceType: 'script' }).action;
  // Each rejection case is an HTTP 200 validation case; do not inherit the prior 304.
  responseStatus = 200;
  mutate();
  let failed = false;
  try { await updater.update('community'); } catch { failed = true; }
  check(failed, label + ' is rejected');
  check(manager.evaluateRequest({ url: 'https://ads.remote.example/ad.js', resourceType: 'script' }).action === before, label + ' leaves the active policy unchanged');
  responseStatus = 200;
  responseHeaders = { 'content-type': 'text/plain', etag: '"v1"' };
  responseBody = '||ads.remote.example^$script\nremote.example##.sponsored';
  finalUrl = url;
}
await rejected('empty list', () => { responseBody = '  \n! comments only'; });
await rejected('malformed unsupported-only list', () => { responseBody = 'this is not a supported rule'; });
await rejected('non-text content type', () => { responseHeaders = { 'content-type': 'application/json' }; });
await rejected('invalid UTF-8', () => { responseBody = new Uint8Array([0xc3, 0x28]); });
await rejected('oversized streamed body', () => { responseBody = 'x'.repeat(200); });
await rejected('cross-origin redirect', () => { finalUrl = 'https://evil.example/steal.txt'; });
await rejected('HTTP downgrade', () => { finalUrl = 'http://filters.example.test/easylist.txt'; });

manager.setFilterListEnabled('community', false);
responseBody = '||updated.remote.example^$script';
result = await updater.update('community');
check(result.metadata.enabled === false, 'updating an already-disabled list preserves its disabled state');
check(manager.evaluateRequest({ url: 'https://updated.remote.example/ad.js', resourceType: 'script' }).action === 'allow', 'new rules from a disabled list stay out of the active policy');
manager.setFilterListEnabled('community', true);
check(manager.evaluateRequest({ url: 'https://updated.remote.example/ad.js', resourceType: 'script' }).action === 'block', 're-enabling the updated list activates its validated rules');

const strict = new AkramFilterListUpdater({
  manager: new AkramShieldManager(), allowedHosts: [host],
  fetcher: async () => ({ finalUrl: url, response: { status: 200, headers: { 'content-type': 'text/plain' }, body: '||ok.example^' } }),
});
let unsafeSourceRejected = false;
try { strict.registerSource({ id: 'bad', url: 'http://filters.example.test/list.txt' }); } catch { unsafeSourceRejected = true; }
check(unsafeSourceRejected, 'HTTP filter sources are rejected before transport');
let untrustedHostRejected = false;
try { strict.registerSource({ id: 'bad-host', url: 'https://evil.example/list.txt' }); } catch { untrustedHostRejected = true; }
check(untrustedHostRejected, 'unallowlisted source hosts are rejected before transport');

let duplicateInFlightRelease;
const pending = new AkramFilterListUpdater({
  manager: new AkramShieldManager(), allowedHosts: [host],
  fetcher: () => new Promise((resolve) => { duplicateInFlightRelease = resolve; }),
});
pending.registerSource({ id: 'pending', url });
const first = pending.update('pending');
let concurrentRejected = false;
try { await pending.update('pending'); } catch { concurrentRejected = true; }
check(concurrentRejected, 'concurrent updates for one source are rejected');
duplicateInFlightRelease({ finalUrl: url, response: { status: 200, headers: { 'content-type': 'text/plain' }, body: '||pending.example^' } });
await first;

const rollbackManager = new AkramShieldManager();
const rollbackUpdater = new AkramFilterListUpdater({
  manager: rollbackManager, allowedHosts: [host],
  fetcher: async () => ({ finalUrl: url, response: { status: 200, headers: { 'content-type': 'text/plain' }, body: '||stable.example^' } }),
});
rollbackUpdater.registerSource({ id: 'rollback', url });
await rollbackUpdater.update('rollback');
rollbackManager.updateFilterList = () => { throw new Error('simulated activation failure'); };
let activationFailed = false;
try { await rollbackUpdater.update('rollback'); } catch { activationFailed = true; }
check(activationFailed && rollbackManager.evaluateRequest({ url: 'https://stable.example/a' }).action === 'block', 'failed manager activation preserves the old live policy');

if (checks.some(([ok]) => !ok)) process.exitCode = 1;
