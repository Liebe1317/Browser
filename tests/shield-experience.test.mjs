import assert from 'node:assert/strict';
import experienceModule from '../akram/core/shield-experience.cjs';
const { AkramShieldExperience } = experienceModule;

const store = new AkramShieldExperience({ limits: { maxEntries: 2 } });
const first = store.recordObservation({
  host: 'https://ads.example.test/path?user=secret',
  surface: 'player',
  placement: 'player-overlay',
  resourceType: 'sub-frame',
  selector: '.floating-ad',
  decision: 'block',
  timestamp: 100,
});
assert.ok(first);
assert.equal(first.host, 'ads.example.test');
assert.equal(Object.hasOwn(first, 'url'), false);
assert.equal(Object.hasOwn(first, 'path'), false);
assert.equal(store.getStats().unverified, 1);
assert.equal(store.getCandidates().length, 0);
assert.equal(store.getCandidates({ includeUnverified: true }).length, 1);

store.recordObservation({
  host: 'ads.example.test',
  surface: 'player',
  placement: 'player-overlay',
  resourceType: 'sub-frame',
  selector: '.floating-ad',
  decision: 'block',
  timestamp: 200,
});
assert.equal(store.getStats().observations, 2);
assert.equal(store.setOutcome(first.fingerprint, 'confirmed-ad').outcome, 'confirmed-ad');
assert.equal(store.getCandidates().length, 0);

const snapshot = store.exportSnapshot();
const restored = new AkramShieldExperience({ snapshot });
assert.equal(restored.getStats().confirmed, 1);
assert.equal(restored.getStats().observations, 3);
const reclassified = store.recordObservation({
  host: 'ads.example.test',
  surface: 'player',
  placement: 'player-overlay',
  selector: '.floating-ad',
  state: 'reclassified',
  timestamp: 250,
});
assert.equal(reclassified.lastState, 'reclassified');
assert.equal(store.getCandidates({ includeUnverified: true }).some((item) => item.fingerprint === first.fingerprint), false);
assert.equal(store.getCandidates({ includeUnverified: true, includeReclassified: true }).some((item) => item.fingerprint === first.fingerprint), true);


assert.throws(() => store.setOutcome(first.fingerprint, 'auto-block'), /outcome/);
assert.equal(store.recordObservation({ host: '', surface: 'network' }), null);

store.recordObservation({ host: 'one.example', decision: 'block' });
store.recordObservation({ host: 'two.example', decision: 'block' });
assert.equal(store.getStats().entries, 2);

console.log('Akram Shield experience tests passed');
