'use strict';

const { app, BrowserWindow, session, ipcMain, Menu } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { parseAksaLocalProxy, isConnectedHealthPayload } = require('./aksa-config.cjs');

let mainWindow = null;
const aksaProxy = parseAksaLocalProxy(process.env.AKSA_VPN_PROXY);
let aksaEnabled = false;
let aksaConnected = false;
let aksaMonitor = null;
let aksaCheckInFlight = false;

// The browser UI needs the local Express/Vite API; a file:// renderer cannot use same-origin /api.
const localPort = Number(process.env.PORT || 3000);
const startUrl = process.env.ELECTRON_START_URL || `http://127.0.0.1:${localPort}`;

// Prevent UDP/QUIC side channels from bypassing the HTTP CONNECT VPN proxy.
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
app.commandLine.appendSwitch('disable-quic');
app.commandLine.appendSwitch('disable-dns-prefetch');
let trustedAppOrigin = null;
try {
  const parsedStart = new URL(startUrl);
  if (parsedStart.protocol === 'http:' || parsedStart.protocol === 'https:') trustedAppOrigin = parsedStart.origin;
} catch {
  // A local file:// build does not need a remote application origin.
}

function isTrustedUi(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame) return false;
  const currentUrl = event.senderFrame.url || '';
  if (currentUrl.startsWith('file://')) {
    return currentUrl === startUrl || currentUrl === pathToFileURL(path.join(__dirname, '../dist/index.html')).toString();
  }
  try {
    return !!trustedAppOrigin && new URL(currentUrl).origin === trustedAppOrigin;
  } catch {
    return false;
  }
}

function isAppRequest(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return !!trustedAppOrigin && url.origin === trustedAppOrigin;
  } catch {
    return false;
  }
}

