'use strict';

const { app, BrowserWindow, session } = require('electron');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createSiteViewManager } = require('../../electron/site-view-manager.cjs');

app.disableHardwareAcceleration();

let server;
let browserWindow;
let manager;

function waitForServer(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.once('error', reject);
    serverInstance.listen(0, '127.0.0.1', () => {
      serverInstance.removeListener('error', reject);
      resolve(serverInstance.address());
    });
  });
}

async function openTab(profileKind, tabId, url) {
  // Several tabs intentionally load the same URL. Identify the newly attached
  // WebContentsView by object identity instead of matching its URL.
  const previousViews = new Set(browserWindow.contentView.children);
  const result = await manager.create({
    tabId,
    profileKind,
    profileId: 'main',
    url,
  });
  assert.equal(result.ok, true, 'native site view should load');
  assert.equal(manager.setBounds(tabId, { x: 0, y: 0, width: 640, height: 480 }), true);
  assert.equal(manager.setVisible(tabId, true), true);

  const view = browserWindow.contentView.children.find((child) => {
    return !previousViews.has(child) && child.webContents;
  });
  assert.ok(view, 'new WebContentsView should be attached to the BrowserWindow');

  const expectedPartition = profileKind === 'regular'
    ? 'persist:aegis-regular-main'
    : 'aegis-private-main';
  assert.equal(
    view.webContents.session.getPartition(),
    expectedPartition,
    profileKind + ' WebContentsView must use its designated Chromium partition',
  );
  return view;
}

const watchdog = setTimeout(() => {
  console.error('[Electron smoke test] Timed out waiting for Chromium.');
  app.exit(1);
}, 90_000);

async function run() {
  server = http.createServer((_request, response) => {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end('<!doctype html><html><head><title>Aegis Chromium Smoke</title></head><body><main id="fixture">native Chromium is alive</main></body></html>');
  });
  const address = await waitForServer(server);
  const url = 'http://127.0.0.1:' + address.port + '/fixture';

  browserWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  manager = createSiteViewManager({
    WebContentsView: require('electron').WebContentsView,
    getWindow: () => browserWindow,
    getSession: (partition) => session.fromPartition(partition),
    registerSession: () => {},
    prepareSession: async () => {},
    getTrustedAppOrigin: () => null,
    onEvent: () => {},
  });

  // Regular profile storage must persist across tabs and remain isolated from private mode.
  const regularFirst = await openTab('regular', 'regular-first', url);
  const regularPrefs = regularFirst.webContents.getLastWebPreferences();
  assert.equal(regularPrefs.nodeIntegration, false);
  assert.equal(regularPrefs.contextIsolation, true);
  assert.equal(regularPrefs.sandbox, true);
  assert.equal(regularPrefs.webSecurity, true);
  assert.equal(regularPrefs.webviewTag, false);
  assert.equal(regularPrefs.preload, undefined, 'remote site view must not receive a preload');
  assert.equal(await regularFirst.webContents.executeJavaScript('typeof window.require'), 'undefined');
  assert.equal(await regularFirst.webContents.executeJavaScript('typeof window.aegisDesktop'), 'undefined');
  await regularFirst.webContents.executeJavaScript("localStorage.setItem('aegis-smoke', 'regular-only')");
  await manager.close('regular-first');

  const regularSecond = await openTab('regular', 'regular-second', url);
  assert.equal(
    await regularSecond.webContents.executeJavaScript("localStorage.getItem('aegis-smoke')"),
    'regular-only',
    'regular profile storage should persist between tabs',
  );

  // Private profile must not inherit regular storage, and must be cleared after its last tab closes.
  const privateFirst = await openTab('private', 'private-first', url);
  assert.equal(
    await privateFirst.webContents.executeJavaScript("localStorage.getItem('aegis-smoke')"),
    null,
    'private profile must not share regular profile localStorage',
  );
  await privateFirst.webContents.executeJavaScript("localStorage.setItem('aegis-smoke', 'private-secret')");
  await manager.close('private-first');

  const privateSecond = await openTab('private', 'private-second', url);
  assert.equal(
    await privateSecond.webContents.executeJavaScript("localStorage.getItem('aegis-smoke')"),
    null,
    'private profile storage must be cleared after its final tab closes',
  );

  assert.equal((await manager.navigate('private-second', 'file:///C:/Windows/win.ini')).ok, false);
  assert.equal((await manager.navigate('private-second', 'javascript:alert(1)')).ok, false);

  await manager.closeAll();
  browserWindow.destroy();
  browserWindow = null;
  await new Promise((resolve) => server.close(resolve));
  server = null;
  console.log('PASS - native WebContentsView loads a real local HTTP page');
  console.log('PASS - remote view has no Node, preload, or privileged desktop bridge');
  console.log('PASS - regular and private views use their exact Chromium partitions');
  console.log('PASS - regular profile storage persists and remains separate');
  console.log('PASS - private profile storage is cleared after last tab closes');
  console.log('PASS - file and javascript navigation are denied');
}

app.whenReady().then(run).then(() => {
  clearTimeout(watchdog);
  app.quit();
}).catch((error) => {
  clearTimeout(watchdog);
  console.error('[Electron smoke test failed]', error && error.stack ? error.stack : String(error));
  try { manager?.closeAll(); } catch {}
  try { browserWindow?.destroy(); } catch {}
  try { server?.close(); } catch {}
  app.exit(1);
});
