'use strict';

const { app, BrowserWindow, WebContentsView, session, ipcMain, Menu, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('url');
const { parseAksaLocalProxy, getAegisUserDataPath } = require('./aksa-config.cjs');
const { AksaSidecar } = require('./aksa-sidecar.cjs');
const { installWireproxy } = require('./aksa-installer.cjs');
const { createBrowserSessionPolicy, getShieldManager } = require('./session-policy.cjs');
const { createSiteViewManager } = require('./site-view-manager.cjs');
const { createAkramElectronShieldRuntime } = require('../akram/shield/electron-runtime.cjs');

let mainWindow = null;
let siteViewManager = null;
app.setName('Akram Browser');
const userDataPath = getAegisUserDataPath();
app.setPath('userData', userDataPath);
const shieldManager = getShieldManager();
const shieldExperienceFile = path.join(userDataPath, 'akram-shield-experience-v1.json');
let shieldExperienceSaveTimer = null;
let shieldExperienceSavePromise = null;

async function loadShieldExperience() {
  try {
    const raw = await fs.readFile(shieldExperienceFile, 'utf8');
    shieldManager.importExperience(JSON.parse(raw));
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn('[Akram Shield] Experience history could not be loaded; starting with an empty history.');
  }
}

async function persistShieldExperience() {
  if (shieldExperienceSaveTimer) clearTimeout(shieldExperienceSaveTimer);
  shieldExperienceSaveTimer = null;
  if (shieldExperienceSavePromise) return shieldExperienceSavePromise;
  shieldExperienceSavePromise = (async () => {
    const temporaryFile = shieldExperienceFile + '.tmp';
    try {
      await fs.mkdir(userDataPath, { recursive: true });
      await fs.writeFile(temporaryFile, JSON.stringify(shieldManager.exportExperience()), { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporaryFile, shieldExperienceFile);
    } catch {
      try { await fs.rm(temporaryFile, { force: true }); } catch {}
      console.warn('[Akram Shield] Experience history could not be saved.');
    }
  })().finally(() => { shieldExperienceSavePromise = null; });
  return shieldExperienceSavePromise;
}

function scheduleShieldExperienceSave() {
  if (shieldExperienceSaveTimer) clearTimeout(shieldExperienceSaveTimer);
  shieldExperienceSaveTimer = setTimeout(() => { void persistShieldExperience(); }, 1200);
  shieldExperienceSaveTimer.unref?.();
}
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
      akramShieldRuntime.abortAll(new Error('Akram VPN proxy failure; aborting filter update.'));
      void applyAksaFailClosedProxy().catch(() => {});
    },
  }),
  isAppRequest,
  onNetworkEvent: (payload) => {
    siteViewManager?.recordNetworkEvent(payload);
    if (payload.phase === 'blocked' && payload.blockedReason === 'shield') scheduleShieldExperienceSave();
  },
});

// The updater and Chromium request policy share this exact manager instance. Updates are manual;
// no background schedule starts until the updater lifecycle and real-site compatibility are proven.
const akramShieldRuntime = createAkramElectronShieldRuntime({
  manager: shieldManager,
  vpnStatus: () => ({ enabled: aksaEnabled, connected: aksaEnabled && aksaConnected }),
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
  if (!aksaProxy) throw new Error('Akram VPN local gateway is not configured');
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
    scope: 'registered-electron-sessions',
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
      akramShieldRuntime.abortAll(new Error('Akram VPN tunnel disconnected; aborting filter update.'));
      await applyAksaFailClosedProxy();
    } else {
      aksaConnected = healthy;
    }
  } catch {
    aksaConnected = false;
    akramShieldRuntime.abortAll(new Error('Akram VPN health check failed; aborting filter update.'));
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
  if (next === true) akramShieldRuntime.abortAll(new Error('Akram VPN enabled; filter update aborted.'));
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
    return { ok: false, status: getAksaStatus(), error: 'Akram VPN desktop engine is unavailable.' };
  }
  const started = await aksaSidecar.start();
  if (!started.ok) {
    return { ok: false, status: getAksaStatus(), error: started.error || 'تعذر تشغيل نفق Akram VPN.' };
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
    return { ok: false, status: getAksaStatus(), error: 'تعذر تحويل جلسة Chromium إلى بروكسي Akram VPN المحلي.' };
  }
}


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Akram Browser',
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

  siteViewManager = createSiteViewManager({
    WebContentsView,
    Menu,
    clipboard,
    getWindow: () => mainWindow,
    getSession: (partition) => session.fromPartition(partition),
    registerSession: (browserSession) => browserSessionPolicy.register(browserSession),
    prepareSession: async (browserSession) => {
      if (!aksaEnabled) return;
      if (aksaConnected && aksaProxy) {
        await browserSession.setProxy({
          mode: 'fixed_servers',
          proxyRules: aksaProxy.proxyRules,
          proxyBypassRules: '<-loopback>',
        });
      } else {
        await browserSession.setProxy({
          mode: 'fixed_servers',
          proxyRules: 'http=127.0.0.1:1;https=127.0.0.1:1',
          proxyBypassRules: '<-loopback>',
        });
      }
      await browserSession.closeAllConnections();
    },
    getTrustedAppOrigin: () => trustedAppOrigin,
    onEvent: (payload) => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('aegis:site:event', payload);
      }
    },
  });

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
  mainWindow.on('closed', () => {
    const manager = siteViewManager;
    siteViewManager = null;
    mainWindow = null;
    void manager?.closeAll();
  });
}

