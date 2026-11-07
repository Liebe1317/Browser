import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sessionPolicy = require('../electron/session-policy.cjs');
import observerModule from '../akram/core/player-aware-observer.cjs';

const { OBSERVER_PREFIX, classifyPlayerElement, buildPlayerObserverScript, createPlayerObserverToken } = observerModule;

assert.equal(classifyPlayerElement({ tagName: 'video', inPlayer: true, isOverlay: true, signals: ['ad-overlay'] }).kind, 'protected');
assert.equal(classifyPlayerElement({ tagName: 'div', inPlayer: true, isOverlay: true, signals: ['subtitles'] }).kind, 'protected');
assert.equal(classifyPlayerElement({ tagName: 'div', inPlayer: true, isOverlay: true, signals: ['vjs-text-track-display'] }).kind, 'protected');
assert.equal(classifyPlayerElement({ tagName: 'div', inPlayer: true, isOverlay: true, signals: ['closed-caption'] }).kind, 'protected');
assert.equal(classifyPlayerElement({ tagName: 'div', inPlayer: true, isOverlay: true, signals: ['player-controls'] }).kind, 'protected');
assert.equal(classifyPlayerElement({ tagName: 'div', inPlayer: true, isOverlay: true, signals: ['sponsored-overlay'] }).kind, 'candidate');
assert.equal(classifyPlayerElement({ tagName: 'div', inPlayer: true, isOverlay: true, signals: ['vast-ad'] }).confidence, 'high');
assert.equal(classifyPlayerElement({ tagName: 'div', inPlayer: false, isOverlay: true, signals: ['ad-banner'] }).kind, 'ignore');
assert.equal(classifyPlayerElement({ tagName: 'div', inPlayer: true, isOverlay: false, signals: ['ad-banner'] }).kind, 'ignore');
assert.equal(classifyPlayerElement({ tagName: 'div', inPlayer: true, isOverlay: true, signals: ['overlay'] }).kind, 'ignore');
assert.equal(classifyPlayerElement({ tagName: 'div', inPlayer: true, isOverlay: true, signals: ['ad-overlay'], containsProtectedDescendant: true }).kind, 'protected');

const token = createPlayerObserverToken();
assert.match(token, /^[a-f0-9]{48}$/);
const script = buildPlayerObserverScript(token);
assert.ok(script.includes('MutationObserver'));
assert.ok(script.includes('attributeFilter'));
assert.ok(script.includes(OBSERVER_PREFIX + token));
assert.ok(script.includes('requestAnimationFrame'));
assert.ok(script.includes('pendingRoots'));
assert.ok(script.includes("for (const attribute of ['data-ad', 'data-testid', 'aria-label', 'title'])"));
assert.ok(script.includes("return '';"), 'observer refuses tag-only broad selectors');
assert.ok(script.includes('removedNodes'));
assert.ok(script.includes("transition(element, 'hidden')"));
assert.ok(script.includes("transition(candidate, 'removed')"));
assert.ok(!script.includes('__akramPlayerObserverToken'), 'observer token is never exposed on the page global');
assert.ok(!script.includes('.remove()'));
assert.ok(!script.includes('display:none'));
assert.throws(() => buildPlayerObserverScript('not-a-token'), /token/);
const memoryEntry = sessionPolicy.recordPlayerObservation({
  host: 'player.example.test',
  pageHost: 'player.example.test',
  selector: '.ad-overlay',
  confidence: 'high',
  reasons: ['ad-overlay'],
  state: 'visible',
});
assert.equal(memoryEntry.surface, 'player');
assert.equal(memoryEntry.placement, 'player-overlay');
assert.equal(sessionPolicy.getShieldExperienceCandidates({ includeUnverified: true }).some((item) => item.fingerprint === memoryEntry.fingerprint), true);

console.log('Player-Aware Shield classifier and observer tests passed');
