import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { LebeCosmeticFilters, isSafeCosmeticSelector } = require('../lebe/core/cosmetic-filters.cjs');
const checks = [];
function check(value, label) {
  checks.push([!!value, label]);
  console.log((value ? 'PASS' : 'FAIL') + ' - ' + label);
}

const filters = new LebeCosmeticFilters();
check(filters.addFilterList([
  '! cosmetic test list',
  'example.com##.sponsored-card',
  'example.com#@#.sponsored-card',
  '##.global-ad-slot',
  'example.com,~sports.example.com##[data-ad-unit]',
  'example.com##video',
  'example.com##.video-player',
  'example.com##body',
  'example.com##*',
  'example.com#?#.procedural',
].join('\n'), 'unit-test') === 4, 'parses supported cosmetic rules and rejects unsafe or unsupported selectors');

const exampleCss = filters.getCss('https://www.example.com/article');
check(exampleCss.includes('.global-ad-slot{'), 'global cosmetic rules apply to every supported page');
check(!exampleCss.includes('.sponsored-card{'), 'site-specific cosmetic exceptions override matching hide rules');
check(exampleCss.includes('[data-ad-unit]{'), 'domain-scoped cosmetic rules apply to matching subdomains');
const sportsCss = filters.getCss('https://sports.example.com/article');
check(!sportsCss.includes('[data-ad-unit]{'), 'negated domains exclude a subdomain from cosmetic rules');
const unrelatedCss = filters.getCss('https://unrelated.test/');
check(!unrelatedCss.includes('[data-ad-unit]{'), 'domain-scoped cosmetic rules do not leak to unrelated sites');
check(filters.getCss('file:///tmp/page.html') === '', 'non-web documents receive no cosmetic CSS');

check(!isSafeCosmeticSelector('video'), 'bare video elements are never hidden');
check(!isSafeCosmeticSelector('.video-player'), 'selectors targeting common video player surfaces are rejected');
check(!isSafeCosmeticSelector('body'), 'document root selectors are rejected');
check(!isSafeCosmeticSelector('*'), 'universal selectors are rejected');
check(isSafeCosmeticSelector('.ad-slot'), 'specific ad-slot class selectors are accepted');

const youtubeCss = filters.getCss('https://www.youtube.com/watch?v=example');
check(youtubeCss.includes('.ytp-ad-overlay-container{'), 'the narrowly scoped YouTube ad-overlay rule remains available');
check(!youtubeCss.includes('.html5-video-player{'), 'the YouTube video player container is never hidden');

if (checks.some(([ok]) => !ok)) process.exitCode = 1;
