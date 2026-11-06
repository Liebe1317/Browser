/**
 * Engine-neutral contracts for the Lebe browser architecture.
 *
 * This module must remain independent from Electron, Chromium, DOM and Node APIs.
 */

export type LebeResourceType =
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

export interface LebeRequest {
  readonly url: string;
  readonly method: string;
  readonly resourceType: LebeResourceType;
  readonly isMainFrame: boolean;
  readonly initiator?: string;
  readonly tabId?: string;
  readonly timestamp?: number;
}

export type ShieldReason = "ad-or-tracker" | "network-filter" | "filter-exception" | "unsupported-url" | "popup" | "user-rule";

export interface ShieldDecision {
  readonly action: "allow" | "block";
  readonly reason?: ShieldReason;
  readonly ruleId?: string;
}

export interface LebeRequestPolicy {
  evaluate(request: LebeRequest): ShieldDecision;
}

/**
 * The rendering adapter is intentionally capability-oriented. Concrete adapters
 * translate these operations to their own engine APIs; Lebe Core never imports them.
 */
export interface LebePageHandle {
  readonly id: string;
}

export interface LebeRenderAdapter {
  readonly engineName: string;
  createPage(options: { readonly profileId: string; readonly privateMode: boolean }): Promise<LebePageHandle>;
  navigate(page: LebePageHandle, url: string): Promise<void>;
  closePage(page: LebePageHandle): Promise<void>;
}
