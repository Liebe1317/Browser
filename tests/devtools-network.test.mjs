import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createBrowserSessionPolicy } = require('../electron/session-policy.cjs');

const listeners = {};
const events = [];
const browserSession = {
  setProxy: async () => {},
  webRequest: {
    onBeforeRequest: (_filter, listener) => { listeners.before = listener; },
    onCompleted: (_filter, listener) => { listeners.completed = listener; },
    onErrorOccurred: (_filter, listener) => { listeners.failed = listener; },
  },
  setPermissionRequestHandler() {},
  setPermissionCheckHandler() {},
  on() {},
};

const policy = createBrowserSessionPolicy({
  getVpnState: () => ({ enabled: false, connected: true }),
  isAppRequest: () => false,
  onNetworkEvent: (event) => events.push(event),
});

policy.register(browserSession);

const token = 'a'.repeat(40);
let beforeResult;
listeners.before({
  id: 'request-1',
  webContentsId: 17,
  url: `https://example.com/watch/${token}/sources?csrf=must-not-appear#fragment`,
  method: 'POST',
  resourceType: 'xhr',
}, (result) => { beforeResult = result; });

assert.deepEqual(beforeResult, {});
assert.equal(events.length, 1);
assert.equal(events[0].phase, 'started');
assert.equal(events[0].url, 'https://example.com/watch/[redacted]/sources');
assert.equal(events[0].method, 'POST');
assert.equal(events[0].resourceType, 'xhr');
assert.equal(JSON.stringify(events).includes(token), false);
assert.equal(JSON.stringify(events).includes('csrf'), false);
const shortToken = '0123456789abcdef';
let shortTokenResult;
listeners.before({
  id: 'request-short-token',
  webContentsId: 17,
  url: `https://example.com/api/${shortToken}/data?access_token=hidden`,
  method: 'GET',
  resourceType: 'fetch',
}, (result) => { shortTokenResult = result; });
assert.deepEqual(shortTokenResult, {});
assert.equal(events.at(-1).url, 'https://example.com/api/[redacted]/data');
assert.equal(JSON.stringify(events).includes(shortToken), false);
assert.equal(JSON.stringify(events).includes('access_token'), false);


listeners.completed({ id: 'request-1', statusCode: 200 });
assert.equal(events.length, 3);
assert.equal(events[2].phase, 'completed');
assert.equal(events[2].statusCode, 200);
assert.equal(typeof events[2].duration, 'number');

// Electron's real WebRequestDetails.id is numeric. Normalize it before it
// reaches site-view-manager, whose renderer boundary accepts string IDs only.
let numericBeforeResult;
listeners.before({
  id: 314159,
  webContentsId: 17,
  url: 'https://example.com/api/data',
  method: 'GET',
  resourceType: 'fetch',
}, (result) => { numericBeforeResult = result; });
assert.deepEqual(numericBeforeResult, {});
assert.equal(events.at(-1).requestId, '314159');
listeners.completed({ id: 314159, statusCode: 204 });
assert.equal(events.at(-1).phase, 'completed');
assert.equal(events.at(-1).requestId, '314159');
assert.equal(events.at(-1).statusCode, 204);

let blockedResult;
listeners.before({
  id: 'request-2',
  webContentsId: 17,
  url: 'https://doubleclick.net/track.js?campaign=private',
  method: 'GET',
  resourceType: 'script',
}, (result) => { blockedResult = result; });

assert.deepEqual(blockedResult, { cancel: true });
assert.equal(events[5].phase, 'blocked');
assert.equal(events[5].blockedReason, 'shield');
assert.equal(events[5].url, 'https://doubleclick.net/track.js');

console.log('PASS native network request lifecycle and URL redaction');
