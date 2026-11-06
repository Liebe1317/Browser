import runtime from "./shields.cjs";
import type { AkramRequest, AkramRequestPolicy, ShieldDecision } from "./contracts";

export interface AkramHostRule {
  readonly id: string;
  readonly domain?: string;
  readonly domains?: readonly string[];
  readonly pathIncludes?: readonly string[];
  readonly queryKeysAny?: readonly string[];
  readonly resourceTypes?: readonly string[];
  readonly methods?: readonly string[];
}

/** Shared host matcher from the engine-neutral runtime implementation. */
export const hostMatchesDomain = runtime.hostMatchesDomain;

/**
 * Typed TypeScript facade over the same runtime used by the temporary Chromium
 * adapter. This prevents the test/type surface and production policy from drifting.
 */
export class AkramShields implements AkramRequestPolicy {
  readonly #runtime: InstanceType<typeof runtime.AkramShields>;

  constructor(rules: readonly AkramHostRule[] = []) {
    this.#runtime = new runtime.AkramShields(rules);
  }

  evaluate(request: AkramRequest): ShieldDecision {
    return this.#runtime.evaluate(request);
  }

  addFilterList(content: string, source = 'custom'): number {
    return this.#runtime.addFilterList(content, source);
  }

  get networkRuleCount(): number {
    return this.#runtime.networkRuleCount;
  }

  get ruleCount(): number {
    return this.#runtime.ruleCount;
  }
}

/** @deprecated Use AkramHostRule. */
export type LebeHostRule = AkramHostRule;
/** @deprecated Use AkramShields. */
export { AkramShields as LebeShields };
