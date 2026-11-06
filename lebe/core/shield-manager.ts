import runtime from "./shield-manager.cjs";
import type {
  LebeRequest,
  LebeRequestPolicy,
  ShieldDecision,
  ShieldProfileId,
} from "./contracts";

export type LebeShieldModule = "network" | "cosmetic";

export interface LebeShieldFilterListInput {
  readonly id: string;
  readonly source?: string;
  readonly content: string;
}

export interface LebeShieldFilterListMetadata {
  readonly id: string;
  readonly source: string;
  readonly lineCount: number;
  readonly networkRuleCount: number;
  readonly cosmeticRuleCount: number;
  readonly unsupportedLineCount: number;
  readonly enabled: boolean;
}

export interface LebeShieldStats {
  readonly profile: ShieldProfileId;
  readonly modules: Readonly<Record<LebeShieldModule, boolean>>;
  readonly filterListCount: number;
  readonly networkRuleCount: number;
  readonly legacyRuleCount: number;
  readonly ruleCount: number;
  readonly cosmeticRuleCount: number;
  readonly unsupportedLineCount: number;
}

export interface LebeShieldManagerOptions {
  readonly legacyRules?: readonly Record<string, unknown>[];
  readonly limits?: {
    readonly maxListBytes?: number;
    readonly maxTotalBytes?: number;
    readonly maxLinesPerList?: number;
    readonly maxFilterLists?: number;
  };
}

/** Typed engine-neutral facade for the central Lebe Shield policy manager. */
export class LebeShieldManager implements LebeRequestPolicy {
  readonly #runtime: InstanceType<typeof runtime.LebeShieldManager>;

  constructor(options: LebeShieldManagerOptions = {}) {
    this.#runtime = new runtime.LebeShieldManager(options);
  }

  addFilterList(input: LebeShieldFilterListInput): LebeShieldFilterListMetadata {
    return this.#runtime.addFilterList(input);
  }

  updateFilterList(input: LebeShieldFilterListInput): LebeShieldFilterListMetadata {
    return this.#runtime.updateFilterList(input);
  }

  removeFilterList(id: string): boolean {
    return this.#runtime.removeFilterList(id);
  }

  listFilterLists(): readonly LebeShieldFilterListMetadata[] {
    return this.#runtime.listFilterLists();
  }

  evaluateRequest(request: LebeRequest): ShieldDecision {
    return this.#runtime.evaluateRequest(request as unknown as Record<string, unknown>) as unknown as ShieldDecision;
  }

  evaluate(request: LebeRequest): ShieldDecision {
    return this.evaluateRequest(request);
  }

  getCosmeticCss(rawUrl: string): string {
    return this.#runtime.getCosmeticCss(rawUrl);
  }

  setModuleEnabled(module: LebeShieldModule, enabled: boolean): Readonly<Record<LebeShieldModule, boolean>> {
    return this.#runtime.setModuleEnabled(module, enabled);
  }

  getModuleStates(): Readonly<Record<LebeShieldModule, boolean>> {
    return this.#runtime.getModuleStates();
  }

  getStats(): LebeShieldStats {
    return this.#runtime.getStats() as unknown as LebeShieldStats;
  }
}
