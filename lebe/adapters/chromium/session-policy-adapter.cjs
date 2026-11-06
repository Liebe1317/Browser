'use strict';

const { LebeShields } = require('../../core/shields.cjs');

/**
 * Transitional adapter: translates native request metadata into engine-neutral
 * Lebe request contracts. Chromium-specific details stop at this boundary.
 */
function createChromiumShieldsAdapter(rules) {
  const shields = new LebeShields(rules);

  return Object.freeze({
    evaluateRequest(details = {}) {
      return shields.evaluate({
        url: details.url,
        method: details.method || 'GET',
        resourceType: details.resourceType || 'other',
        isMainFrame: details.resourceType === 'mainFrame',
      });
    },
    evaluateUrl(rawUrl) {
      return this.evaluateRequest({ url: rawUrl, method: 'GET', resourceType: 'other' });
    },
    get ruleCount() {
      return shields.ruleCount;
    },
  });
}

module.exports = { createChromiumShieldsAdapter };
