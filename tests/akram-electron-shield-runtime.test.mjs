'use strict';

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createAkramElectronShieldRuntime } = require('../akram/shield/electron-runtime.cjs');

function createHarness({ vpnEnabled = false, failFirst = false } = {}) {
  const lists = new Map();
  const requested = [];
  const manager = {
    evaluateRequest() { return { action: 'allow' }; },
    getStats() { return { filterListCount: lists.size }; },
    listFilterLists() { return [...lists.values()]; },
    addFilterList(input) {
      const metadata = {
        id: input.id,
        source: input.source,
        enabled: input.enabled,
        networkRuleCount: 1,
        cosmeticRuleCount: 0,
        unsupportedLineCount: 0,
      };
      lists.set(input.id, metadata);
      return metadata;
    },
    updateFilterList(input) {
      const current = lists.get(input.id);
      const metadata = {
        id: input.id,
        source: input.source,
        enabled: current.enabled,
        networkRuleCount: 1,
        cosmeticRuleCount: 0,
        unsupportedLineCount: 0,
      };
      lists.set(input.id, metadata);
      return metadata;
    },
  };
  const fetcherFactory = () => async (url) => {
    requested.push(url);
    if (failFirst && requested.length === 1) throw new Error('simulated transport failure');
    return {
      finalUrl: url,
      response: {
        status: 200,
        headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'text/plain; charset=utf-8' : null },
        body: Buffer.from('||ads.example^\n', 'utf8'),
      },
    };
  };
  const runtime = createAkramElectronShieldRuntime({
    manager,
    vpnStatus: () => ({ enabled: vpnEnabled, connected: vpnEnabled }),
    fetcherFactory,
  });
  return { runtime, lists, requested };
}

async function run() {
  {
    const { runtime, lists, requested } = createHarness();
    const results = await runtime.updateAll();
    assert.deepEqual(results.map((item) => item.id), ['easylist', 'easyprivacy']);
    assert.ok(results.every((item) => item.status === 'updated'));
    assert.equal(requested.length, 2);
    assert.deepEqual([...lists.keys()], ['easylist', 'easyprivacy']);
    assert.equal(runtime.getState().stats.filterListCount, 2);
    await runtime.close();
  }

  {
    const { runtime, requested } = createHarness({ vpnEnabled: true });
    await assert.rejects(runtime.updateAll(), /Akram VPN is enabled/);
    assert.equal(requested.length, 0, 'must not make direct requests while VPN is enabled');
    await runtime.close();
  }

  {
    const { runtime, lists, requested } = createHarness({ failFirst: true });
    const results = await runtime.updateAll();
    assert.equal(results[0].status, 'failed');
    assert.equal(results[1].status, 'updated', 'one failed source must not prevent the next source');
    assert.equal(requested.length, 2);
    assert.deepEqual([...lists.keys()], ['easyprivacy']);
    await runtime.close();
  }

  console.log('PASS Akram Shield startup bootstrap activates both lists in the live manager');
  console.log('PASS Akram Shield bootstrap refuses direct updates while VPN is enabled');
  console.log('PASS Akram Shield bootstrap isolates per-source failures');
}

run().catch((error) => {
  console.error('FAIL Akram Shield runtime tests:', error);
  process.exitCode = 1;
});
