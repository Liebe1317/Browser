export type {
  AkramPageHandle, AkramRenderAdapter, AkramRequest, AkramRequestPolicy, AkramResourceType,
  ShieldDecision, ShieldReason, ShieldCategory, ShieldProfileId,
  LebePageHandle, LebeRenderAdapter, LebeRequest, LebeRequestPolicy, LebeResourceType,
} from "./contracts";

export { hostMatchesDomain, AkramShields, AkramShields as LebeShields } from "./shields";
export type { AkramHostRule, LebeHostRule } from "./shields";

export { AkramShieldManager, AkramShieldManager as LebeShieldManager } from "./shield-manager";
export type {
  AkramShieldFilterListInput, AkramShieldFilterListMetadata, AkramShieldManagerOptions,
  AkramShieldModule, AkramShieldStats,
  LebeShieldFilterListInput, LebeShieldFilterListMetadata, LebeShieldManagerOptions,
  LebeShieldModule, LebeShieldStats,
} from "./shield-manager";