async function probeAksaTunnel() {
  if (!aksaProxy) return false;
  try {
    const response = await fetch(aksaProxy.healthUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(2200),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return false;
    const body = await response.json();
    return isConnectedHealthPayload(body);
  } catch {
    return false;
  }
}

async function applyAksaProxy() {
  if (!aksaProxy) throw new Error('Aksa local gateway is not configured');
  await session.defaultSession.setProxy({
    mode: 'fixed_servers',
    proxyRules: aksaProxy.proxyRules,
    proxyBypassRules: aksaProxy.proxyBypassRules,
  });
  // Do not let pooled sockets continue through the previous route after a VPN switch.
  await session.defaultSession.closeAllConnections();
}

async function applyAksaFailClosedProxy() {
  const rules = 'http=127.0.0.1:1;https=127.0.0.1:1';
  await session.defaultSession.setProxy({
    mode: 'fixed_servers',
    proxyRules: rules,
    proxyBypassRules: aksaProxy ? aksaProxy.proxyBypassRules : 'localhost;127.0.0.1;[::1]',
  });
  await session.defaultSession.closeAllConnections();
}

function getAksaStatus() {
  return {
    configured: !!aksaProxy,
    enabled: aksaEnabled,
    connected: aksaEnabled && aksaConnected,
    gateway: aksaProxy ? 'configured-local' : 'not-configured',
    scope: 'electron-session',
  };
}

async function refreshAksaHealth() {
  if (!aksaEnabled || aksaCheckInFlight) return;
  aksaCheckInFlight = true;
  try {
    const healthy = await probeAksaTunnel();
    if (healthy && !aksaConnected) {
      await applyAksaProxy();
      aksaConnected = true;
    } else if (!healthy && aksaConnected) {
      aksaConnected = false;
      await applyAksaFailClosedProxy();
    } else {
      aksaConnected = healthy;
    }
  } catch {
    aksaConnected = false;
    try { await applyAksaFailClosedProxy(); } catch {}
  } finally {
    aksaCheckInFlight = false;
  }
}

function startAksaMonitor() {
  if (aksaMonitor) clearInterval(aksaMonitor);
  aksaMonitor = setInterval(() => { void refreshAksaHealth(); }, 4000);
  aksaMonitor.unref?.();
}

async function setAksaEnabled(next) {
  if (next === false) {
    aksaEnabled = false;
    aksaConnected = false;
    if (aksaMonitor) clearInterval(aksaMonitor);
    aksaMonitor = null;
    await session.defaultSession.setProxy({ mode: 'system' });
    await session.defaultSession.closeAllConnections();
    return { ok: true, status: getAksaStatus() };
  }

  if (!aksaProxy) {
    return { ok: false, status: getAksaStatus(), error: 'AKSA_VPN_PROXY is not configured.' };
  }
  const healthy = await probeAksaTunnel();
  if (!healthy) {
    return {
      ok: false,
      status: getAksaStatus(),
      error: 'Aksa gateway does not confirm an active WireGuard tunnel. The browser connection was not switched.',
    };
  }

  // Gate all external web requests while the proxy/session transition is being applied.
  aksaEnabled = true;
  aksaConnected = false;
  try {
    await applyAksaProxy();
    aksaConnected = true;
    startAksaMonitor();
    return { ok: true, status: getAksaStatus() };
  } catch {
    aksaEnabled = false;
    aksaConnected = false;
    try { await session.defaultSession.setProxy({ mode: 'system' }); } catch {}
    return { ok: false, status: getAksaStatus(), error: 'Unable to apply Aksa proxy to the Electron session.' };
  }
}

function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

const blockedDomains = [
  'doubleclick.net', 'google-analytics.com', 'googletagmanager.com',
  'googleadservices.com', 'googlesyndication.com', 'criteo.com',
  'taboola.com', 'outbrain.com', 'hotjar.com', 'clarity.ms',
];

function isBlockedAdOrTracker(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/\.$/, '');
    return blockedDomains.some((domain) => hostMatches(host, domain));
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Aegis Privacy Browser',
    backgroundColor: '#0f172a',
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
    icon: path.join(__dirname, '../public/favicon.ico'),
  });

  Menu.setApplicationMenu(null);

  // One handler owns this event: combine ad blocking and Aksa's fail-closed kill switch.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
    if (isBlockedAdOrTracker(details.url)) return callback({ cancel: true });
    if (aksaEnabled && !aksaConnected && !isAppRequest(details.url)) {
      return callback({ cancel: true });
    }
    callback({});
  });

  session.defaultSession.webRequest.onErrorOccurred({ urls: ['*://*/*', 'ws://*/*', 'wss://*/*'] }, (details) => {
    if (aksaEnabled && /ERR_PROXY|ERR_TUNNEL_CONNECTION_FAILED/i.test(details.error || '')) {
      aksaConnected = false;
      void applyAksaFailClosedProxy().catch(() => {});
    }
  });

  // Default-deny sensitive browser permissions. Fullscreen remains usable.
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'fullscreen');
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => permission === 'fullscreen');

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    let allowed = false;
    if (targetUrl.startsWith('file://')) {
      allowed = targetUrl === startUrl;
    } else {
      allowed = isAppRequest(targetUrl);
    }
    if (!allowed) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.on('render-process-gone', () => {
    // Do not write page URLs or renderer-provided content to logs.
    console.error('[Aegis Desktop] Renderer process exited unexpectedly.');
  });

  mainWindow.loadURL(startUrl).catch(() => {
    console.error('[Aegis Desktop] Unable to load the configured Aegis app URL.');
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  ipcMain.handle('aegis:vpn:get-status', (event) => {
    if (!isTrustedUi(event)) return { configured: false, enabled: false, connected: false, gateway: 'not-configured', scope: 'electron-session' };
    return getAksaStatus();
  });
  ipcMain.handle('aegis:vpn:set-enabled', async (event, enabled) => {
    if (!isTrustedUi(event) || typeof enabled !== 'boolean') {
      return { ok: false, status: getAksaStatus(), error: 'Untrusted desktop IPC request.' };
    }
    return setAksaEnabled(enabled);
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (aksaMonitor) clearInterval(aksaMonitor);
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
