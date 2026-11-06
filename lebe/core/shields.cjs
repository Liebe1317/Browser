'use strict';

/**
 * Engine-neutral Lebe Shields runtime.
 * This module must not import Electron, Chromium, DOM, or renderer APIs.
 */

function hostMatchesDomain(hostname, domain) {
  const host = String(hostname).toLowerCase().replace(/\.$/, '');
  const normalizedDomain = String(domain).toLowerCase().replace(/^\.+|\.+$/g, '');
  return host === normalizedDomain || host.endsWith('.' + normalizedDomain);
}

function parseRequest(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

function matchesRule(rule, url, request) {
  if (rule.domain && !hostMatchesDomain(url.hostname, rule.domain)) return false;
  if (rule.domains && !rule.domains.some((domain) => hostMatchesDomain(url.hostname, domain))) return false;
  if (rule.pathIncludes && !rule.pathIncludes.some((part) => url.pathname.toLowerCase().includes(part))) return false;
  if (rule.queryKeysAny && !rule.queryKeysAny.some((key) => url.searchParams.has(key))) return false;
  if (rule.resourceTypes && !rule.resourceTypes.includes(String(request.resourceType || 'other').toLowerCase())) return false;
  if (rule.methods && !rule.methods.includes(String(request.method || 'GET').toUpperCase())) return false;
  return true;
}

class LebeShields {
  #rules;

  constructor(rules = []) {
    this.#rules = rules.map((rule) => ({
      ...rule,
      domain: rule.domain ? String(rule.domain).toLowerCase().replace(/^\.+|\.+$/g, '') : undefined,
      domains: Array.isArray(rule.domains) ? rule.domains.map((domain) => String(domain).toLowerCase()) : undefined,
      pathIncludes: Array.isArray(rule.pathIncludes) ? rule.pathIncludes.map((part) => String(part).toLowerCase()) : undefined,
      queryKeysAny: Array.isArray(rule.queryKeysAny) ? rule.queryKeysAny.map((key) => String(key).toLowerCase()) : undefined,
      resourceTypes: Array.isArray(rule.resourceTypes) ? rule.resourceTypes.map((type) => String(type).toLowerCase()) : undefined,
      methods: Array.isArray(rule.methods) ? rule.methods.map((method) => String(method).toUpperCase()) : undefined,
    }));
  }

  evaluate(request = {}) {
    const url = parseRequest(request.url);
    if (!url) return { action: 'allow' };

    const match = this.#rules.find((rule) => matchesRule(rule, url, request));
    if (!match) return { action: 'allow' };

    return { action: 'block', reason: 'ad-or-tracker', ruleId: match.id };
  }

  get ruleCount() {
    return this.#rules.length;
  }
}

module.exports = { LebeShields, hostMatchesDomain };
