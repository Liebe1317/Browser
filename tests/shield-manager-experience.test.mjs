import assert from 'node:assert/strict';
import managerModule from '../akram/core/shield-manager.cjs';
const { AkramShieldManager } = managerModule;

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
assert.equal(candidate.pageHost, 'news.example.test');
assert.equal(candidate.surface, 'network');
assert.equal(candidate.resourceType, 'script');
assert.equal(Object.hasOwn(candidate, 'url'), false);
assert.equal(manager.setExperienceOutcome(candidate.fingerprint, 'confirmed-ad').outcome, 'confirmed-ad');
const playerCandidate = manager.recordCosmeticObservation({
  host: 'video.example.test',
  pageHost: 'video.example.test',
  surface: 'player',
  placement: 'player-overlay',
  resourceType: 'other',
  selector: '.sponsored-overlay',
  source: 'player-dom-observer',
});
assert.equal(playerCandidate.surface, 'player');
assert.equal(playerCandidate.placement, 'player-overlay');
assert.equal(manager.getExperienceCandidates({ includeUnverified: true }).some((item) => item.fingerprint === playerCandidate.fingerprint), true);
manager.recordCosmeticObservation({ host: 'video.example.test', pageHost: 'video.example.test', surface: 'player', placement: 'player-overlay', selector: '.sponsored-overlay', source: 'player-dom-observer', state: 'visible' });
manager.recordCosmeticObservation({ host: 'video.example.test', pageHost: 'video.example.test', surface: 'player', placement: 'player-overlay', selector: '.sponsored-overlay', source: 'player-dom-observer', state: 'hidden' });
manager.recordCosmeticObservation({ host: 'video.example.test', pageHost: 'video.example.test', surface: 'player', placement: 'player-overlay', selector: '.sponsored-overlay', source: 'player-dom-observer', state: 'removed' });
const lifecycle = manager.getExperienceCandidates({ includeUnverified: true }).find((item) => item.fingerprint === playerCandidate.fingerprint);
assert.equal(lifecycle.appearanceCount, 1);
assert.equal(lifecycle.hiddenCount, 1);
assert.equal(lifecycle.removedCount, 1);
assert.equal(lifecycle.lastState, 'removed');
assert.equal(manager.getExperienceCandidates().length, 1);

const snapshot = manager.exportExperience();
const restored = new AkramShieldManager({ legacyRules: [], experienceSnapshot: snapshot });
assert.equal(restored.getExperienceStats().confirmed, 1);
console.log('Akram Shield manager experience integration tests passed');
