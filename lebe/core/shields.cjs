'use strict';

function normalizeHost(value) {
  return String(value || '').toLowerCase().replace(/\.$/, '');
}
function hostMatchesDomain(hostname, domain) {
  const host = normalizeHost(hostname);
  const target = normalizeHost(domain).replace(/^\.+|\.+$/g, '');
  return !!host && !!target && (host === target || host.endsWith('.' + target));
}
function parseRequest(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) ? url : null;
  } catch { return null; }
}
function escapeRegex(value) {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}
function wildcardFragment(pattern) {
  let source = '';
  for (const char of pattern) {
    if (char === '*') source += '.*';
    else if (char === '^') source += '(?:[^a-zA-Z0-9_.%-]|$)';
    else source += escapeRegex(char);
  }
  return source;
}
function wildcardToRegExp(pattern) {
  return new RegExp('^' + wildcardFragment(pattern) + '$', 'i');
}
function compileNetworkPattern(pattern) {
  let value = String(pattern || '').trim();
  if (!value || value.startsWith('!') || value.startsWith('[') || value.includes('##') || value.includes('#@#')) return null;
  if (value.startsWith('||')) {
    value = value.slice(2);
    const separator = value.search(/[\\/\^*]/);
    const host = separator < 0 ? value : value.slice(0, separator);
    const rest = separator < 0 ? '' : value.slice(separator);
    return new RegExp('^(?:https?|wss?):\\/\\/(?:[^/]+\\.)?' + escapeRegex(host) + wildcardFragment(rest), 'i');
  }
  const left = value.startsWith('|');
  const right = value.endsWith('|');
  if (left) value = value.slice(1);
  if (right) value = value.slice(0, -1);
  let source = wildcardToRegExp(value).source;
  if (!left) source = source.slice(1);
  if (!right) source = source.slice(0, -1);
  return new RegExp(source, 'i');
}
function parseFilterLine(line, index = 0) {
  const raw = String(line || '').trim();
  if (!raw || raw.startsWith('!') || raw.startsWith('[')) return null;
  const exception = raw.startsWith('@@');
  const body = exception ? raw.slice(2) : raw;
  const split = body.lastIndexOf('$');
  const pattern = split < 0 ? body : body.slice(0, split);
  const matcher = compileNetworkPattern(pattern);
  if (!matcher) return null;
  const options = split < 0 ? [] : body.slice(split + 1).split(',').map((v) => v.trim().toLowerCase());
  const supported = new Set(['document','subdocument','script','image','stylesheet','object','xmlhttprequest','xhr','media','font','other','ping','websocket']);
  const types = [], excludedTypes = [], domains = [], excludedDomains = [];
  let thirdParty = null;
  for (const option of options) {
    if (option === 'third-party') thirdParty = true;
    else if (option === '~third-party') thirdParty = false;
    else if (option.startsWith('domain=')) {
      for (const entry of option.slice(7).split('|')) {
        if (entry.startsWith('~')) excludedDomains.push(normalizeHost(entry.slice(1)));
        else if (entry) domains.push(normalizeHost(entry));
      }
    } else {
      if (!option) continue;
      const excluded = option.startsWith('~');
      const type = excluded ? option.slice(1) : option;
      if (!supported.has(type)) return null;
      (excluded ? excludedTypes : types).push(type === 'xhr' ? 'xmlhttprequest' : type);
    }
  }
  return { id: 'abp-' + index, source: raw, exception, matcher, types, excludedTypes, domains, excludedDomains, thirdParty };
}
function isThirdParty(requestUrl, documentUrl) {
  if (!documentUrl) return false;
  try {
    const a = new URL(requestUrl), b = new URL(documentUrl);
    return !(a.hostname === b.hostname || hostMatchesDomain(a.hostname, b.hostname) || hostMatchesDomain(b.hostname, a.hostname));
  } catch { return false; }
}
function matchesCompiled(rule, url, request) {
  if (!rule.matcher.test(url.href)) return false;
  const type = String(request.resourceType || 'other').toLowerCase();
  if (rule.types.length && !rule.types.includes(type)) return false;
  if (rule.excludedTypes.includes(type)) return false;
  let documentHost = '';
  try { documentHost = (request.documentUrl || request.initiator) ? new URL((request.documentUrl || request.initiator)).hostname : ''; } catch {}
  if (rule.domains.length && !rule.domains.some((d) => hostMatchesDomain(documentHost, d))) return false;
  if (rule.excludedDomains.some((d) => hostMatchesDomain(documentHost, d))) return false;
  if (rule.thirdParty !== null && isThirdParty(url.href, (request.documentUrl || request.initiator)) !== rule.thirdParty) return false;
  return true;
}
function matchesLegacy(rule, url, request) {
  if (rule.domain && !hostMatchesDomain(url.hostname, rule.domain)) return false;
  if (rule.domains && !rule.domains.some((d) => hostMatchesDomain(url.hostname, d))) return false;
  if (rule.pathIncludes && !rule.pathIncludes.some((p) => url.pathname.toLowerCase().includes(p))) return false;
  if (rule.queryKeysAny && !rule.queryKeysAny.some((k) => url.searchParams.has(k))) return false;
  if (rule.resourceTypes && !rule.resourceTypes.includes(String(request.resourceType || 'other').toLowerCase())) return false;
  if (rule.methods && !rule.methods.includes(String(request.method || 'GET').toUpperCase())) return false;
  return true;
}
class LebeShields {
  #legacyRules;
  #networkRules = [];
  constructor(rules = []) {
    this.#legacyRules = rules.map((rule) => ({
      ...rule,
      domain: rule.domain ? normalizeHost(rule.domain).replace(/^\.+|\.+$/g, '') : undefined,
      domains: Array.isArray(rule.domains) ? rule.domains.map(normalizeHost) : undefined,
      pathIncludes: Array.isArray(rule.pathIncludes) ? rule.pathIncludes.map((v) => String(v).toLowerCase()) : undefined,
      queryKeysAny: Array.isArray(rule.queryKeysAny) ? rule.queryKeysAny.map((v) => String(v).toLowerCase()) : undefined,
      resourceTypes: Array.isArray(rule.resourceTypes) ? rule.resourceTypes.map((v) => String(v).toLowerCase()) : undefined,
      methods: Array.isArray(rule.methods) ? rule.methods.map((v) => String(v).toUpperCase()) : undefined,
    }));
  }
  addFilterList(text, source = 'custom') {
    let added = 0;
    for (const line of String(text || '').split(/\r?\n/)) {
      const rule = parseFilterLine(line, this.#networkRules.length);
      if (!rule) continue;
      rule.listSource = String(source).slice(0, 80);
      this.#networkRules.push(rule);
      added += 1;
    }
    return added;
  }
  evaluate(request = {}) {
    const url = parseRequest(request.url);
    if (!url) return { action: 'allow', reason: 'unsupported-url' };
    const exception = this.#networkRules.find((r) => r.exception && matchesCompiled(r, url, request));
    if (exception) return { action: 'allow', reason: 'filter-exception', ruleId: exception.id, source: exception.listSource };
    const match = this.#networkRules.find((r) => !r.exception && matchesCompiled(r, url, request));
    if (match) return { action: 'block', reason: 'network-filter', ruleId: match.id, source: match.listSource };
    const legacy = this.#legacyRules.find((r) => matchesLegacy(r, url, request));
    return legacy ? { action: 'block', reason: 'ad-or-tracker', ruleId: legacy.id } : { action: 'allow' };
  }
  get ruleCount() { return this.#legacyRules.length + this.#networkRules.length; }
  get networkRuleCount() { return this.#networkRules.length; }
}
module.exports = { LebeShields, hostMatchesDomain, parseFilterLine, compileNetworkPattern };
, 'i');
}
function compileNetworkPattern(pattern) {
  let value = String(pattern || '').trim();
  if (!value || value.startsWith('!') || value.startsWith('[') || value.includes('##') || value.includes('#@#')) return null;
  if (value.startsWith('||')) {
    value = value.slice(2);
    const separator = value.indexOf('^');
    const host = separator < 0 ? value : value.slice(0, separator);
    const rest = separator < 0 ? '' : value.slice(separator);
    return new RegExp('^(?:https?|wss?):\\/\\/(?:[^/]+\\.)?' + escapeRegex(host) + wildcardToRegExp(rest).source.slice(1), 'i');
  }
  const left = value.startsWith('|');
  const right = value.endsWith('|');
  if (left) value = value.slice(1);
  if (right) value = value.slice(0, -1);
  let source = wildcardToRegExp(value).source;
  if (!left) source = source.slice(1);
  if (!right) source = source.slice(0, -1);
  return new RegExp(source, 'i');
}
function parseFilterLine(line, index = 0) {
  const raw = String(line || '').trim();
  if (!raw || raw.startsWith('!') || raw.startsWith('[')) return null;
  const exception = raw.startsWith('@@');
  const body = exception ? raw.slice(2) : raw;
  const split = body.lastIndexOf('$');
  const pattern = split < 0 ? body : body.slice(0, split);
  const matcher = compileNetworkPattern(pattern);
  if (!matcher) return null;
  const options = split < 0 ? [] : body.slice(split + 1).split(',').map((v) => v.trim().toLowerCase());
  const supported = new Set(['document','subdocument','script','image','stylesheet','object','xmlhttprequest','xhr','media','font','other','ping','websocket']);
  const types = [], excludedTypes = [], domains = [], excludedDomains = [];
  let thirdParty = null;
  for (const option of options) {
    if (option === 'third-party') thirdParty = true;
    else if (option === '~third-party') thirdParty = false;
    else if (option.startsWith('domain=')) {
      for (const entry of option.slice(7).split('|')) {
        if (entry.startsWith('~')) excludedDomains.push(normalizeHost(entry.slice(1)));
        else if (entry) domains.push(normalizeHost(entry));
      }
    } else {
      const excluded = option.startsWith('~');
      const type = excluded ? option.slice(1) : option;
      if (supported.has(type)) (excluded ? excludedTypes : types).push(type === 'xhr' ? 'xmlhttprequest' : type);
    }
  }
  return { id: 'abp-' + index, source: raw, exception, matcher, types, excludedTypes, domains, excludedDomains, thirdParty };
}
function isThirdParty(requestUrl, documentUrl) {
  if (!documentUrl) return false;
  try {
    const a = new URL(requestUrl), b = new URL(documentUrl);
    return !(a.hostname === b.hostname || hostMatchesDomain(a.hostname, b.hostname) || hostMatchesDomain(b.hostname, a.hostname));
  } catch { return false; }
}
function matchesCompiled(rule, url, request) {
  if (!rule.matcher.test(url.href)) return false;
  const type = String(request.resourceType || 'other').toLowerCase();
  if (rule.types.length && !rule.types.includes(type)) return false;
  if (rule.excludedTypes.includes(type)) return false;
  let documentHost = '';
  try { documentHost = (request.documentUrl || request.initiator) ? new URL((request.documentUrl || request.initiator)).hostname : ''; } catch {}
  if (rule.domains.length && !rule.domains.some((d) => hostMatchesDomain(documentHost, d))) return false;
  if (rule.excludedDomains.some((d) => hostMatchesDomain(documentHost, d))) return false;
  if (rule.thirdParty !== null && isThirdParty(url.href, (request.documentUrl || request.initiator)) !== rule.thirdParty) return false;
  return true;
}
function matchesLegacy(rule, url, request) {
  if (rule.domain && !hostMatchesDomain(url.hostname, rule.domain)) return false;
  if (rule.domains && !rule.domains.some((d) => hostMatchesDomain(url.hostname, d))) return false;
  if (rule.pathIncludes && !rule.pathIncludes.some((p) => url.pathname.toLowerCase().includes(p))) return false;
  if (rule.queryKeysAny && !rule.queryKeysAny.some((k) => url.searchParams.has(k))) return false;
  if (rule.resourceTypes && !rule.resourceTypes.includes(String(request.resourceType || 'other').toLowerCase())) return false;
  if (rule.methods && !rule.methods.includes(String(request.method || 'GET').toUpperCase())) return false;
  return true;
}
class LebeShields {
  #legacyRules;
  #networkRules = [];
  constructor(rules = []) {
    this.#legacyRules = rules.map((rule) => ({
      ...rule,
      domain: rule.domain ? normalizeHost(rule.domain).replace(/^\.+|\.+$/g, '') : undefined,
      domains: Array.isArray(rule.domains) ? rule.domains.map(normalizeHost) : undefined,
      pathIncludes: Array.isArray(rule.pathIncludes) ? rule.pathIncludes.map((v) => String(v).toLowerCase()) : undefined,
      queryKeysAny: Array.isArray(rule.queryKeysAny) ? rule.queryKeysAny.map((v) => String(v).toLowerCase()) : undefined,
      resourceTypes: Array.isArray(rule.resourceTypes) ? rule.resourceTypes.map((v) => String(v).toLowerCase()) : undefined,
      methods: Array.isArray(rule.methods) ? rule.methods.map((v) => String(v).toUpperCase()) : undefined,
    }));
  }
  addFilterList(text, source = 'custom') {
    let added = 0;
    for (const line of String(text || '').split(/\r?\n/)) {
      const rule = parseFilterLine(line, this.#networkRules.length);
      if (!rule) continue;
      rule.listSource = String(source).slice(0, 80);
      this.#networkRules.push(rule);
      added += 1;
    }
    return added;
  }
  evaluate(request = {}) {
    const url = parseRequest(request.url);
    if (!url) return { action: 'allow', reason: 'unsupported-url' };
    const exception = this.#networkRules.find((r) => r.exception && matchesCompiled(r, url, request));
    if (exception) return { action: 'allow', reason: 'filter-exception', ruleId: exception.id, source: exception.listSource };
    const match = this.#networkRules.find((r) => !r.exception && matchesCompiled(r, url, request));
    if (match) return { action: 'block', reason: 'network-filter', ruleId: match.id, source: match.listSource };
    const legacy = this.#legacyRules.find((r) => matchesLegacy(r, url, request));
    return legacy ? { action: 'block', reason: 'ad-or-tracker', ruleId: legacy.id } : { action: 'allow' };
  }
  get ruleCount() { return this.#legacyRules.length + this.#networkRules.length; }
  get networkRuleCount() { return this.#networkRules.length; }
}
module.exports = { LebeShields, hostMatchesDomain, parseFilterLine, compileNetworkPattern };
