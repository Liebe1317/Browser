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

listeners.completed({ id: 'request-1', statusCode: 200 });
assert.equal(events.length, 2);
assert.equal(events[1].phase, 'completed');
assert.equal(events[1].statusCode, 200);
assert.equal(typeof events[1].duration, 'number');

let blockedResult;
listeners.before({
  id: 'request-2',
  webContentsId: 17,
  url: 'https://doubleclick.net/track.js?campaign=private',
  method: 'GET',
  resourceType: 'script',
}, (result) => { blockedResult = result; });

assert.deepEqual(blockedResult, { cancel: true });
assert.equal(events[2].phase, 'blocked');
assert.equal(events[2].blockedReason, 'shield');
assert.equal(events[2].url, 'https://doubleclick.net/track.js');

console.log('PASS native network request lifecycle and URL redaction');
