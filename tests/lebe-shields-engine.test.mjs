import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { LebeShields, parseFilterLine } = require('../lebe/core/shields.cjs');
const checks = [];
function check(value, label) { checks.push([!!value,label]); console.log((value?'PASS':'FAIL')+' - '+label); }
const engine = new LebeShields();
const count = engine.addFilterList([
  '! title: test',
  '||ads.example^$script,third-party',
  '@@||ads.example/allowed.js^$script,domain=publisher.example',
  '||tracker.example/pixel^$image',
  '||cdn.example/file^$script,domain=publisher.example|~trusted.publisher.example',
  '||media.example^$media,~third-party',
].join('\n'), 'unit-test');
check(count === 5, 'parses supported ABP network filters and ignores comments');
check(engine.evaluate({url:'https://ads.example/ad.js',resourceType:'script',documentUrl:'https://publisher.example'}).action==='block', 'blocks third-party script requests by domain anchor');
check(engine.evaluate({url:'https://ads.example/ad.js',resourceType:'script',documentUrl:'https://ads.example'}).action==='allow', 'third-party option does not block first-party requests');
check(engine.evaluate({url:'https://ads.example/allowed.js',resourceType:'script',documentUrl:'https://publisher.example'}).action==='allow', 'site-specific exception rules override matching block rules');
check(engine.evaluate({url:'https://tracker.example/pixel',resourceType:'image',documentUrl:'https://publisher.example'}).action==='block', 'matches image resource type');
check(engine.evaluate({url:'https://tracker.example/pixel',resourceType:'script',documentUrl:'https://publisher.example'}).action==='allow', 'resource type restrictions avoid blocking unrelated requests');
check(engine.evaluate({url:'https://cdn.example/file.js',resourceType:'script',documentUrl:'https://publisher.example'}).action==='block', 'domain option scopes a rule to the listed document site');
check(engine.evaluate({url:'https://cdn.example/file.js',resourceType:'script',documentUrl:'https://trusted.publisher.example'}).action==='allow', 'negated domain option excludes the listed document site');
check(engine.evaluate({url:'https://media.example/stream',resourceType:'media',documentUrl:'https://media.example'}).action==='block', 'first-party media exception polarity is respected');
check(engine.evaluate({url:'https://media.example/stream',resourceType:'media',documentUrl:'https://site.example'}).action==='allow', 'tilde third-party option excludes cross-site media');
check(engine.evaluate({url:'file:///tmp/page.html'}).action==='allow', 'unsupported schemes are left untouched');
check(parseFilterLine('||x.example^') !== null, 'network filter parser exposes deterministic compiled rules');
check(parseFilterLine('||x.example^$script,badfilter') === null, 'unsupported modifiers are skipped rather than broadened unsafely');
if (checks.some(([ok])=>!ok)) process.exitCode=1;
