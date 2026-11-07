'use strict';

const assert = require('node:assert/strict');
const { AkramShieldManager } = require('../akram/core/shield-manager.cjs');

const manager = new AkramShieldManager({
  legacyRules: [{ id: 'known-ad-host', domain: 'ads.example.test' }],
});
const decision = manager.evaluateRequest({
  url: 'https://ads.example.test/ad.js?session=private',
  resourceType: 'script',
  documentUrl: 'https://news.example.test/article',
});
assert.equal(decision.action, 'block');
assert.equal(manager.getExperienceStats().observations, 1);
assert.equal(manager.getExperienceStats().unverified, 1);

const candidate = manager.getExperienceCandidates({ includeUnverified: true })[0];
assert.equal(candidate.host, 'ads.example.test');
assert.equal(candidate.surface, 'network');
assert.equal(candidate.resourceType, 'script');
assert.equal(Object.hasOwn(candidate, 'url'), false);
assert.equal(manager.setExperienceOutcome(candidate.fingerprint, 'confirmed-ad').outcome, 'confirmed-ad');
assert.equal(manager.getExperienceCandidates().length, 1);

const snapshot = manager.exportExperience();
const restored = new AkramShieldManager({ legacyRules: [], experienceSnapshot: snapshot });
assert.equal(restored.getExperienceStats().confirmed, 1);
console.log('Akram Shield manager experience integration tests passed');
