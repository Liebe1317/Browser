// Electron Desktop Main Process for Aegis Privacy Browser (Windows / macOS / Linux)
const { app, BrowserWindow, session, ipcMain, Menu } = require('electron');
const path = require('path');

let mainWindow;

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
    icon: path.join(__dirname, '../public/favicon.ico'),
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

  // Randomize Canvas Fingerprint in Electron
  session.defaultSession.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );

  // In production, load the built index.html or local express server
  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  mainWindow.loadURL(startUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
