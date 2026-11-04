// Electron Desktop Main Process for Aegis Privacy Browser (Windows / macOS / Linux)
const { app, BrowserWindow, session, Menu, shell } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

let mainWindow;
let serverProc;
const PORT = process.env.AEGIS_PORT || '3187';

function waitForServer(retries = 60) {
  return new Promise((resolve, reject) => {
    const tryOnce = (n) => {
      http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => { res.resume(); resolve(); })
        .on('error', () => (n <= 0 ? reject(new Error('server did not start')) : setTimeout(() => tryOnce(n - 1), 500)));
    };
    tryOnce(retries);
  });
}

function startServer() {
  const root = path.join(__dirname, '..');
  const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  serverProc = spawn(process.execPath, [tsx, 'server.ts', '--port', PORT], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
  });
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
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Remove native default menu for sleek browser look
  Menu.setApplicationMenu(null);

  // Set privacy headers and block common ad/tracker scripts at the Electron session level
  const filter = {
    urls: [
      '*://*.doubleclick.net/*',
      '*://*.google-analytics.com/*',
      '*://*.googletagmanager.com/*',
      '*://*.facebook.com/tr/*',
      '*://*.criteo.com/*',
      '*://*.taboola.com/*',
      '*://*.outbrain.com/*',
    ],
  };

  session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    callback({ cancel: true });
  });

  // Use a common desktop user agent
  session.defaultSession.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );

  // In production, load the built index.html or local express server
  // The UI needs the local proxy server (/api), so load it over http, never file://
  const startUrl = process.env.ELECTRON_START_URL || `http://127.0.0.1:${PORT}`;
  mainWindow.loadURL(startUrl);

  // Keep the shell locked to the app: external links open in the system browser, never in this window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`)) e.preventDefault();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  if (!process.env.ELECTRON_START_URL) {
    startServer();
    await waitForServer();
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => { if (serverProc) serverProc.kill(); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
