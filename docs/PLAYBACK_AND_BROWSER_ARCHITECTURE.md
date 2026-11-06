# Aegis Browser — Secure Native Browsing & Media Architecture

Status: implementation in progress; Electron native browsing is primary, proxy mode is a constrained fallback
Target branch: security/hardening-foundation
Decision: use the Chromium engine already shipped by Electron for desktop site rendering. Do not build a second browser engine or a site-specific video extractor.

## 1. Security comes before compatibility

Aegis must not weaken isolation to make a player work. The following are release invariants:

- The React application shell is trusted; every remote site is untrusted.
- Remote pages never receive Node.js, filesystem, vault, application-session, or privileged IPC access.
- Electron site contents run in sandboxed, context-isolated renderer processes with Node integration disabled.
- Site tabs use isolated Chromium sessions/partitions. Regular and private profiles are separate; private storage is in-memory and destroyed when the private context closes.
- Permission requests default-deny. Camera, microphone, geolocation, notifications, USB, serial, Bluetooth, clipboard-read, and MIDI remain denied unless a narrowly scoped permission UX is designed and tested.
- Navigation, popups, downloads, protocol handlers, and IPC are mediated by the trusted main process.
- Native desktop site views never receive the application session cookie or privileged IPC capabilities. The web-only proxy currently places a short-lived, page-scoped capability in proxy query URLs because its sandboxed opaque-origin requests need a same-origin transport. This is a documented security limitation: the page can see and replay its own capability within its exact context and top-level hostname until expiry; do not claim that proxy mode meets the no-capability-in-URL target.
- No DRM circumvention, authentication bypass, anti-bot evasion, or forced cross-origin access. A site that requires unsupported DRM or denies access is reported as unsupported.
- Aksa/VPN fail-closed behavior must cover every site session, not only the app shell.

## 2. Why Chromium, not a custom media engine

Chromium already implements HTML parsing, JavaScript, HTMLMediaElement, MSE, EME, HLS/DASH support where available, codecs, redirects, cookies, TLS, and browser networking. A custom extractor/proxy would have to reimplement parts of these standards while increasing exposure to SSRF, cookie leakage, CORS errors, token expiry, range-request bugs, and codec incompatibility.

Aegis will own policy and diagnostics, not media decoding:
- Chromium owns page rendering and standards-compliant playback.
- Aegis Browser Core owns navigation decisions, profile identity, permission policy, tracker policy, and privacy settings.
- Electron adapters enforce those decisions at the session/WebContents boundary.
- The existing Express proxy remains a compatibility feature for web-only mode and selected internal fetches; it is not the security boundary for native desktop browsing.

## 3. Target architecture

### Trusted application shell
React UI runs in the existing trusted BrowserWindow. It communicates with the main process only through a small preload API with validated, typed messages. The shell does not render arbitrary site HTML.

### Native site surface
Each desktop tab is a dedicated WebContentsView (or equivalent supported Electron view) managed by the main process. The main process creates it with:
- nodeIntegration=false
- contextIsolation=true
- sandbox=true
- webSecurity=true
- webviewTag=false
- no remote module or generic execute-JavaScript bridge
- a per-profile Chromium session partition
- strict navigation and window-open handlers
- default-deny permission handlers
- download mediation and safe filename/path handling

The trusted app renderer can invoke only the narrow tab operations exposed by preload. The main process validates each sender, validates tab IDs, and currently permits only the registered `main` profile ID; it owns the WebContents-to-tab mapping. Remote site views receive no preload or privileged IPC surface.

### Browser Core (platform-neutral)
Pure TypeScript policy modules define:
- NavigationRequest and NavigationDecision
- ProfileId / BrowsingContextId
- PermissionRequest and PermissionDecision
- Privacy settings and tracker classification
- capability declarations for each platform adapter
- safe, bounded diagnostic events

This layer must not import Electron, DOM, Node, or platform globals.

### Media compatibility and diagnostics
No domain allowlists or fake server buttons. Chromium discovers and plays media naturally. Aegis may observe non-sensitive metadata from the trusted browser adapter (media element state, MIME type, network error class, codec support result) and present actionable diagnostics.

Diagnostics must not collect media URLs with query strings, cookies, authorization headers, page text, titles, or browsing history by default. If a user explicitly enables detailed diagnostics, redact credentials and query parameters and keep data local.

## 4. Media handling policy

1. Let the site use its normal HTML5/MSE/EME player inside its isolated Chromium site surface.
2. Do not rewrite media URLs or proxy byte-range requests in the desktop native path.
3. Do not relax CSP or CORS to make a player work.
4. Do not inject scripts into sites to scrape hidden stream endpoints.
5. If playback fails, classify the failure using browser-provided error categories and offer a clear message:
   - unsupported codec/container
   - network or TLS failure
   - site authentication/session requirement
   - browser permission/policy denial
   - DRM/EME unsupported by the current build/platform
   - source unavailable or server-side failure
6. A future optional player UI may control a standard HTMLMediaElement only when the site exposes one through a safe, explicit integration. It must not fetch protected streams independently.

## 5. Privacy and storage model

- Regular profile: persistent Chromium partition, isolated from private profile.
- Private profile: unique in-memory partition; clear cookies, local storage, IndexedDB, service workers, cache, HTTP auth state, and host resolver cache after its final private tab closes. Electron keeps the Session object process-cached, so the cleared partition may be reused only after cleanup completes.
- Separate profiles do not share cookies, local storage, IndexedDB, service workers, cache, or permissions.
- Third-party cookie policy follows Chromium's supported controls; tracker blocking is enforced through request interception without broad allow rules.
- DNS, proxy, and VPN behavior must be documented honestly. A VPN indicator is shown only after tunnel health is verified. If the tunnel fails while enabled, external traffic is blocked rather than sent directly.
- No analytics or remote telemetry by default. Any external AI feature must disclose the provider and data sent before use.

