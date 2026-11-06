declare class LebeShields {
  constructor(rules?: readonly { readonly id: string; readonly domain?: string; readonly domains?: readonly string[]; readonly pathIncludes?: readonly string[]; readonly queryKeysAny?: readonly string[]; readonly resourceTypes?: readonly string[]; readonly methods?: readonly string[] }[]);
  evaluate(request: import("./contracts").LebeRequest): import("./contracts").ShieldDecision;
  addFilterList(content: string, source?: string): number;
  readonly networkRuleCount: number;
  readonly ruleCount: number;
}

declare function hostMatchesDomain(hostname: string, domain: string): boolean;

declare const runtime: {
  LebeShields: typeof LebeShields;
  hostMatchesDomain: typeof hostMatchesDomain;
};

export default runtime;
