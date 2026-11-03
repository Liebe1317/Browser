/**
 * Privacy shield logic for the proxy: block lists, the Content-Security-Policy that keeps proxied
 * pages inside the proxy, and the WebRTC stand-down script.
 */
import type { ShieldFlags } from '../src/utils/shieldFlags.ts';

// Ad networks (blocked when "block aggressive ads" is on)
export const AD_DOMAINS = [
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'adservice.google.com',
  'amazon-adsystem.com',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'adroll.com',
  'appnexus.com',
  'adnxs.com',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'media.net',
  'popads.net',
  'popcash.net',
  'propellerads.com',
  'adsterra.com',
  'monetag.com',
  'clickadu.com',
  'yllix.com',
  'exoclick.com',
  'trafficjunky.com',
];

// Analytics / tracking (blocked when "block trackers" is on)
export const TRACKER_DOMAINS = [
  'google-analytics.com',
  'googletagmanager.com',
  'connect.facebook.net',
  'pixel.facebook.com',
  'hotjar.com',
  'clarity.ms',
  'scorecardresearch.com',
  'moatads.com',
  'adsafeprotected.com',
];

/** Suffix match on whole labels: "x.doubleclick.net" matches, "notdoubleclick.net" does not. */
export function hostMatches(list: string[], hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return list.some((d) => host === d || host.endsWith('.' + d));
}

/**
 * CSP sent with every proxy response. Two jobs:
 *  1. `sandbox` (no allow-same-origin): the page gets an opaque origin and can never touch the app.
 *  2. Fail-closed networking: every subresource, fetch, XHR, WebSocket and form must target THIS
 *     origin (i.e. the proxy). A script that tries to contact a third party directly is stopped by the
 *     browser, so the user's real IP can't leak around the proxy.
 * Popups/scripts follow the user's shield settings and are enforced by the browser, not by rewriting.
 */
export function buildProxyCsp(flags: ShieldFlags): string {
  const sandbox = ['allow-forms', 'allow-modals', 'allow-presentation', 'allow-downloads'];
  if (!flags.blockScripts) sandbox.unshift('allow-scripts');
  if (!flags.blockPopups) sandbox.push('allow-popups');
  return [
    `sandbox ${sandbox.join(' ')}`,
    "default-src 'self' data: blob:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "frame-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

/**
 * Best-effort WebRTC stand-down. WebRTC can reveal the user's real IP through STUN, around the
 * proxy. This removes the API from the page; a determined script can still obtain a fresh copy from
 * a new iframe, so this reduces the risk but is NOT a guarantee (real blocking needs the browser
 * engine, see SECURITY.md).
 */
export const WEBRTC_BLOCK_SCRIPT = `<script>
(function () {
  ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection', 'RTCDataChannel', 'RTCIceCandidate', 'RTCSessionDescription'].forEach(function (n) {
    try { Object.defineProperty(window, n, { value: undefined, configurable: false, writable: false }); } catch (e) {}
  });
  try {
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = function () { return Promise.reject(new DOMException('Blocked by Aegis Shield', 'NotAllowedError')); };
    }
  } catch (e) {}
})();
</script>`;
