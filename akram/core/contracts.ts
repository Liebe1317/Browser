/**
 * Engine-neutral contracts for the Lebe browser architecture.
 *
 * This module must remain independent from Electron, Chromium, DOM and Node APIs.
 */

export type AkramResourceType =
  | "main-frame"
  | "sub-frame"
  | "stylesheet"
  | "script"
  | "image"
  | "font"
  | "media"
  | "xmlhttprequest"
  | "websocket"
  | "other";

export interface AkramRequest {
  readonly url: string;
  readonly method: string;
  readonly resourceType: AkramResourceType;
  readonly isMainFrame: boolean;
  readonly initiator?: string;
  readonly tabId?: string;
  readonly timestamp?: number;
}

export type ShieldReason = "ad-or-tracker" | "network-filter" | "filter-exception" | "unsupported-url" | "popup" | "user-rule" | "module-disabled";

export type ShieldCategory = "network" | "cosmetic" | "popup" | "privacy" | "anti-cryptomining" | "malware" | "download" | "permissions";
export type ShieldProfileId = "akram-default" | "akram-strict" | "akram-custom";

export interface ShieldDecision {
  readonly action: "allow" | "block";
  readonly reason?: ShieldReason;
  readonly ruleId?: string;
  readonly source?: string;
  readonly category?: ShieldCategory;
  readonly profile?: ShieldProfileId;
}

export interface AkramRequestPolicy {
  evaluate(request: AkramRequest): ShieldDecision;
}

/**
 * The rendering adapter is intentionally capability-oriented. Concrete adapters
 * translate these operations to their own engine APIs; Lebe Core never imports them.
 */
export interface AkramPageHandle {
  readonly id: string;
}

export interface AkramRenderAdapter {
  readonly engineName: string;
  createPage(options: { readonly profileId: string; readonly privateMode: boolean }): Promise<AkramPageHandle>;
  navigate(page: AkramPageHandle, url: string): Promise<void>;
  closePage(page: AkramPageHandle): Promise<void>;
}

/** @deprecated Temporary compatibility aliases. Use the Akram-prefixed contracts. */
export type LebeResourceType = AkramResourceType;
export type LebeRequest = AkramRequest;
export type LebeRequestPolicy = AkramRequestPolicy;
export type LebePageHandle = AkramPageHandle;
export type LebeRenderAdapter = AkramRenderAdapter;
