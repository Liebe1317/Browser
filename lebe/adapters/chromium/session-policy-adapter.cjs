'use strict';

const { LebeShields } = require('../../core/shields.cjs');

function createChromiumShieldsAdapter(rules, options = {}) {
  const shields = new LebeShields(rules);
  for (const list of options.filterLists || []) shields.addFilterList(list.content, list.source || 'subscription');
  return Object.freeze({
    evaluateRequest(details = {}) {
      return shields.evaluate({
        url: details.url,
        method: details.method || 'GET',
        resourceType: ({ xhr: 'xmlhttprequest', mainFrame: 'document', subFrame: 'subdocument' })[details.resourceType] || details.resourceType || 'other',
        isMainFrame: details.resourceType === 'mainFrame',
        documentUrl: details.initiator || details.referrer || details.documentUrl || '',
      });
    },
    evaluateUrl(rawUrl) {
      return this.evaluateRequest({ url: rawUrl, method: 'GET', resourceType: 'other' });
    },
    addFilterList(content, source) { return shields.addFilterList(content, source); },
    get ruleCount() { return shields.ruleCount; },
    get networkRuleCount() { return shields.networkRuleCount; },
  });
}
module.exports = { createChromiumShieldsAdapter };