app.whenReady().then(async () => {
  await loadShieldExperience();
  aksaSidecar = new AksaSidecar(userDataPath, {
    onExit: () => {
      if (aksaEnabled) {
        aksaConnected = false;
        akramShieldRuntime.abortAll(new Error('Akram VPN sidecar exited; filter update aborted.'));
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
      return { ok: false, error: error instanceof Error ? error.message : 'تعذر تثبيت محرك Akram VPN.', status: getAksaStatus() };
    }
  });

  ipcMain.handle('aegis:vpn:choose-config', async (event) => {
    if (!isTrustedUi(event)) return { ok: false, error: 'Untrusted desktop IPC request.' };
    if (aksaEnabled) return { ok: false, error: 'أوقف Akram VPN قبل تغيير ملف WireGuard.' };
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
    if (!isTrustedUi(event)) return { configured: false, enabled: false, connected: false, gateway: 'not-configured', scope: 'registered-electron-sessions' };
    return getAksaStatus();
  });
  ipcMain.handle('aegis:vpn:set-enabled', async (event, enabled) => {
    if (!isTrustedUi(event) || typeof enabled !== 'boolean') {
      return { ok: false, status: getAksaStatus(), error: 'Untrusted desktop IPC request.' };
    }
    return setAksaEnabled(enabled);
  });

  ipcMain.handle('akram:shield:get-state', (event) => {
    if (!isTrustedUi(event)) return { ok: false, error: 'Untrusted desktop IPC request.' };
    return { ok: true, state: akramShieldRuntime.getState() };
  });
  ipcMain.handle('akram:shield:update-list', async (event, sourceId) => {
    if (!isTrustedUi(event) || typeof sourceId !== 'string' || !/^[a-z0-9_-]{1,32}$/i.test(sourceId)) {
      return { ok: false, error: 'Untrusted or invalid filter update request.' };
    }
    try {
      const result = await akramShieldRuntime.update(sourceId);
      return { ok: true, result, state: akramShieldRuntime.getState() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'تعذر تحديث قائمة الحماية.', state: akramShieldRuntime.getState() };
    }
  });

  ipcMain.handle('aegis:site:create', async (event, payload) => {
    if (!isTrustedUi(event) || !siteViewManager) return { ok: false, error: 'untrusted-or-unavailable' };
    try { return await siteViewManager.create(payload); } catch { return { ok: false, error: 'site-view-unavailable' }; }
  });
  ipcMain.handle('aegis:site:set-bounds', (event, tabId, bounds) => {
    if (!isTrustedUi(event) || !siteViewManager) return false;
    return siteViewManager.setBounds(tabId, bounds);
  });
  ipcMain.handle('aegis:site:set-visible', (event, tabId, visible) => {
    if (!isTrustedUi(event) || !siteViewManager || typeof visible !== 'boolean') return false;
    return siteViewManager.setVisible(tabId, visible);
  });
  ipcMain.handle('aegis:site:navigate', async (event, tabId, url) => {
    if (!isTrustedUi(event) || !siteViewManager) return { ok: false, error: 'untrusted-or-unavailable' };
    return siteViewManager.navigate(tabId, url);
  });
  ipcMain.handle('aegis:site:back', (event, tabId) => isTrustedUi(event) && !!siteViewManager?.goBack(tabId));
  ipcMain.handle('aegis:site:forward', (event, tabId) => isTrustedUi(event) && !!siteViewManager?.goForward(tabId));
  ipcMain.handle('aegis:site:reload', (event, tabId) => isTrustedUi(event) && !!siteViewManager?.reload(tabId));
  ipcMain.handle('aegis:site:set-zoom', (event, tabId, zoomLevel) => isTrustedUi(event) && !!siteViewManager?.setZoom(tabId, zoomLevel));
  ipcMain.handle('aegis:site:close', async (event, tabId) => isTrustedUi(event) && !!(await siteViewManager?.close(tabId)));

  createWindow();

  // Bootstrap the live Chromium Shield manager once per desktop launch. This is not a
  // recurring background schedule; each source is validated and atomically activated.
  // The transport refuses direct requests whenever Akram VPN is enabled.
  void akramShieldRuntime.updateAll().then((results) => {
    for (const result of results) {
      if (result.status === 'failed') {
        console.warn(`[Akram Shield] ${result.id} initial update failed; retaining existing protection.`);
      } else {
        console.info(`[Akram Shield] ${result.id} ${result.status}; network rules: ${result.metadata?.networkRuleCount ?? 0}; cosmetic rules: ${result.metadata?.cosmeticRuleCount ?? 0}.`);
      }
    }
  }).catch(() => {
    console.warn('[Akram Shield] Initial filter-list bootstrap was skipped; existing protection remains active.');
  });

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
    void Promise.allSettled([siteViewManager?.closeAll(), akramShieldRuntime.close(), aksaSidecar.stop(), persistShieldExperience()]).finally(() => app.quit());
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
