'use strict';

const { hostMatchesDomain } = require('./shields.cjs');

const GLOBAL_BUILTIN_SELECTORS = [
  '[data-ad]', '[data-ad-slot]', '[data-advertisement]',
  'ins.adsbygoogle', '.adsbygoogle', '.ad-container', '.ad-wrapper',
  '.ad-banner', '.banner-ad', '.advertisement', '.adsbox', '.ad-box',
  '.popup-ad', '.popup-overlay',
  'iframe[src*="doubleclick.net"]', 'iframe[src*="googlesyndication.com"]',
];

const YOUTUBE_BUILTIN_SELECTORS = [
  '#player-ads', '.video-ads', '.ytp-ad-overlay-container',
  '.ytp-ad-text-overlay', '.ytp-ad-player-overlay',
  'ytd-display-ad-renderer', 'ytd-promoted-sparkles-web-renderer',
];

const YOUTUBE_AD_ALLOWLIST = new Set(YOUTUBE_BUILTIN_SELECTORS);
const YOUTUBE_DOMAINS = ['youtube.com', 'youtube-nocookie.com'];

const PROTECTED_SELECTOR_PARTS = [
  'html5-video', 'video-js', 'videoplayer', 'video-player',
  'player-container', 'player-wrapper', 'player-controls',
  'playback', 'jwplayer', 'jw-', 'plyr', 'shaka', 'vjs-',
  'media-player', 'mediaelement', 'theoplayer',
];

function normalizeHost(value) {
  return String(value || '').toLowerCase().replace(/\.$/, '');
}

function parseDomainList(raw) {
  const include = [];
  const exclude = [];
  for (const item of String(raw || '').split(',')) {
    const token = item.trim().toLowerCase();
    if (!token) continue;
    const negated = token.startsWith('~');
    const host = normalizeHost(negated ? token.slice(1) : token);
    if (!host || host.length > 253 || host.includes('*')) return null;
    try {
      if (new URL('https://' + host).hostname !== host) return null;
    } catch { return null; }
    (negated ? exclude : include).push(host);
  }
  return { include, exclude };
}

function isSafeCosmeticSelector(rawSelector) {
  const selector = String(rawSelector || '').trim();
  if (!selector || selector.length > 512 || /[{};]/.test(selector)) return false;
  if (YOUTUBE_AD_ALLOWLIST.has(selector)) return true;
  if (!/[.#[:]/.test(selector)) return false;
  if (/(^|[\s>+~,(])(?:html|body|video|audio|canvas|iframe|button|input|select|textarea)(?=$|[\s>+~.#:[,)])/i.test(selector)) return false;
  const lower = selector.toLowerCase();
  if (PROTECTED_SELECTOR_PARTS.some((part) => lower.includes(part))) return false;
  if (/(?:^|[\s>+~])\*(?:$|[\s>+~])/i.test(selector)) return false;
  return true;
}

class AkramCosmeticFilters {
  #rules = [];

  addFilterList(text, source = 'custom') {
    let added = 0;
    for (const rawLine of String(text || '').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('!') || line.startsWith('[')) continue;
      const exceptionIndex = line.indexOf('#@#');
      const blockIndex = line.indexOf('##');
      const isException = exceptionIndex >= 0 && (blockIndex < 0 || exceptionIndex <= blockIndex);
      const markerIndex = isException ? exceptionIndex : blockIndex;
      if (markerIndex < 0) continue;
      const markerLength = isException ? 3 : 2;
      const domainText = line.slice(0, markerIndex);
      const selector = line.slice(markerIndex + markerLength).trim();
      if (!isSafeCosmeticSelector(selector)) continue;
      const domains = domainText ? parseDomainList(domainText) : { include: [], exclude: [] };
      if (!domains) continue;
      this.#rules.push({
        exception: isException,
        selector,
        include: domains.include,
        exclude: domains.exclude,
        source: String(source).slice(0, 80),
      });
      added += 1;
    }
    return added;
  }

  getCss(rawUrl) {
    let hostname = '';
    try {
      const url = new URL(rawUrl);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      hostname = normalizeHost(url.hostname);
    } catch { return ''; }

    const applies = (rule) => {
      if (rule.include.length && !rule.include.some((domain) => hostMatchesDomain(hostname, domain))) return false;
      if (rule.exclude.some((domain) => hostMatchesDomain(hostname, domain))) return false;
      return true;
    };

    const exceptions = new Set(this.#rules.filter((rule) => rule.exception && applies(rule)).map((rule) => rule.selector));
    const selectors = new Set(
      GLOBAL_BUILTIN_SELECTORS.filter((selector) => !exceptions.has(selector)),
    );
    const isYoutube = YOUTUBE_DOMAINS.some((domain) => hostMatchesDomain(hostname, domain));
    if (isYoutube) {
      for (const selector of YOUTUBE_BUILTIN_SELECTORS) {
        if (!exceptions.has(selector)) selectors.add(selector);
      }
    }
    for (const rule of this.#rules) {
      if (!rule.exception && applies(rule) && !exceptions.has(rule.selector)) selectors.add(rule.selector);
    }
    return [...selectors].map((selector) =>
      selector + '{display:none!important;visibility:hidden!important;pointer-events:none!important;}',
    ).join('\n');
  }

  get ruleCount() { return this.#rules.length; }
}

module.exports = { AkramCosmeticFilters, LebeCosmeticFilters: AkramCosmeticFilters, isSafeCosmeticSelector };
