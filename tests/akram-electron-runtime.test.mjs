'use strict';

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { AkramShieldManager } = require('../akram/core/shield-manager.cjs');
const { createAkramElectronShieldRuntime } = require('../akram/shield/electron-runtime.cjs');

const manager = new AkramShieldManager();
let vpnEnabled = false;
let dispatched = 0;
let closed = false;
const runtime = createAkramElectronShieldRuntime({
  manager,
  vpnStatus: () => ({ enabled: vpnEnabled, connected: !vpnEnabled }),
  fetcherFactory: () => {
    const fetcher = async (url) => {
      dispatched++;
      return {
        finalUrl: url,
        response: {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8', etag: '"test-v1"' },
          body: Buffer.from('||runtime-ad.example^$script'),
        },
      };
    };
    fetcher.abortAll = () => {};
    fetcher.close = async () => { closed = true; };
    return fetcher;
  },
});

const initial = runtime.getState();
assert.deepEqual(initial.sources.map((source) => source.id), ['easylist', 'easyprivacy']);
assert.equal(initial.stats.filterListCount, 0, 'source registration does not silently activate downloaded rules');
const updated = await runtime.update('easylist');
assert.equal(updated.status, 'updated');
assert.equal(dispatched, 1);
assert.equal(
  manager.evaluateRequest({ url: 'https://runtime-ad.example/script.js', resourceType: 'script' }).action,
  'block',
  'runtime updater activates rules in the same manager Chromium consumes',
);
assert.equal(runtime.getState().activeLists.length, 1);

vpnEnabled = true;
await assert.rejects(() => runtime.update('easyprivacy'), /VPN is enabled/);
assert.equal(dispatched, 1, 'VPN-enabled state never reaches the direct fetcher');
runtime.abortAll();
await runtime.close();
assert.equal(closed, true);

console.log('PASS - Electron Shield runtime wires updater to Chromium manager and honors authoritative VPN state');
