'use strict';

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { AkramFilterListUpdater } from '../akram/shield/filter-list-updater.cjs';

const require = createRequire(import.meta.url);
const {
  getShieldManager,
  isBlockedAdOrTracker,
  getShieldStats,
} = require('../electron/session-policy.cjs');

const manager = getShieldManager();
assert.ok(manager, 'Electron session policy exposes its central Shield Manager');
assert.equal(typeof manager.updateFilterList, 'function');

const sourceUrl = 'https://filters.example.test/akram-test.txt';
const updater = new AkramFilterListUpdater({
  manager,
  allowedHosts: ['filters.example.test'],
  fetcher: async (url) => ({
    finalUrl: url,
    response: {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: '||integration-ad.example^$script',
    },
  }),
});

updater.registerSource({ id: 'runtime-integration', url: sourceUrl });
const result = await updater.update('runtime-integration');

assert.equal(result.status, 'updated');
assert.equal(
  isBlockedAdOrTracker('https://integration-ad.example/asset.js', { resourceType: 'script' }),
  true,
  'a list activated by the updater is immediately enforced by Electron request policy',
);
assert.equal(
  manager.evaluateRequest({ url: 'https://integration-ad.example/asset.js', resourceType: 'script' }).action,
  'block',
  'the updater and Chromium adapter observe the same manager instance',
);
assert.ok(getShieldStats().filterListCount >= 1);

manager.removeFilterList('runtime-integration');
assert.equal(
  isBlockedAdOrTracker('https://integration-ad.example/asset.js', { resourceType: 'script' }),
  false,
  'removing the managed list immediately removes its Chromium enforcement',
);

console.log('PASS - filter updater and Electron Chromium policy share one live Akram Shield Manager');