## 6. Web-only fallback

The current Express HTML-rewriting proxy is not equivalent to a full browser engine. Keep it isolated as a compatibility fallback:
- loopback-only binding and authenticated app bootstrap
- in-memory app sessions currently expire after 24 hours; page capabilities expire after 1 hour
- page capabilities are 24-byte random tokens encoded as 48 hexadecimal characters, bound to one app session, one browsing context, and one exact top-level hostname; closing a private context revokes its tokens
- **Known limitation:** page capabilities are currently carried in proxy query parameters so sandboxed opaque-origin pages can issue same-origin proxy requests. The page can read its own token. This is narrower than an app credential, but it is still a bearer capability in a URL and must be migrated to a non-URL transport or explicitly risk-accepted before release-grade web-only claims
- strict SSRF checks apply to every target, redirect hop, and guarded DNS connection
- response caps are 10 MiB for HTML/CSS and 50 MiB for other proxied bodies; deadlines and cancellation remain enforced
- relative fetch/XHR URLs resolve against the actual upstream page URL; dynamic fetch, XHR, iframe, image, script, and media sources use the scoped page capability
- validated HTTP byte ranges and Content-Range / Accept-Ranges metadata are preserved for media requests; response bodies are still buffered and capped, so this is not a full streaming proxy
- capability-expiry errors expose only a fixed recovery code/header; the trusted UI can reload the frame to mint a fresh page capability
- restrictive CSP remains fail-closed; unsupported sites are reported rather than weakening it
- never claim that proxy mode provides the same compatibility or privacy guarantees as native Chromium mode

## 7. Implementation phases

### Phase A — Browser Core contracts and tests
Create platform-neutral types and pure policy functions. Add tests for navigation, context ownership, permission defaults, private-profile lifecycle, and diagnostic redaction.

### Phase B — Electron native site surface
Add a main-process-owned tab/view manager. The app shell creates, navigates, resizes, and closes tabs through narrow preload methods. Add sender validation and tests for untrusted IPC, popup denial, external navigation, and partition isolation.

### Phase C — Privacy enforcement
Apply request filtering, permissions, download policy, VPN fail-closed routing, and private-session destruction to every site session. Add integration tests and an explicit capability matrix.

### Phase D — Media diagnostics
Add local-only, redacted playback diagnostics and fixtures for MP4, HLS/MSE, redirects, range requests, unsupported codecs, and DRM-required content. Do not add site-specific extraction.

### Phase E — Retire desktop proxy rendering
Use native Chromium site surfaces by default in Electron. Keep proxy rendering only for web-only mode and compatibility cases, with honest limitations.



### Current implementation status on this branch

- **Phase A:** platform-neutral browser policy and unit tests are present.
- **Phase B:** Electron uses a main-process-owned `WebContentsView` per web tab. Site views use profile-scoped Chromium sessions, no preload, strict webPreferences, bounded native-view geometry, popup denial, and HTTP(S)-only navigation. The app shell controls them through narrow sender-validated IPC.
- **Phase C (partial):** every registered Chromium session receives the same tracker, permission, and VPN health policy. The trusted app session alone retains its local API proxy bypass. Site sessions block local/private-address requests and use Chromium's <-loopback> proxy rule while VPN routing is active. Downloads remain denied until an explicit user-confirmed download workflow exists. Private session data is cleared after the last private tab closes. The web-only proxy now signals expired page capabilities and supports a trusted reload to create a fresh one.
- **Phase D (partial):** the native adapter observes Chromium's media-started-playing, media-paused, and audio-state-changed events and exposes only playing/paused/audible booleans to the trusted tab UI. It does not inject page scripts or collect media URLs/content. Codec/MSE/EME failure classification and real-media fixtures remain unimplemented.
- **Phase E (partial):** Electron web tabs use native Chromium views. The web-only fallback now resolves relative page API URLs against the upstream document, routes dynamic media/resource URLs through its scoped proxy capability, and preserves validated byte-range metadata. It still buffers bounded responses and is not equivalent to native Chromium. CI includes a Windows Electron smoke test for regular/private partition isolation and private-data cleanup.

## 8. Release gates

A phase cannot be considered complete until:
- `npm test`, `npm run lint`, and `npm run build` pass in CI.
- Remote content cannot access Node, preload secrets, vault APIs, or privileged IPC.
- Cross-tab and cross-profile cookie/storage isolation is proven by tests.
- Private browsing data is removed after close.
- The web-only proxy capability must move out of query URLs, or its residual bearer-capability risk must be explicitly accepted and documented before claiming release-grade security for proxy mode.
- External navigation, popups, downloads, permissions, and protocol handlers are mediated.
- VPN failure cannot silently fall back to direct traffic when VPN mode is enabled.
- Media diagnostics contain no credentials, cookies, full query strings, or page content.
- No CSP relaxation, public proxy, DRM bypass, or hidden stream extraction is introduced.

## 9. Known platform boundary

This architecture makes desktop Electron the first fully supported native browsing target. A web-only deployment cannot create privileged Chromium WebContentsView instances and will retain the proxy's compatibility limitations. Android WebView and iOS WKWebView require separate adapters and capability tests; they must not inherit desktop security claims automatically.
