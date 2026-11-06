'use strict';

const { AkramShieldManager } = require('../../../akram/core/shield-manager.cjs');

function createChromiumShieldsAdapter(rules, options = {}) {
  const manager = options.manager || new AkramShieldManager({
    legacyRules: rules,
    limits: options.limits,
  });
  let generatedListId = 0;

  for (const [index, list] of (options.filterLists || []).entries()) {
    manager.addFilterList({
      id: list.id || 'initial-' + index,
      source: list.source || 'subscription',
      content: list.content,
      enabled: list.enabled,
    });
  }

  return Object.freeze({
    evaluateRequest(details = {}) {
      return manager.evaluateRequest({
        url: details.url,
        method: details.method || 'GET',
        resourceType: ({ xhr: 'xmlhttprequest', mainFrame: 'main-frame', subFrame: 'sub-frame' })[details.resourceType] || details.resourceType || 'other',
        isMainFrame: details.resourceType === 'mainFrame' || details.resourceType === 'main-frame',
        documentUrl: details.initiator || details.referrer || details.documentUrl || '',
      });
    },
    evaluateUrl(rawUrl) {
      return this.evaluateRequest({ url: rawUrl, method: 'GET', resourceType: 'other' });
    },
    addFilterList(content, source = 'custom') {
      const id = 'runtime-' + (++generatedListId);
      return manager.addFilterList({ id, content, source }).networkRuleCount;
    },
    addManagedFilterList(list) {
      return manager.addFilterList(list);
    },
    updateFilterList(list) {
      return manager.updateFilterList(list);
    },
    setFilterListEnabled(id, enabled) {
      return manager.setFilterListEnabled(id, enabled);
    },
    removeFilterList(id) {
      return manager.removeFilterList(id);
    },
    getCosmeticCss(rawUrl) {
      return manager.getCosmeticCss(rawUrl);
    },
    setModuleEnabled(module, enabled) {
      return manager.setModuleEnabled(module, enabled);
    },
    getFilterLists() {
      return manager.listFilterLists();
    },
    getStats() {
      return manager.getStats();
    },
    get manager() {
      return manager;
    },
    get ruleCount() {
      return manager.getStats().legacyRuleCount + manager.getStats().networkRuleCount;
    },
    get networkRuleCount() {
      return manager.getStats().networkRuleCount;
    },
  });
}

module.exports = { createChromiumShieldsAdapter };
