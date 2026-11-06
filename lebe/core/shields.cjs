'use strict';

/**
 * Engine-neutral Lebe Shields runtime.
 * No Electron, Chromium, DOM, or browser-engine APIs are allowed here.
 */

function hostMatchesDomain(hostname, domain) {
  const host = String(hostname).toLowerCase().replace(/\.$/, "");
  const normalizedDomain = String(domain).toLowerCase().replace(/^\.+|\.+$/g, "");
  return host === normalizedDomain || host.endsWith("." + normalizedDomain);
}

function requestHostname(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) return null;
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

class LebeShields {
  #rules;

  constructor(rules = []) {
    this.#rules = rules.map((rule) => ({
      id: rule.id,
      domain: String(rule.domain).toLowerCase().replace(/^\.+|\.+$/g, ""),
    }));
  }

  evaluate(request) {
    const hostname = requestHostname(request.url);
    if (!hostname) return { action: "allow" };

    const match = this.#rules.find((rule) => hostMatchesDomain(hostname, rule.domain));
    if (!match) return { action: "allow" };

    return { action: "block", reason: "ad-or-tracker", ruleId: match.id };
  }

  get ruleCount() {
    return this.#rules.length;
  }
}

module.exports = { LebeShields, hostMatchesDomain };
