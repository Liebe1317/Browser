import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createBrowserSessionPolicy, isBlockedAdOrTracker } = require('../electron/session-policy.cjs');
const ok = (condition, message) => {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + message);
  if (!condition) process.exitCode = 1;
};

function fakeSession() {
  const handlers = {};
  const state = { proxies: [], closed: 0, permissionRequest: null, permissionCheck: null };
  return {
    state,
    webRequest: {
      onBeforeRequest: (_filter, handler) => { handlers.before = handler; },
      onErrorOccurred: (_filter, handler) => { handlers.error = handler; },
    },
    setPermissionRequestHandler: (handler) => { state.permissionRequest = handler; },
    setPermissionCheckHandler: (handler) => { state.permissionCheck = handler; },
    setProxy: async (config) => { state.proxies.push(config); },
    closeAllConnections: async () => { state.closed += 1; },
    triggerBefore: (details) => new Promise((resolve) => handlers.before(details, resolve)),
    triggerError: (details) => handlers.error(details),
  };
}

let vpnState = { enabled: false, connected: false };
let proxyFailures = 0;
const policy = createBrowserSessionPolicy({
  getVpnState: () => ({ ...vpnState, onProxyFailure: () => { proxyFailures += 1; } }),
  isAppRequest: (url) => {
    try { return new URL(url).origin === 'http://127.0.0.1:3000'; } catch { return false; }
  },
});
const regular = fakeSession();
const privateSession = fakeSession();
policy.register(regular, { trustedAppSession: true });
policy.register(privateSession);
policy.register(regular);
ok(policy.getSessions().length === 2, 'each Chromium session is registered once');
ok(isBlockedAdOrTracker('https://sub.google-analytics.com/pixel'), 'tracker subdomains are identified');
ok(!isBlockedAdOrTracker('https://notgoogle-analytics.com/'), 'lookalike domains are not blocked');

const adResult = await regular.triggerBefore({ url: 'https://doubleclick.net/ad.js' });
ok(adResult.cancel === true, 'ad and tracker requests are blocked in each registered session');
const allowedResult = await privateSession.triggerBefore({ url: 'https://video.example/player' });
ok(!allowedResult.cancel, 'ordinary requests are allowed when VPN is disabled');

vpnState = { enabled: true, connected: false };
const closedResult = await privateSession.triggerBefore({ url: 'https://video.example/player' });
const localResult = await regular.triggerBefore({ url: 'http://127.0.0.1:3000/api/health' });
ok(closedResult.cancel === true, 'external requests fail closed while VPN is disconnected');
ok(!localResult.cancel, 'the trusted application session remains reachable while VPN is disconnected');
const privateLocalResult = await privateSession.triggerBefore({ url: 'http://127.0.0.1:3000/api/health' });
ok(privateLocalResult.cancel === true, 'untrusted site sessions cannot use the application-origin VPN bypass');

let fullscreenGranted = null;
regular.state.permissionRequest(null, 'fullscreen', (value) => { fullscreenGranted = value; }, { userGesture: false });
ok(fullscreenGranted === false, 'fullscreen is denied without a direct user gesture');
regular.state.permissionRequest(null, 'fullscreen', (value) => { fullscreenGranted = value; }, { userGesture: true });
ok(fullscreenGranted === true, 'fullscreen is allowed only with a direct user gesture');
ok(regular.state.permissionCheck(null, 'camera', 'https://video.example', { userGesture: true }) === false, 'camera permission remains denied');
ok(regular.state.permissionCheck(null, 'fullscreen', 'https://video.example', {}) === true, 'fullscreen permission checks are separate from the gesture-gated request decision');

await policy.applyProxyToAll({ mode: 'fixed_servers', proxyRules: 'http=127.0.0.1:19090;https=127.0.0.1:19090' });
ok(regular.state.proxies.length === 1 && privateSession.state.proxies.length === 1, 'VPN proxy is applied to regular and private sessions');
ok(regular.state.closed === 1 && privateSession.state.closed === 1, 'pooled connections are closed after proxy changes');

await policy.applyFailClosedToAll();
ok(regular.state.proxies.at(-1).proxyRules.includes('127.0.0.1:1'), 'regular session receives fail-closed proxy rules');
ok(privateSession.state.proxies.at(-1).proxyRules.includes('127.0.0.1:1'), 'private session receives fail-closed proxy rules');

regular.triggerError({ error: 'ERR_TUNNEL_CONNECTION_FAILED' });
ok(proxyFailures === 1, 'proxy tunnel failures notify the shared VPN health controller');
