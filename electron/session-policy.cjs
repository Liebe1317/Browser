'use strict';

const blockedDomains = [
  'doubleclick.net', 'google-analytics.com', 'googletagmanager.com',
  'googleadservices.com', 'googlesyndication.com', 'criteo.com',
  'taboola.com', 'outbrain.com', 'hotjar.com', 'clarity.ms',
];

function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
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

  function register(browserSession, options = {}) {
    if (!browserSession || typeof browserSession.setProxy !== 'function') {
      throw new TypeError('A valid Electron Session is required.');
    }
    sessions.add(browserSession);
    if (installed.has(browserSession)) return browserSession;
    const trustedAppSession = options.trustedAppSession === true;
    installed.add(browserSession);

    browserSession.webRequest.onBeforeRequest(
      { urls: ['*://*/*', 'ws://*/*', 'wss://*/*'] },
      (details, callback) => {
        if (isBlockedAdOrTracker(details.url)) return callback({ cancel: true });
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
    return browserSession;
  }

  function getSessions() {
    return [...sessions];
  }

  async function applyProxyToAll(proxyConfig) {
    const current = getSessions();
    const results = await Promise.allSettled(current.map(async (browserSession) => {
      await browserSession.setProxy(proxyConfig);
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
      await browserSession.setProxy({ mode: 'fixed_servers', proxyRules: rules, proxyBypassRules });
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

module.exports = { createBrowserSessionPolicy, isBlockedAdOrTracker };
