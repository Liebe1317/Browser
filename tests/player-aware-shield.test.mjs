import assert from 'node:assert/strict';
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
assert.ok(script.includes('removedNodes'));
assert.ok(script.includes("transition(element, 'hidden')"));
assert.ok(script.includes("transition(candidate, 'removed')"));
assert.ok(!script.includes('__akramPlayerObserverToken'), 'observer token is never exposed on the page global');
assert.ok(!script.includes('.remove()'));
assert.ok(!script.includes('display:none'));
assert.throws(() => buildPlayerObserverScript('not-a-token'), /token/);

console.log('Player-Aware Shield classifier and observer tests passed');
