# Aksa VPN — current integration and required gateway

## Implemented in Aegis

Aksa is wired into two outbound paths:

1. **Aegis server egress.** When enabled, Undici requests made by the browser proxy use a loopback HTTP CONNECT gateway. The server validates the gateway address, checks its tunnel-health endpoint before activation, then rechecks it every five seconds. If the gateway stops reporting an active tunnel, the dispatcher rejects new requests instead of silently switching to direct networking.
2. **Electron Chromium session.** The desktop main process configures Chromium's default session proxy using the same local gateway. It closes pooled connections on proxy changes, checks health periodically, applies a local black-hole proxy and cancels external requests when the tunnel health is lost. It also disables non-proxied WebRTC UDP, QUIC, and DNS prefetch to reduce known proxy-bypass paths.

The Electron preload exposes only two narrowly-scoped Aksa methods to the trusted top-level Aegis UI. Calls from website iframes, other web contents, and untrusted origins are rejected by the main process.

## Required gateway contract

The repository does **not** include a VPN provider, server list, WireGuard private/public peer configuration, or a platform tunnel daemon. Aksa is therefore an integration layer, not yet a self-contained commercial VPN service.

A locally installed Aksa/WireGuard gateway must:

- Bind only to loopback, e.g. 127.0.0.1:19090. Never expose it on the LAN/WAN.
- Implement HTTP CONNECT for outbound HTTP(S) requests.
- Route the CONNECT tunnel through an active WireGuard tunnel, not the ordinary system default route.
- Expose `GET /health` returning HTTP 200 and JSON `{"status":"ok","tunnel":"connected"}` **only when the WireGuard interface/handshake and outbound route are actually healthy**.
- Return any other status/body when disconnected, stale, restarting, or unable to prove the route.
- Enforce public-destination-only egress at the gateway. Block loopback, private, link-local, multicast, metadata, reserved destinations and unsafe ports after resolving DNS on the tunnel side. Aegis-side SSRF checks do not replace gateway enforcement.
- Never log browsing URLs, request headers, cookies, payloads, user IPs, or credentials.

The health response is an explicit integration contract, not evidence that a WireGuard daemon is present in this repository.

## Configuration and launch

Set the same environment value for the Aegis server and Electron process:

```sh
AKSA_VPN_PROXY=http://127.0.0.1:19090
```

Start the application server in one terminal:

```sh
npm run dev
```

Start the desktop shell in another terminal with the same environment variable:

```sh
npm run desktop
```

The desktop app defaults to `http://127.0.0.1:${PORT:-3000}`; use `ELECTRON_START_URL` only when intentionally hosting the trusted Aegis UI elsewhere. Electron 45.2.2 is pinned in the desktop launcher and is not bundled into the web-client dependency graph.

Linux/macOS shell example:

```sh
export AKSA_VPN_PROXY=http://127.0.0.1:19090
npm run dev
# In a second terminal, export the same AKSA_VPN_PROXY and run:
npm run desktop
```

PowerShell example:

```powershell
$env:AKSA_VPN_PROXY = "http://127.0.0.1:19090"
npm run dev
# In a second PowerShell window, set the same variable and run:
npm run desktop
```

## Important limits and release gates

- In the ordinary browser-hosted React app, Aksa covers only server-side outbound traffic initiated by the Aegis proxy. It cannot force unrelated direct connections from the user's browser.
- The Electron integration routes Chromium HTTP(S) requests through its session proxy and applies a fail-closed guard. Electron's proxy behavior, IPv4/IPv6/DNS routing, UDP/WebRTC, service workers, downloads, reconnects and every OS version still require real-device leak testing before claiming full protection.
- This is not a device-wide VPN: traffic from other applications is not covered.
- A syntactically configured gateway is not enough. The UI only reports connected after the gateway health contract confirms the tunnel.
- Do not call Aksa a working VPN or release it as such until the real local gateway/daemon, its WireGuard configuration, provider/server endpoints, key provisioning, update mechanism and tunnel leak tests exist.
