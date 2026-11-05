import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createBrowserSessionPolicy, isBlockedAdOrTracker, isPrivateOrLocalUrl } = require('../electron/session-policy.cjs');
const ok = (condition, message) => {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + message);
  if (!condition) process.exitCode = 1;
};

function fakeSession() {
  const handlers = {};
  const state = { proxies: [], closed: 0, permissionRequest: null, permissionCheck: null, listeners: {} };
  return {
    state,
    webRequest: {
      onBeforeRequest: (_filter, handler) => { handlers.before = handler; },
      onErrorOccurred: (_filter, handler) => { handlers.error = handler; },
    },
    setPermissionRequestHandler: (handler) => { state.permissionRequest = handler; },
    setPermissionCheckHandler: (handler) => { state.permissionCheck = handler; },
    on: (name, handler) => { state.listeners[name] = handler; },
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
ok(isPrivateOrLocalUrl('http://127.0.0.1:3000/'), 'loopback IP URLs are recognized as local');
ok(isPrivateOrLocalUrl('http://10.0.0.8/'), 'RFC1918 IPv4 URLs are recognized as private');
ok(isPrivateOrLocalUrl('http://[fd00::1]/'), 'IPv6 unique-local URLs are recognized as private');
ok(isPrivateOrLocalUrl('http://printer.local/'), 'local mDNS hostnames are recognized as local');
ok(!isPrivateOrLocalUrl('https://video.example/watch'), 'public web URLs are not classified as local');

const adResult = await regular.triggerBefore({ url: 'https://doubleclick.net/ad.js' });
ok(adResult.cancel === true, 'ad and tracker requests are blocked in each registered session');
const allowedResult = await privateSession.triggerBefore({ url: 'https://video.example/player' });
ok(!allowedResult.cancel, 'ordinary requests are allowed when VPN is disabled');
const localWhenVpnOff = await privateSession.triggerBefore({ url: 'http://192.168.1.1/' });
ok(localWhenVpnOff.cancel === true, 'untrusted sites cannot reach private network addresses even when VPN is disabled');

vpnState = { enabled: true, connected: false };
const closedResult = await privateSession.triggerBefore({ url: 'https://video.example/player' });
const localResult = await regular.triggerBefore({ url: 'http://127.0.0.1:3000/api/health' });
ok(closedResult.cancel === true, 'external requests fail closed while VPN is disconnected');
ok(!localResult.cancel, 'the trusted application session remains reachable while VPN is disconnected');
const privateLocalResult = await privateSession.triggerBefore({ url: 'http://127.0.0.1:3000/api/health' });
ok(privateLocalResult.cancel === true, 'untrusted site sessions cannot use the application-origin VPN bypass');

let fullscreenGranted = null;
regular.state.permissionRequest(null, 'automatic-fullscreen', (value) => { fullscreenGranted = value; }, {});
ok(fullscreenGranted === false, 'automatic fullscreen without a gesture is denied');
regular.state.permissionRequest(null, 'fullscreen', (value) => { fullscreenGranted = value; }, {});
ok(fullscreenGranted === true, 'the standard fullscreen permission is delegated to Chromium user-activation enforcement');
ok(regular.state.permissionCheck(null, 'camera', 'https://video.example', { userGesture: true }) === false, 'camera permission remains denied');
ok(regular.state.permissionCheck(null, 'fullscreen', 'https://video.example', {}) === true, 'fullscreen permission checks are separate from the gesture-gated request decision');
let downloadPrevented = false;
let downloadCanceled = false;
regular.state.listeners['will-download']({ preventDefault: () => { downloadPrevented = true; } }, { cancel: () => { downloadCanceled = true; } });
ok(downloadPrevented && downloadCanceled, 'downloads are denied until a user-confirmed download flow exists');

await policy.applyProxyToAll({ mode: 'fixed_servers', proxyRules: 'http=127.0.0.1:19090;https=127.0.0.1:19090', proxyBypassRules: 'localhost;127.0.0.1;[::1]' });
ok(regular.state.proxies.length === 1 && privateSession.state.proxies.length === 1, 'VPN proxy is applied to regular and private sessions');
ok(regular.state.proxies[0].proxyBypassRules === 'localhost;127.0.0.1;[::1]', 'trusted app session retains its local API bypass');
ok(privateSession.state.proxies[0].proxyBypassRules === '<-loopback>', 'untrusted site sessions route loopback through the VPN proxy instead of bypassing it');
ok(regular.state.closed === 1 && privateSession.state.closed === 1, 'pooled connections are closed after proxy changes');

await policy.applyFailClosedToAll();
ok(regular.state.proxies.at(-1).proxyRules.includes('127.0.0.1:1'), 'regular session receives fail-closed proxy rules');
ok(privateSession.state.proxies.at(-1).proxyRules.includes('127.0.0.1:1'), 'private session receives fail-closed proxy rules');
ok(privateSession.state.proxies.at(-1).proxyBypassRules === '<-loopback>', 'private session fail-closed rules cannot bypass loopback');

regular.triggerError({ error: 'ERR_TUNNEL_CONNECTION_FAILED' });
ok(proxyFailures === 1, 'proxy tunnel failures notify the shared VPN health controller');
