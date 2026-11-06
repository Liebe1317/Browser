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
  '||cdn.example/file$script,domain=publisher.example|~trusted.publisher.example',
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

const pslEngine = new LebeShields();
pslEngine.addFilterList('||psl-check.example^$script,third-party', 'psl-test');
check(pslEngine.evaluate({url:'https://psl-check.example/a.js',resourceType:'script',documentUrl:'https://shop.example.co.uk'}).action==='allow', 'PSL treats sibling subdomains under the same co.uk registrable domain as first-party');
check(pslEngine.evaluate({url:'https://psl-check.example/a.js',resourceType:'script',documentUrl:'https://shop.other.co.uk'}).action==='block', 'PSL distinguishes different registrable domains under co.uk');
check(pslEngine.evaluate({url:'https://psl-check.example/a.js',resourceType:'script',documentUrl:'https://news.example.co.uk'}).action==='allow', 'PSL treats distinct subdomains of one registrable domain as first-party');
const privateSuffixEngine = new LebeShields();
privateSuffixEngine.addFilterList('||psl-check.example^$script,third-party', 'private-suffix-test');
check(privateSuffixEngine.evaluate({url:'https://psl-check.example/a.js',resourceType:'script',documentUrl:'https://tenant-a.github.io'}).action==='block', 'PSL private suffix rules isolate separate github.io tenants');
check(privateSuffixEngine.evaluate({url:'https://psl-check.example/a.js',resourceType:'script',documentUrl:'https://app.tenant-a.github.io'}).action==='allow', 'PSL private suffix rules keep subdomains within one hosted tenant first-party');
const ipEngine = new LebeShields();
ipEngine.addFilterList('||psl-check.example^$script,third-party', 'ip-fallback-test');
check(ipEngine.evaluate({url:'https://psl-check.example/a.js',resourceType:'script',documentUrl:'http://127.0.0.1'}).action==='block', 'PSL fallback treats a different IP host as third-party');
check(ipEngine.evaluate({url:'https://psl-check.example/a.js',resourceType:'script',documentUrl:'http://127.0.0.1:8080'}).action==='block', 'PSL fallback ignores ports when comparing IP hosts');

if (checks.some(([ok])=>!ok)) process.exitCode=1;
