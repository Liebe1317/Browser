'use strict';

const { app, BrowserWindow, session, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { parseAksaLocalProxy, getAegisUserDataPath } = require('./aksa-config.cjs');
const { AksaSidecar } = require('./aksa-sidecar.cjs');
const { installWireproxy } = require('./aksa-installer.cjs');
const { createBrowserSessionPolicy } = require('./session-policy.cjs');

let mainWindow = null;
const userDataPath = getAegisUserDataPath();
app.setPath('userData', userDataPath);
const aksaProxy = parseAksaLocalProxy(process.env.AKSA_VPN_PROXY || 'http://127.0.0.1:19090');
let aksaSidecar = null;
let aksaEnabled = false;
let aksaConnected = false;
let aksaMonitor = null;
let aksaCheckInFlight = false;

const browserSessionPolicy = createBrowserSessionPolicy({
  getVpnState: () => ({
    enabled: aksaEnabled,
    connected: aksaConnected,
    onProxyFailure: () => {
      if (!aksaEnabled) return;
      aksaConnected = false;
      void applyAksaFailClosedProxy().catch(() => {});
    },
  }),
  isAppRequest,
});

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
  if (!aksaProxy || !aksaSidecar) return false;
  return aksaSidecar.checkHealth();
}

async function applyAksaProxy() {
  if (!aksaProxy) throw new Error('Aksa local gateway is not configured');
  await browserSessionPolicy.applyProxyToAll({
    mode: 'fixed_servers',
    proxyRules: aksaProxy.proxyRules,
    proxyBypassRules: aksaProxy.proxyBypassRules,
  });
}

async function applyAksaFailClosedProxy() {
  await browserSessionPolicy.applyFailClosedToAll(
    aksaProxy ? aksaProxy.proxyBypassRules : 'localhost;127.0.0.1;[::1]',
  );
}

function getAksaStatus() {
  const sidecarStatus = aksaSidecar ? aksaSidecar.getStatus() : {};
  const configured = !!aksaProxy && sidecarStatus.installed === true && sidecarStatus.profileConfigured === true;
  return {
    configured,
    installed: sidecarStatus.installed === true,
    profileConfigured: sidecarStatus.profileConfigured === true,
    running: sidecarStatus.running === true,
    enabled: aksaEnabled,
    connected: aksaEnabled && aksaConnected,
    gateway: configured ? 'configured-local' : 'not-configured',
    version: sidecarStatus.version || null,
    scope: 'all-electron-sessions',
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
    await browserSessionPolicy.restoreSystemProxyToAll();
    await aksaSidecar?.stop();
    return { ok: true, status: getAksaStatus() };
  }

  if (!aksaProxy || !aksaSidecar) {
    return { ok: false, status: getAksaStatus(), error: 'Aksa desktop engine is unavailable.' };
  }
  const started = await aksaSidecar.start();
  if (!started.ok) {
    return { ok: false, status: getAksaStatus(), error: started.error || 'تعذر تشغيل نفق Aksa.' };
  }

  const healthy = await probeAksaTunnel();
  if (!healthy) {
    await aksaSidecar.stop();
    return {
      ok: false,
      status: getAksaStatus(),
      error: 'بوابة WireGuard لم تؤكد اتصال النفق عبر /readyz. لم يتم تحويل حركة المتصفح.',
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
    try { await applyAksaFailClosedProxy(); } catch {}
    await aksaSidecar.stop();
    return { ok: false, status: getAksaStatus(), error: 'تعذر تحويل جلسة Chromium إلى بروكسي Aksa المحلي.' };
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

  // Register the application session before loading the UI. Every future profile
  // partition must pass through this same policy before creating its WebContents.
  browserSessionPolicy.register(session.defaultSession, { trustedAppSession: true });

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
  aksaSidecar = new AksaSidecar(userDataPath, {
    onExit: () => {
      if (aksaEnabled) {
        aksaConnected = false;
        void applyAksaFailClosedProxy().catch(() => {});
      }
    },
  });

  ipcMain.handle('aegis:vpn:install', async (event) => {
    if (!isTrustedUi(event)) return { ok: false, error: 'Untrusted desktop IPC request.' };
    try {
      const result = await installWireproxy({ userDataPath });
      return { ok: true, version: result.version, status: getAksaStatus() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'تعذر تثبيت محرك Aksa.', status: getAksaStatus() };
    }
  });

  ipcMain.handle('aegis:vpn:choose-config', async (event) => {
    if (!isTrustedUi(event)) return { ok: false, error: 'Untrusted desktop IPC request.' };
    if (aksaEnabled) return { ok: false, error: 'أوقف Aksa قبل تغيير ملف WireGuard.' };
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: 'اختيار ملف إعداد WireGuard من مزود VPN',
      properties: ['openFile'],
      filters: [{ name: 'WireGuard configuration', extensions: ['conf'] }],
    });
    if (selection.canceled || !selection.filePaths[0]) return { ok: false, cancelled: true, status: getAksaStatus() };
    try {
      aksaSidecar.configureProfile(selection.filePaths[0]);
      return { ok: true, status: getAksaStatus() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'ملف WireGuard غير صالح.', status: getAksaStatus() };
    }
  });

  ipcMain.handle('aegis:vpn:get-status', (event) => {
    if (!isTrustedUi(event)) return { configured: false, enabled: false, connected: false, gateway: 'not-configured', scope: 'all-electron-sessions' };
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

let finalQuitStarted = false;
app.on('before-quit', (event) => {
  if (aksaMonitor) clearInterval(aksaMonitor);
  if (!finalQuitStarted && aksaSidecar) {
    finalQuitStarted = true;
    event.preventDefault();
    void aksaSidecar.stop().finally(() => app.quit());
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
