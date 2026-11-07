'use strict';

const { AkramFilterListUpdater } = require('./filter-list-updater.cjs');
const { createElectronFilterListFetcher } = require('./electron-filter-transport.cjs');

const DEFAULT_SOURCES = Object.freeze([
  Object.freeze({
    id: 'easylist',
    url: 'https://easylist.to/easylist/easylist.txt',
    enabled: true,
  }),
  Object.freeze({
    id: 'easyprivacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    enabled: true,
  }),
]);

function createAkramElectronShieldRuntime({ manager, vpnStatus, fetcherFactory = createElectronFilterListFetcher } = {}) {
  if (!manager || typeof manager.evaluateRequest !== 'function') {
    throw new TypeError('The live Chromium AkramShieldManager is required.');
  }
  const fetcher = fetcherFactory({ vpnStatus });
  const updater = new AkramFilterListUpdater({
    manager,
    fetcher,
    allowedHosts: ['easylist.to'],
    limits: { maxBytes: 5 * 1024 * 1024, maxLines: 100000, timeoutMs: 20000, maxRedirects: 0 },
  });
  for (const source of DEFAULT_SOURCES) updater.registerSource(source);

  return Object.freeze({
    getState() {
      return Object.freeze({
        vpn: vpnStatus(),
        stats: manager.getStats(),
        activeLists: manager.listFilterLists(),
        sources: updater.listSources(),
      });
    },
    async update(sourceId) {
      return updater.update(sourceId);
    },
    abortAll(reason) {
      fetcher.abortAll?.(reason);
    },
    async close() {
      await fetcher.close?.();
    },
  });
}

module.exports = { createAkramElectronShieldRuntime, DEFAULT_SOURCES };
