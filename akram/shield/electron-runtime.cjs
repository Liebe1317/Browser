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

function createAkramElectronShieldRuntime({ manager, fetcherFactory = createElectronFilterListFetcher } = {}) {
  if (!manager || typeof manager.evaluateRequest !== 'function') {
    throw new TypeError('The live Chromium AkramShieldManager is required.');
  }
  const fetcher = fetcherFactory();
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
        stats: manager.getStats(),
        activeLists: manager.listFilterLists(),
        sources: updater.listSources(),
      });
    },
    async update(sourceId) {
      return updater.update(sourceId);
    },
    async updateAll() {
      const results = [];
      for (const source of updater.listSources()) {
        if (!source.enabled) continue;
        try {
          const result = await updater.update(source.id);
          results.push(Object.freeze({ id: source.id, status: result.status, metadata: result.metadata }));
        } catch (error) {
          results.push(Object.freeze({
            id: source.id,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Filter-list update failed.',
          }));
        }
      }
      return Object.freeze(results);
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
