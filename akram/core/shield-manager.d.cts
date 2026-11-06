declare class AkramShieldManager {
  constructor(options?: {
    legacyRules?: readonly Record<string, unknown>[];
    limits?: { maxListBytes?: number; maxTotalBytes?: number; maxLinesPerList?: number; maxFilterLists?: number };
  });
  addFilterList(input: { id: string; source?: string; content: string; enabled?: boolean }): {
    readonly id: string;
    readonly source: string;
    readonly lineCount: number;
    readonly networkRuleCount: number;
    readonly cosmeticRuleCount: number;
    readonly unsupportedLineCount: number;
    readonly enabled: boolean;
  };
  updateFilterList(input: { id: string; source?: string; content: string; enabled?: boolean }): ReturnType<AkramShieldManager["addFilterList"]>;
  setFilterListEnabled(id: string, enabled: boolean): ReturnType<AkramShieldManager["addFilterList"]> | false;
  removeFilterList(id: string): boolean;
  listFilterLists(): ReturnType<AkramShieldManager["addFilterList"]>[];
  evaluateRequest(request?: Record<string, unknown>): Readonly<Record<string, unknown>>;
  evaluate(request?: Record<string, unknown>): Readonly<Record<string, unknown>>;
  getCosmeticCss(rawUrl: string): string;
  setModuleEnabled(module: "network" | "cosmetic", enabled: boolean): Readonly<{ network: boolean; cosmetic: boolean }>;
  getModuleStates(): Readonly<{ network: boolean; cosmetic: boolean }>;
  getStats(): Readonly<Record<string, unknown>>;
}
declare const runtime: { AkramShieldManager: typeof AkramShieldManager; LebeShieldManager: typeof AkramShieldManager };
export default runtime;
