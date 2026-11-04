# Aksa VPN adapter — current state and integration contract

## What is implemented

Aegis has an optional server-side egress adapter named Aksa. When enabled, requests made through Aegis' server-side proxy use an Undici ProxyAgent routed to a local loopback endpoint. Aksa rejects arbitrary remote proxy URLs. If the local gateway is unavailable, proxied requests fail instead of silently falling back to direct networking.

Configuration:

- Set AKSA_VPN_PROXY=http://127.0.0.1:<port> in the trusted server process environment.
- The endpoint must be a local Aksa gateway backed by an active WireGuard/VPN tunnel.
- Never put the gateway address, VPN private keys, WireGuard configuration, or provider credentials in the React bundle, query strings, browser storage, or Git.
- Do not expose the local gateway to LAN/WAN interfaces.

## What is not implemented

This repository does not contain an Aksa VPN server, WireGuard peer credentials, a server list, a WireGuard daemon, or a platform tunnel installer. Therefore a syntactically valid AKSA_VPN_PROXY value is not proof that a VPN tunnel is active. The current status means:

- configured: the environment variable points to an accepted loopback endpoint.
- enabled: the server-side request dispatcher has been switched to that endpoint.
- Neither flag is a live VPN handshake/health check.

The adapter covers server-side browser requests. Direct requests initiated by the renderer (for example external media, images, and the allowed YouTube iframe) do not automatically traverse this server-side proxy. It is not a device-wide VPN and must not be marketed as full renderer traffic protection.

## Required gateway security properties before release

1. Bind only to loopback and authenticate the local caller where supported.
2. Accept HTTP CONNECT only; reject arbitrary HTTP forwarding if not needed.
3. Resolve destination DNS inside the tunnel and block loopback, private, link-local, multicast, metadata, reserved, and unsafe ports at the gateway itself.
4. Re-resolve and enforce destination policy at connection time to prevent DNS rebinding / TOCTOU bypasses. The Aegis-side URL filter alone is not sufficient for remote DNS resolution by a proxy.
5. Do not write browsing URLs, credentials, cookies, or payloads to logs.
6. Provide a health/handshake endpoint tied to the actual tunnel state; do not equate configured with connected.
7. Test IPv4/IPv6 routes, DNS leak behavior, reconnects, captive portals, gateway crashes, and fail-closed behavior on Windows, Linux, and macOS.

## Full browser-only VPN architecture still required

To cover renderer-originated traffic, the desktop build needs a browser engine network-session/proxy adapter or an app-scoped TUN/WireGuard tunnel. It must cover all direct renderer requests, WebSockets, media, WebRTC/STUN, DNS, downloads, and service workers, with a kill switch and measurable tunnel state. The current web-hosted React renderer cannot guarantee all of those paths.
