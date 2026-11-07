# Aegis desktop shell

## Start for development

1. Install the locked dependencies: `npm ci`.
2. Start the local Aegis Express/Vite app: `npm run dev`.
3. In a second terminal, run `npm run desktop`.

Electron loads `http://127.0.0.1:<PORT>` by default because the app's same-origin API and session bootstrap do not work from an untrusted `file://` renderer. Set `ELECTRON_START_URL` only to a trusted Aegis app origin.

The desktop launcher pins Electron 45.2.2. The Electron dependency is downloaded by the launcher, not imported into the React renderer.

## Security boundaries

- Node integration is disabled; context isolation, sandbox and web security are enabled.
- The preload exposes only Akram VPN status/toggle methods, and only in the main frame.
- IPC checks both the sender WebContents and its main-frame origin.
- Popups, webviews, untrusted top-level navigations and non-fullscreen permissions are denied.
- Akram VPN uses Chromium's default session proxy, closes existing connections after changes, and verifies the local WireGuard gateway health endpoint.
- When enabled and the health endpoint fails, external Chromium requests are cancelled and the default session is switched to a local black-hole proxy. WebRTC non-proxied UDP, QUIC and DNS prefetch are disabled to reduce bypasses.

## Not a release certification

This shell still needs packaging and end-to-end tests on Windows, Linux and macOS. Akram VPN needs a real WireGuard-backed local gateway. The current HTTP proxy and browser kill-switch integration is not proof of leak-free routing; test DNS, IPv4/IPv6, WebRTC, QUIC, service workers, media, downloads, reconnects and gateway crash behavior before distribution.
