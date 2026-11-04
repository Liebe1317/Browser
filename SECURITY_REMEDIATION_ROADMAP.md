# Aegis Browser — Security Remediation & Platform Roadmap

> Working branch: security/hardening-foundation
> Baseline: main at cb8229bc94dfb236fe0753b507e53e4fec726704 (2026-11-04)
> Policy: no security fix is complete without a regression test. Never commit directly to main.

## Product direction

Aegis is currently a React/Vite UI backed by an Express/Undici fetch proxy. The repository also contains an Electron entry point, but the current package manifest does not declare Electron or provide desktop build scripts. The page renderer rewrites remote HTML and runs it in sandboxed frames.

The target architecture separates:

1. **Shared product UI** — tabs, address bar, bookmarks, history, settings, vault UI, and accessibility. Keep React components where practical.
2. **Browser Core (platform-neutral)** — typed navigation policy, origin/site identity, permission decisions, tracker rules, private-session lifecycle, storage contracts, and security test vectors. No DOM, Electron, Android, iOS, or Node globals in this layer.
3. **Platform adapters** — desktop Chromium adapter first; Android WebView and iOS WKWebView adapters later. Each adapter implements the same policy contract and declares capabilities it cannot enforce.
4. **Trusted application shell** — the only process/window allowed to access privileged APIs. Arbitrary websites never receive Node, filesystem, vault, IPC, or application-session capabilities.

## Non-negotiable security invariants

- main remains unchanged until reviewed changes pass tests.
- A missing Fetch Metadata header is never treated as authentication.
- No public/open proxy. Local mode binds to loopback only. Any future remote mode requires an explicit authenticated deployment design and is disabled by default.
- Site content is untrusted. Never interpolate query strings, URLs, titles, snippets, or response content into HTML/JavaScript without context-correct encoding.
- No secrets or session tokens in URLs, page source, console logs, analytics, or error messages.
- Proxy capabilities are short-lived, revocable, session-bound, and scoped to an exact top-level browsing context. A page token must not silently inherit another tab's privileges.
- Cookie storage follows Secure, HttpOnly, SameSite, Domain, Path, expiry, and public-suffix rules. Private contexts use separate ephemeral storage and are destroyed when closed.
- All outbound work has explicit size, time, concurrency, and cancellation limits.
- Remote content has no privileged bridge. Validate the sender and message schema for every native IPC call.
- Privacy claims must match measured behavior; disclose when data is sent to an external provider such as Gemini.

## Repair sequence

### Phase 0 — Establish a verifiable baseline
- Pin the reviewed base commit and use this branch for all patches.
- Re-run the current unit and proxy integration tests in CI.
- Add a security regression suite for XSS, origin/CSRF, token scope, cookie policy, private-session isolation, request size/time limits, and log redaction.
- Revalidate each earlier audit claim against the exact source and tests. Distinguish confirmed defects from assumptions and compatibility limitations.

### Phase 1 — Remove injection at trust boundaries (P0)
- Contextually escape all user/search/provider-controlled values rendered into generated HTML.
- Permit only HTTP(S) result links; reject script/data/file schemes and credential-bearing URLs.
- Remove inline event handlers from generated UI where they are not essential.
- Add regression tests using HTML, attribute, quote, and javascript-scheme payloads.

### Phase 2 — Authenticate local application requests (P0)
- Replace Fetch Metadata as the sole API guard with a bootstrap/session design: exact Host/Origin checks, a session-bound CSRF token for state-changing requests, and explicit denial when required credentials are absent.
- Separate app navigation authorization from subresource authorization.
- Do not mint a browser session merely because an unauthenticated request reached the proxy endpoint.
- Add tests for absent, forged, cross-origin, same-site, and valid same-origin requests.

### Phase 3 — Rebuild site/session isolation (P0/P1)
- Use exact top-level browsing-context identity rather than registrable-domain equality as the only capability boundary.
- Make proxy tokens unforgeable, short-lived, revocable, and scoped to the tab/context that minted them.
- Do not share one cookie jar across sibling subdomains or unrelated tabs by default.
- Enforce cookie flags and public suffix validation; test Secure-over-HTTP, SameSite, __Host-, __Secure-, and sibling-host access.
- Give private contexts separate non-persistent sessions and destroy them on close.

### Phase 4 — Bound resource consumption and reduce data collection (P1)
- Remove request-body, query-string, cookie-name, and response-body debug logging.
- Enforce a single deadline through response-body consumption, byte caps on every path, bounded concurrency, and cancellation propagation.
- Add per-session request budgets and safe error responses.

### Phase 5 — Replace the custom page-rewriting browser surface (strategic)
- Treat the current proxy/HTML-rewriting renderer as a transitional compatibility layer, not the final security boundary.
- Desktop: use isolated Chromium WebContentsView instances for site content; keep the React app shell trusted and separate. Set nodeIntegration=false, contextIsolation=true, sandbox=true, restrictive CSP, explicit permission handlers, navigation/window-open controls, and strict IPC sender validation.
- Prefer Chromium's native cookie/TLS/SameSite implementation over a hand-written cookie implementation wherever feasible.
- Keep network/privacy policy behind a platform adapter; avoid exposing the proxy as a general-purpose HTTP service.

### Phase 6 — Mobile and cross-platform delivery
- Reuse the shared React product UI and Browser Core contracts, not desktop-specific privileged APIs.
- Android adapter: evaluate Android WebView request interception, download handling, permission mediation, and isolated profiles.
- iOS adapter: use WKWebView with its own content-rule, navigation, permission, and website-data-store adapter; explicitly document engine/platform limitations.
- Maintain platform capability matrices: no feature is advertised as protected unless the platform adapter can enforce and test it.
- Do not choose a cross-platform shell solely for code reuse if it weakens browsing isolation or prevents required browser-engine controls.

## Release gates

A release is blocked if any of these fail:
- TypeScript/lint and production build.
- Unit + proxy integration + browser-driven security regression tests.
- XSS fixtures render as inert text and unsafe schemes cannot navigate.
- Unauthenticated API/proxy calls fail closed.
- A token from one browsing context cannot access another context's cookies or privileged APIs.
- Private context data is absent after close/restart.
- Cookie security attributes are preserved and enforced.
- Network responses are bounded and cancellable.
- Electron security warnings are absent; no untrusted page has Node/IPC access.
- Privacy/security documentation accurately describes the implementation.

## Current first patch

Phase 1 starts with an extracted, testable HTML-rendering helper for search result cards. This is intentionally small so the first fix can be independently reviewed and verified before changing session semantics.