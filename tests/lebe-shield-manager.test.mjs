import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { AkramShieldManager } = require('../akram/core/shield-manager.cjs');

const checks = [];
function check(value, label) {
  checks.push([!!value, label]);
  console.log((value ? 'PASS' : 'FAIL') + ' - ' + label);
}

const manager = new AkramShieldManager();
check(manager.getStats().profile === 'akram-default', 'Akram Default is the built-in protection profile');
check(manager.getModuleStates().network && manager.getModuleStates().cosmetic, 'network and cosmetic protection start enabled');
check(manager.evaluateRequest({ url: 'https://doubleclick.net/ad.js', method: 'GET', resourceType: 'script' }).action === 'block', 'built-in network protection rules are owned by the central Shield core');
check(manager.evaluate({ url: 'https://doubleclick.net/ad.js', method: 'GET', resourceType: 'script' }).action === 'block', 'Shield manager implements the shared request-policy contract');

const metadata = manager.addFilterList({
  id: 'starter',
  source: 'unit-test-list',
  content: [
    '! title: manager test',
    '||ads.example^$script,third-party',
    'example.com##.sponsored-card',
    'example.com#@#.sponsored-card',
    'youtube.com#@#.ytp-ad-overlay-container',
    'example.com#@#.ad-container',
  ].join('\n'),
});
check(metadata.networkRuleCount === 1, 'manager registers network rules');
check(metadata.cosmeticRuleCount === 4, 'manager registers cosmetic rules and exceptions');
check(manager.evaluateRequest({
  url: 'https://ads.example/ad.js',
  method: 'GET',
  resourceType: 'script',
  documentUrl: 'https://publisher.example',
}).action === 'block', 'central manager evaluates network requests');
check(manager.getCosmeticCss('https://example.com/').includes('.sponsored-card') === false, 'cosmetic exception is honored through the manager');
check(!manager.getCosmeticCss('https://example.com/').includes('.ad-container{'), 'site exceptions can override built-in global cosmetic selectors');
check(manager.getCosmeticCss('https://unrelated.example/').includes('.ad-container{'), 'built-in global cosmetic selectors remain active on other sites');
check(manager.getCosmeticCss('https://www.youtube.com/').includes('.ytp-ad-overlay-container') === false, 'site exception can disable a built-in YouTube cosmetic rule');
check(!manager.getCosmeticCss('https://unrelated.example/').includes('.ytp-ad-overlay-container'), 'YouTube built-ins do not leak to unrelated sites');
const youtubeDefaults = new AkramShieldManager();
check(youtubeDefaults.getCosmeticCss('https://youtube.com/').includes('.ytp-ad-overlay-container{'), 'YouTube built-ins apply on YouTube when no site exception is configured');

let duplicateRejected = false;
try { manager.addFilterList({ id: 'starter', content: '||other.example^' }); } catch { duplicateRejected = true; }
check(duplicateRejected, 'duplicate list registration is rejected without changing live rules');
check(manager.evaluateRequest({
  url: 'https://ads.example/ad.js', method: 'GET', resourceType: 'script',
  documentUrl: 'https://publisher.example',
}).action === 'block', 'rejected list registration leaves the active policy unchanged');

const updated = manager.updateFilterList({
  id: 'starter',
  source: 'unit-test-list-v2',
  content: '||tracker.example^$image',
});
check(updated.networkRuleCount === 1, 'filter-list replacement reports its validated rule count');
check(manager.evaluateRequest({
  url: 'https://ads.example/ad.js', method: 'GET', resourceType: 'script',
  documentUrl: 'https://publisher.example',
}).action === 'allow', 'atomic list replacement removes the previous list rules');
check(manager.evaluateRequest({
  url: 'https://tracker.example/pixel', method: 'GET', resourceType: 'image',
  documentUrl: 'https://publisher.example',
}).action === 'block', 'atomic list replacement activates the new rules');

manager.setModuleEnabled('network', false);
check(manager.evaluateRequest({
  url: 'https://tracker.example/pixel', method: 'GET', resourceType: 'image',
  documentUrl: 'https://publisher.example',
}).reason === 'module-disabled', 'module policy is applied centrally');
manager.setModuleEnabled('network', true);

check(manager.removeFilterList('starter'), 'registered filter list can be removed');
check(manager.getStats().filterListCount === 0, 'removal rebuilds the active rule snapshot');
check(manager.removeFilterList('missing') === false, 'removing an unknown list is a safe no-op');

let oversizedRejected = false;
const limited = new AkramShieldManager({ limits: { maxListBytes: 8, maxLinesPerList: 2 } });
try { limited.addFilterList({ id: 'large', content: '||long.example^' }); } catch { oversizedRejected = true; }
check(oversizedRejected, 'oversized filter lists are rejected before activation');

