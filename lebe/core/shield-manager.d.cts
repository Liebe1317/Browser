declare class LebeShieldManager {
  constructor(options?: {
    legacyRules?: readonly Record<string, unknown>[];
    limits?: { maxListBytes?: number; maxLinesPerList?: number };
  });
  addFilterList(input: { id: string; source?: string; content: string }): {
    readonly id: string;
    readonly source: string;
    readonly lineCount: number;
    readonly networkRuleCount: number;
    readonly cosmeticRuleCount: number;
    readonly unsupportedLineCount: number;
    readonly enabled: boolean;
  };
  updateFilterList(input: { id: string; source?: string; content: string }): ReturnType<LebeShieldManager["addFilterList"]>;
  removeFilterList(id: string): boolean;
  listFilterLists(): ReturnType<LebeShieldManager["addFilterList"]>[];
  evaluateRequest(request?: Record<string, unknown>): Readonly<Record<string, unknown>>;
  getCosmeticCss(rawUrl: string): string;
  setModuleEnabled(module: "network" | "cosmetic", enabled: boolean): Readonly<{ network: boolean; cosmetic: boolean }>;
  getModuleStates(): Readonly<{ network: boolean; cosmetic: boolean }>;
  getStats(): Readonly<Record<string, unknown>>;
}
declare const runtime: { LebeShieldManager: typeof LebeShieldManager };
export default runtime;
