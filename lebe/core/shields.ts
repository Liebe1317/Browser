import type { LebeRequest, LebeRequestPolicy, ShieldDecision } from "./contracts";

export interface LebeHostRule {
  readonly id: string;
  readonly domain: string;
}

/**
 * Match a host and its subdomains without matching lookalike suffixes.
 * Example: ads.example.test matches example.test; not example.test.attacker.test.
 */
export function hostMatchesDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const normalizedDomain = domain.toLowerCase().replace(/^\.+|\.+$/g, "");
  return host === normalizedDomain || host.endsWith("." + normalizedDomain);
}

function requestHostname(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "ws:" && url.protocol !== "wss:") {
      return null;
    }
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

export class LebeShields implements LebeRequestPolicy {
  readonly #rules: readonly LebeHostRule[];

  constructor(rules: readonly LebeHostRule[] = []) {
    this.#rules = rules.map((rule) => ({
      id: rule.id,
      domain: rule.domain.toLowerCase().replace(/^\.+|\.+$/g, ""),
    }));
  }

  evaluate(request: LebeRequest): ShieldDecision {
    const hostname = requestHostname(request.url);
    if (!hostname) return { action: "allow" };

    const match = this.#rules.find((rule) => hostMatchesDomain(hostname, rule.domain));
    if (!match) return { action: "allow" };

    return {
      action: "block",
      reason: "ad-or-tracker",
      ruleId: match.id,
    };
  }

  get ruleCount(): number {
    return this.#rules.length;
  }
}
