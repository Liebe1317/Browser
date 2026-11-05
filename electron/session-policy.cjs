'use strict';

const { isIP } = require('node:net');

const blockedDomains = [
  'doubleclick.net', 'google-analytics.com', 'googletagmanager.com',
  'googleadservices.com', 'googlesyndication.com', 'criteo.com',
  'taboola.com', 'outbrain.com', 'hotjar.com', 'clarity.ms',
];

function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}


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
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/\\.$/, '').replace(/^\\[|\\]$/g, '');
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
      if (ipv6 === '::' || ipv6 === '::1' || /^f[cd][0-9a-f]{2}:/.test(ipv6) || /^fe[89ab][0-9a-f]:/.test(ipv6)) return true;
      if (ipv6.startsWith('::ffff:')) {
        const mapped = ipv6.slice('::ffff:'.length);
        if (isPrivateIpv4(mapped)) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function isBlockedAdOrTracker(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/\.$/, '');
    return blockedDomains.some((domain) => hostMatches(host, domain));
  } catch {
    return false;
  }
}

/**
 * Applies the same network and permission boundary to every Chromium session.
 * New profile partitions must be registered before their WebContents is created.
 */
function createBrowserSessionPolicy({ getVpnState, isAppRequest }) {
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

    browserSession.webRequest.onBeforeRequest(
      { urls: ['*://*/*', 'ws://*/*', 'wss://*/*'] },
      (details, callback) => {
        if (isBlockedAdOrTracker(details.url)) return callback({ cancel: true });
        if (!trustedAppSession && isPrivateOrLocalUrl(details.url)) return callback({ cancel: true });
        const vpn = getVpnState();
        if (vpn.enabled && !vpn.connected && !(trustedAppSession && isAppRequest(details.url))) {
          return callback({ cancel: true });
        }
        callback({});
      },
    );

    browserSession.webRequest.onErrorOccurred(
      { urls: ['*://*/*', 'ws://*/*', 'wss://*/*'] },
      (details) => {
        if (/ERR_PROXY|ERR_TUNNEL_CONNECTION_FAILED/i.test(details.error || '')) {
          getVpnState().onProxyFailure?.();
        }
      },
    );

    // Electron's permission-request details do not expose a userGesture flag for fullscreen.
    // Chromium gates the Fullscreen API on transient user activation; automatic-fullscreen stays denied.
    browserSession.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(permission === 'fullscreen');
    });
    browserSession.setPermissionCheckHandler((_contents, permission, _origin, details) => {
      return permission === 'fullscreen';
    });
    // Downloads are denied until a separate, user-confirmed download flow is implemented.
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

module.exports = { createBrowserSessionPolicy, isBlockedAdOrTracker, isPrivateOrLocalUrl };
