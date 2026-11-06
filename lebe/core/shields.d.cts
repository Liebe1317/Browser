import type { LebeRequest, LebeRequestPolicy, ShieldDecision } from "./contracts";

export declare function hostMatchesDomain(hostname: string, domain: string): boolean;

export declare class LebeShields implements LebeRequestPolicy {
  constructor(rules?: readonly { readonly id: string; readonly domain: string }[]);
  evaluate(request: LebeRequest): ShieldDecision;
  readonly ruleCount: number;
}
