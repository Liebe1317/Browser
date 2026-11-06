# Lebe Architecture

## Product direction

Lebe is the browser product and architecture. Chromium is the current rendering engine adapter, not the owner of Lebe's architecture. The long-term goal is to be able to replace the current engine without rewriting browser policy, product services, or the UI.

## Layer boundaries

- **Lebe Browser** — user experience: windows, tabs, navigation UI, profiles, settings, downloads and permissions.
- **Lebe Core** — engine-neutral contracts and orchestration shared by the browser.
- **Lebe Shields** — request decisions, tracker/ad rules, popup policy, cosmetic filtering and privacy controls.
- **Lebe Network** — request lifecycle, proxy/VPN policy, DNS/TLS configuration and network diagnostics.
- **Lebe Intelligence** — optional classification and assistance. It must not silently override deterministic security policy.
- **Lebe Render** — the boundary between Lebe Core and a page-rendering implementation.
- **Engine adapters** — Chromium is the first adapter. A future Lebe Engine can implement the same contracts.

## Non-negotiable dependency rule

Code under `lebe/core` must not import Electron, Chromium, browser globals, or a particular rendering engine. Engine-specific APIs belong in adapter directories and must be translated into Lebe contracts at the boundary.

The current Electron integration is transitional. It may call Lebe through an adapter, but the core must not call back into Electron.

## Request decision lifecycle

1. An engine adapter converts its native request metadata into a `LebeRequest`.
2. Lebe Shields evaluates the request deterministically.
3. The adapter translates the `ShieldDecision` into the engine's native allow/cancel operation.
4. Sanitized events may be reported to the browser UI; secrets, credentials, and full sensitive URLs must not be logged.

The initial core deliberately provides a small, testable policy API. It does not claim EasyList/uBlock compatibility, YouTube in-stream ad removal, cosmetic filtering, or production-grade filter-list parsing yet.

## Migration sequence

1. Establish engine-neutral contracts and tests.
2. Move ad/tracker policy into Lebe Shields while keeping a temporary Chromium adapter.
3. Move network and popup policy behind adapter interfaces.
4. Add a second experimental engine adapter to prove the contracts are genuinely portable.
5. Develop or adopt the future Lebe rendering/runtime components and migrate compatibility incrementally.

## Definition of done for an engine-independent component

- No direct Electron/Chromium imports in its core module.
- Inputs and outputs are engine-neutral typed contracts.
- Unit tests run without launching a browser.
- At least one adapter consumes the contract.
- Security-sensitive behavior is fail-closed where appropriate and observable through tests.

## Current status

The first foundation commit adds the contracts and a deterministic host-rule evaluator. Existing browser behavior is not changed by this foundation alone. Integration into the current desktop request pipeline is a separate, reviewed step.