const capped = new AkramShieldManager({ limits: { maxFilterLists: 1 } });
capped.addFilterList({ id: 'one', content: '||one.example^' });
let listCapRejected = false;
try { capped.addFilterList({ id: 'two', content: '||two.example^' }); } catch { listCapRejected = true; }
check(listCapRejected && capped.getStats().filterListCount === 1, 'filter-list count limits reject additions without changing active policy');

const rollback = new AkramShieldManager({ limits: { maxListBytes: 24 } });
rollback.addFilterList({ id: 'stable', content: '||stable.example^' });
let invalidUpdateRejected = false;
try {
  rollback.updateFilterList({ id: 'stable', content: '||this-rule-is-far-too-long.example^' });
} catch {
  invalidUpdateRejected = true;
}
check(invalidUpdateRejected && rollback.evaluateRequest({
  url: 'https://stable.example/ad.js', method: 'GET', resourceType: 'script',
}).action === 'block', 'a rejected replacement preserves the previously active list');

const totalLimited = new AkramShieldManager({ limits: { maxListBytes: 64, maxTotalBytes: 24 } });
totalLimited.addFilterList({ id: 'first', content: '||first.example^' });
let totalBytesRejected = false;
try { totalLimited.addFilterList({ id: 'second', content: '||second.example^' }); } catch { totalBytesRejected = true; }
check(totalBytesRejected && totalLimited.getStats().filterListCount === 1, 'combined byte limits reject additions without changing active policy');

const lineLimited = new AkramShieldManager({ limits: { maxLinesPerList: 2 } });
let lineCountRejected = false;
try { lineLimited.addFilterList({ id: 'many-lines', content: '||one.example^\n||two.example^\n||three.example^' }); } catch { lineCountRejected = true; }
check(lineCountRejected && lineLimited.getStats().filterListCount === 0, 'per-list line limits reject oversized lists before activation');

const listToggle = new AkramShieldManager();
listToggle.addFilterList({
  id: 'toggle-a',
  content: '||toggle-a.example^$script\ntoggle.example##.toggle-ad',
});
listToggle.addFilterList({ id: 'toggle-b', content: '||toggle-b.example^$script' });
const disabledList = listToggle.setFilterListEnabled('toggle-a', false);
check(disabledList.enabled === false, 'individual filter list can be disabled without removal');
check(listToggle.evaluateRequest({ url: 'https://toggle-a.example/ad.js', resourceType: 'script' }).action === 'allow', 'disabled list network rules are not enforced');
check(listToggle.evaluateRequest({ url: 'https://toggle-b.example/ad.js', resourceType: 'script' }).action === 'block', 'other enabled lists remain enforced');
check(!listToggle.getCosmeticCss('https://toggle.example/').includes('.toggle-ad{'), 'disabled list cosmetic rules are not injected');
check(listToggle.listFilterLists().find((item) => item.id === 'toggle-a').networkRuleCount === 1, 'disabled list metadata retains parsed rule counts');
const stillDisabled = listToggle.updateFilterList({ id: 'toggle-a', content: '||toggle-a-new.example^$script' });
check(stillDisabled.enabled === false, 'updating a disabled list preserves its disabled state');
check(listToggle.evaluateRequest({ url: 'https://toggle-a-new.example/ad.js', resourceType: 'script' }).action === 'allow', 'updated disabled list stays out of the active policy');
const reenabled = listToggle.setFilterListEnabled('toggle-a', true);
check(reenabled.enabled === true, 'individual filter list can be re-enabled');
check(listToggle.evaluateRequest({ url: 'https://toggle-a-new.example/ad.js', resourceType: 'script' }).action === 'block', 're-enabling a list atomically restores its network rules');
check(listToggle.setFilterListEnabled('unknown', false) === false, 'unknown filter-list toggle is a safe no-op');
let invalidEnabledRejected = false;
try { listToggle.setFilterListEnabled('toggle-a', 'false'); } catch { invalidEnabledRejected = true; }
check(invalidEnabledRejected && listToggle.evaluateRequest({ url: 'https://toggle-a-new.example/ad.js', resourceType: 'script' }).action === 'block', 'invalid toggle input cannot change the active policy');

const cosmeticToggle = new AkramShieldManager();
cosmeticToggle.setModuleEnabled('cosmetic', false);
check(cosmeticToggle.getCosmeticCss('https://example.com/').length === 0, 'disabling cosmetic protection suppresses generated CSS');
cosmeticToggle.setModuleEnabled('cosmetic', true);
check(cosmeticToggle.getCosmeticCss('https://example.com/').length > 0, 're-enabling cosmetic protection restores generated CSS');

if (checks.some(([ok]) => !ok)) process.exitCode = 1;
