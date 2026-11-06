'use strict';

const { LebeShields } = require('../../core/shields.cjs');

/**
 * Transitional adapter: converts native request URLs into engine-neutral
 * Lebe Shields decisions. Only this adapter knows that its caller is Chromium.
 */
function createChromiumShieldsAdapter(rules) {
  const shields = new LebeShields(rules);

  return Object.freeze({
    evaluateUrl(rawUrl) {
      return shields.evaluate({
        url: rawUrl,
        method: 'GET',
        resourceType: 'other',
        isMainFrame: false,
      });
    },
    get ruleCount() {
      return shields.ruleCount;
    },
  });
}

module.exports = { createChromiumShieldsAdapter };
