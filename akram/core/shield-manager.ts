import runtime from "./shield-manager.cjs";
import type {
  AkramRequest,
  AkramRequestPolicy,
  ShieldDecision,
  ShieldProfileId,
} from "./contracts";

export type AkramShieldModule = "network" | "cosmetic";

export interface AkramShieldFilterListInput {
  readonly id: string;
  readonly source?: string;
  readonly content: string;
}

export interface AkramShieldFilterListMetadata {
  readonly id: string;
  readonly source: string;
  readonly lineCount: number;
  readonly networkRuleCount: number;
  readonly cosmeticRuleCount: number;
  readonly unsupportedLineCount: number;
  readonly enabled: boolean;
}

export interface AkramShieldStats {
  readonly profile: ShieldProfileId;
  readonly modules: Readonly<Record<AkramShieldModule, boolean>>;
  readonly filterListCount: number;
  readonly networkRuleCount: number;
  readonly legacyRuleCount: number;
  readonly ruleCount: number;
  readonly cosmeticRuleCount: number;
  readonly unsupportedLineCount: number;
}

export interface AkramShieldManagerOptions {
  readonly legacyRules?: readonly Record<string, unknown>[];
  readonly limits?: {
    readonly maxListBytes?: number;
    readonly maxTotalBytes?: number;
    readonly maxLinesPerList?: number;
    readonly maxFilterLists?: number;
  };
}

/** Typed engine-neutral facade for the central Akram Shield policy manager. */
export class AkramShieldManager implements AkramRequestPolicy {
  readonly #runtime: InstanceType<typeof runtime.AkramShieldManager>;

  constructor(options: AkramShieldManagerOptions = {}) {
    this.#runtime = new runtime.AkramShieldManager(options);
  }

  addFilterList(input: AkramShieldFilterListInput): AkramShieldFilterListMetadata {
    return this.#runtime.addFilterList(input);
  }

  updateFilterList(input: AkramShieldFilterListInput): AkramShieldFilterListMetadata {
    return this.#runtime.updateFilterList(input);
  }

  removeFilterList(id: string): boolean {
    return this.#runtime.removeFilterList(id);
  }

  listFilterLists(): readonly AkramShieldFilterListMetadata[] {
    return this.#runtime.listFilterLists();
  }

  evaluateRequest(request: AkramRequest): ShieldDecision {
    return this.#runtime.evaluateRequest(request as unknown as Record<string, unknown>) as unknown as ShieldDecision;
  }

  evaluate(request: AkramRequest): ShieldDecision {
    return this.evaluateRequest(request);
  }

  getCosmeticCss(rawUrl: string): string {
    return this.#runtime.getCosmeticCss(rawUrl);
  }

  setModuleEnabled(module: AkramShieldModule, enabled: boolean): Readonly<Record<AkramShieldModule, boolean>> {
    return this.#runtime.setModuleEnabled(module, enabled);
  }

  getModuleStates(): Readonly<Record<AkramShieldModule, boolean>> {
    return this.#runtime.getModuleStates();
  }

  getStats(): AkramShieldStats {
    return this.#runtime.getStats() as unknown as AkramShieldStats;
  }
}

/** @deprecated Compatibility aliases; use Akram-prefixed types and class. */
export type LebeShieldModule = AkramShieldModule;
export type LebeShieldFilterListInput = AkramShieldFilterListInput;
export type LebeShieldFilterListMetadata = AkramShieldFilterListMetadata;
export type LebeShieldStats = AkramShieldStats;
export type LebeShieldManagerOptions = AkramShieldManagerOptions;
export { AkramShieldManager as LebeShieldManager };
