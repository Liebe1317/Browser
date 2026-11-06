declare class LebeShields {
  constructor(rules?: readonly { readonly id: string; readonly domain: string }[]);
  evaluate(request: import("./contracts").LebeRequest): import("./contracts").ShieldDecision;
  readonly ruleCount: number;
}

declare function hostMatchesDomain(hostname: string, domain: string): boolean;

declare const runtime: {
  LebeShields: typeof LebeShields;
  hostMatchesDomain: typeof hostMatchesDomain;
};

export default runtime;
