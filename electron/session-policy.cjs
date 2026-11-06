'use strict';

const { isIP } = require('node:net');
const { createChromiumShieldsAdapter } = require('../lebe/adapters/chromium/session-policy-adapter.cjs');

// Domain reputation rules plus narrow YouTube ad endpoints. Video delivery hosts are
// never blanket-blocked: only requests carrying explicit ad markers are denied.
const blockedDomains = [
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
  'google-analytics.com',
  'googletagmanager.com',
  'connect.facebook.net',
  'pixel.facebook.com',
  'hotjar.com',
  'clarity.ms',
  'scorecardresearch.com',
  'moatads.com',
  'adsafeprotected.com',
  'adform.net',
  'advertising.com',
  'adsrvr.org',
  '33across.com',
  'bidswitch.net',
  'casalemedia.com',
  'contextweb.com',
  'demdex.net',
  'lijit.com',
  'quantserve.com',
  'serving-sys.com',
  'sharethrough.com',
  'smartadserver.com',
  'sovrn.com',
  'yieldmo.com',
  'triplelift.com',
  'undertone.com',
  'zemanta.com',
  'revcontent.com',
  'mgid.com',
  'infolinks.com',
  'teads.tv',
  'imrworldwide.com',
  'onclickads.net',
  'juicyads.com',
  'hilltopads.net',
  'adskeeper.co.uk',
  'adskeeper.com',
  'ad-maven.com',
  'adf.ly',
  'clk.sh',
  'popunder.net',
  'popunderjs.com',
  'propeller-tracking.com',
];

const shieldRules = [
  ...blockedDomains.map((domain) => ({ id: domain, domain })),
  {
    id: 'youtube-ad-endpoints',
    domains: ['youtube.com', 'youtube-nocookie.com'],
    pathIncludes: ['/pagead/', '/api/stats/ads', '/get_midroll_info'],
    resourceTypes: ['xmlhttprequest', 'xhr', 'script', 'image', 'other'],
    reason: 'youtube-ad-request',
  },
  {
    id: 'youtube-googlevideo-ad-markers',
    domains: ['googlevideo.com'],
    pathIncludes: ['/videoplayback'],
    queryKeysAny: ['oad', 'adformat', 'ad_type', 'adurl', 'adtag'],
    resourceTypes: ['media', 'other', 'xmlhttprequest', 'xhr'],
    reason: 'youtube-ad-media',
  },
];

function isPrivateIpv4(host) {
  if (isIP(host) !== 4) return false;
  const [a, b] = host.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127);
}

function isPrivateOrLocalUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
    if (!host) return true;
    if (
      host === 'localhost'
      || host.endsWith('.localhost')
      || host.endsWith('.local')
      || host.endsWith('.internal')
      || host.endsWith('.lan')
      || host.endsWith('.test')
      || host.endsWith('.home.arpa')
      || (!host.includes('.') && isIP(host) === 0)
    ) return true;
    if (isPrivateIpv4(host)) return true;
    if (isIP(host) === 6) {
      const ipv6 = host.toLowerCase();
      if (ipv6 === '::' || ipv6 === '::1' || /^f[cd][0-9a-f]{2}:/ .test(ipv6) || /^fe[89ab][0-9a-f]:/.test(ipv6)) return true;
      if (ipv6.startsWith('::ffff:')) {
        const mapped = ipv6.slice('::ffff:'.length);
        if (isPrivateIpv4(mapped)) return true;
        const words = mapped.split(':');
        if (words.length === 2 && words.every((word) => /^[0-9a-f]{1,4}$/.test(word))) {
          const high = parseInt(words[0], 16);
          const low = parseInt(words[1], 16);
          const mappedIpv4 = [high >> 8, high & 255, low >> 8, low & 255].join('.');
          if (isPrivateIpv4(mappedIpv4)) return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

const lebeShieldsAdapter = createChromiumShieldsAdapter(shieldRules);

function isBlockedAdOrTracker(rawUrl, requestDetails = {}) {
  return lebeShieldsAdapter.evaluateRequest({ ...requestDetails, url: rawUrl }).action === 'block';
}

function addShieldFilterList(content, source = 'custom') {
  return lebeShieldsAdapter.addFilterList(content, source);
}

function getCosmeticCss(rawUrl) {
  return lebeShieldsAdapter.getCosmeticCss(rawUrl);
}

function getShieldStats() {
  return lebeShieldsAdapter.getStats();
}

/**
 * Applies the same network and permission boundary to every Chromium session.
 * New profile partitions must be registered before their WebContents is created.
 */
function createBrowserSessionPolicy({ getVpnState, isAppRequest, onNetworkEvent }) {
  const sessions = new Set();
  const installed = new WeakSet();
  const sessionMetadata = new WeakMap();

  function register(browserSession, options = {}) {
    if (!browserSession || typeof browserSession.setProxy !== 'function') {
      throw new TypeError('A valid Electron Session is required.');
    }
    sessions.add(browserSession);
    if (installed.has(browserSession)) return browserSession;
    const trustedAppSession = options.trustedAppSession === true;
    sessionMetadata.set(browserSession, { trustedAppSession });
    installed.add(browserSession);

    const requestStarts = new Map();
    const requestFilter = { urls: ['*://*/*', 'ws://*/*', 'wss://*/*'] };
    const safeRequestUrl = (raw) => {
      try {
        const url = new URL(raw);
        if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return '';
        const segments = url.pathname.split('/');
        const safePath = segments.map((segment, index) => {
          const previous = segments[index - 1] || '';
          const followsSensitiveLabel = /^(?:token|access_token|auth|authorization|session|signature|sig|key)$/i.test(previous);
          const opaqueToken = /^[a-f0-9]{16,}$/i.test(segment)
            || /^[A-Za-z0-9_-]{32,}$/.test(segment);
          return followsSensitiveLabel || opaqueToken ? '[redacted]' : segment;
        }).join('/');
        return url.origin + safePath;
      } catch { return ''; }
    };
    browserSession.webRequest.onBeforeRequest(requestFilter, (details, callback) => {
      const isApp = trustedAppSession && isAppRequest(details.url);
      const blockedReason = isBlockedAdOrTracker(details.url, details) ? 'shield'
        : (isPrivateOrLocalUrl(details.url) && !isApp) ? 'private-network'
        : (getVpnState().enabled && !getVpnState().connected && !isApp) ? 'vpn-disconnected' : '';
      const base = {
        webContentsId: details.webContentsId,
        requestId: String(details.id),
        url: safeRequestUrl(details.url),
        method: typeof details.method === 'string' ? details.method : 'GET',
        resourceType: typeof details.resourceType === 'string' ? details.resourceType : 'other',
        timestamp: Date.now(),
      };
      if (blockedReason) {
        onNetworkEvent?.({ ...base, phase: 'blocked', blockedReason });
        return callback({ cancel: true });
      }
      requestStarts.set(details.id, base);
      onNetworkEvent?.({ ...base, phase: 'started' });
      callback({});
    });
    browserSession.webRequest.onCompleted(requestFilter, (details) => {
      const started = requestStarts.get(details.id);
      if (!started) return;
      requestStarts.delete(details.id);
      onNetworkEvent?.({ ...started, phase: 'completed', statusCode: Number.isInteger(details.statusCode) ? details.statusCode : 0, duration: Math.max(0, Date.now() - started.timestamp) });
    });
    browserSession.webRequest.onErrorOccurred(requestFilter, (details) => {
      const started = requestStarts.get(details.id);
      if (started) {
        requestStarts.delete(details.id);
        onNetworkEvent?.({ ...started, phase: 'failed', error: typeof details.error === 'string' ? details.error.slice(0, 80) : 'network-error', duration: Math.max(0, Date.now() - started.timestamp) });
      }
      if (/ERR_PROXY|ERR_TUNNEL_CONNECTION_FAILED/i.test(details.error || '')) getVpnState().onProxyFailure?.();
    });

    browserSession.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(permission === 'fullscreen');
    });
    browserSession.setPermissionCheckHandler((_contents, permission, _origin, details) => {
      return permission === 'fullscreen';
    });
    browserSession.on('will-download', (event, item) => {
      event.preventDefault();
      item.cancel();
    });
    return browserSession;
  }

  function getSessions() {
    return [...sessions];
  }

  async function applyProxyToAll(proxyConfig) {
    const current = getSessions();
    const results = await Promise.allSettled(current.map(async (browserSession) => {
      const metadata = sessionMetadata.get(browserSession) || {};
      const config = { ...proxyConfig };
      if (proxyConfig.mode !== 'system') {
        config.proxyBypassRules = metadata.trustedAppSession
          ? (proxyConfig.proxyBypassRules || 'localhost;127.0.0.1;[::1]')
          : '<-loopback>';
      }
      await browserSession.setProxy(config);
      await browserSession.closeAllConnections();
    }));
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length) throw new Error('Could not apply the network route to every Chromium session.');
    return current.length;
  }

  async function applyFailClosedToAll(proxyBypassRules = 'localhost;127.0.0.1;[::1]') {
    const current = getSessions();
    const rules = 'http=127.0.0.1:1;https=127.0.0.1:1';
    const results = await Promise.allSettled(current.map(async (browserSession) => {
      const metadata = sessionMetadata.get(browserSession) || {};
      await browserSession.setProxy({
        mode: 'fixed_servers',
        proxyRules: rules,
        proxyBypassRules: metadata.trustedAppSession ? proxyBypassRules : '<-loopback>',
      });
      await browserSession.closeAllConnections();
    }));
    if (results.some((result) => result.status === 'rejected')) {
      throw new Error('Could not fail-close every Chromium session.');
    }
    return current.length;
  }

  async function restoreSystemProxyToAll() {
    return applyProxyToAll({ mode: 'system' });
  }

  return Object.freeze({ register, getSessions, applyProxyToAll, applyFailClosedToAll, restoreSystemProxyToAll });
}

module.exports = { createBrowserSessionPolicy, isBlockedAdOrTracker, isPrivateOrLocalUrl, addShieldFilterList, getShieldStats, getCosmeticCss };
