'use strict';

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const SITE_PROTOCOLS = new Set(['http:', 'https:']);
const PRIVATE_STORAGE_TYPES = [
  'appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage',
  'shadercache', 'websql', 'serviceworkers', 'cachestorage',
];

function safeSiteUrl(rawUrl, trustedAppOrigin) {
  if (typeof rawUrl !== 'string' || rawUrl.length > 8192) return null;
  try {
    const target = new URL(rawUrl);
    if (!SITE_PROTOCOLS.has(target.protocol) || !target.hostname || target.username || target.password) return null;
    if (trustedAppOrigin && target.origin === trustedAppOrigin) return null;
    return target.toString();
  } catch {
    return null;
  }
}

function createSiteViewManager({
  WebContentsView,
  getWindow,
  getSession,
  registerSession,
  prepareSession,
  getTrustedAppOrigin,
  onEvent,
}) {
  if (typeof WebContentsView !== 'function') throw new TypeError('WebContentsView constructor is required.');
  const views = new Map();
  const partitions = new Map();
  const partitionCleanup = new Map();

  function send(tabId, type, data = {}) {
    onEvent?.({ tabId, type, ...data });
  }

  function getEntry(tabId) {
    return views.get(tabId) || null;
  }

  function attachEvents(tabId, webContents) {
    webContents.on('did-start-loading', () => send(tabId, 'loading', { isLoading: true }));
    webContents.on('did-stop-loading', () => send(tabId, 'loading', { isLoading: false }));
    webContents.on('page-title-updated', (event, title) => {
      event.preventDefault?.();
      send(tabId, 'title', { title: typeof title === 'string' ? title.slice(0, 200) : '' });
    });
    webContents.on('did-navigate', (_event, url) => {
      const safeUrl = safeSiteUrl(url, getTrustedAppOrigin());
      if (safeUrl) send(tabId, 'navigation', { url: safeUrl, canGoBack: webContents.canGoBack(), canGoForward: webContents.canGoForward() });
    });
    webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame) return;
      const safeUrl = safeSiteUrl(url, getTrustedAppOrigin());
      if (safeUrl) send(tabId, 'navigation', { url: safeUrl, canGoBack: webContents.canGoBack(), canGoForward: webContents.canGoForward() });
    });
    webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
      if (isMainFrame) send(tabId, 'error', { code: Number.isInteger(errorCode) ? errorCode : -1 });
    });
    webContents.on('render-process-gone', (_event, details) => {
      send(tabId, 'process-gone', { reason: typeof details?.reason === 'string' ? details.reason.slice(0, 40) : 'unknown' });
    });
    webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    webContents.on('will-navigate', (event, url) => {
      if (!safeSiteUrl(url, getTrustedAppOrigin())) event.preventDefault();
    });
    webContents.on('will-redirect', (event, url) => {
      if (!safeSiteUrl(url, getTrustedAppOrigin())) event.preventDefault();
    });
    webContents.on('will-attach-webview', (event) => event.preventDefault());
  }

  function clampBounds(rawBounds, window) {
    if (!rawBounds || !window || window.isDestroyed()) return null;
    const values = ['x', 'y', 'width', 'height'].map((key) => Number(rawBounds[key]));
    if (!values.every(Number.isFinite)) return null;
    const [rawX, rawY, rawWidth, rawHeight] = values;
    if (rawWidth < 1 || rawHeight < 1) return null;
    const content = window.getContentBounds();
    const x = Math.max(0, Math.min(Math.floor(rawX), content.width - 1));
    const y = Math.max(0, Math.min(Math.floor(rawY), content.height - 1));
    return {
      x,
      y,
      width: Math.max(1, Math.min(Math.floor(rawWidth), content.width - x)),
      height: Math.max(1, Math.min(Math.floor(rawHeight), content.height - y)),
    };
  }

  async function create(input) {
    const { tabId, profileKind, profileId, url } = input || {};
    if (typeof tabId !== 'string' || !SAFE_ID.test(tabId)) return { ok: false, error: 'invalid-tab-id' };
    if (profileKind !== 'regular' && profileKind !== 'private') return { ok: false, error: 'invalid-profile-kind' };
    if (profileId !== 'main') return { ok: false, error: 'unknown-profile' };
    const partition = profileKind === 'regular'
      ? 'persist:aegis-regular-' + profileId
      : 'aegis-private-' + profileId;
    const existing = views.get(tabId);
    if (existing) return existing.partition === partition
      ? { ok: true, tabId, existing: true }
      : { ok: false, error: 'tab-profile-mismatch' };

    const initialUrl = safeSiteUrl(url, getTrustedAppOrigin());
    if (!initialUrl) return { ok: false, error: 'navigation-denied' };

    const pendingCleanup = partitionCleanup.get(partition);
    if (pendingCleanup) await pendingCleanup;
    const browserSession = getSession(partition);
    registerSession(browserSession);
    await prepareSession(browserSession);

    // A second create request may have completed while session preparation was pending.
    const createdDuringPreparation = views.get(tabId);
    if (createdDuringPreparation) return createdDuringPreparation.partition === partition
      ? { ok: true, tabId, existing: true }
      : { ok: false, error: 'tab-profile-mismatch' };

    const window = getWindow();
    if (!window || window.isDestroyed()) return { ok: false, error: 'window-unavailable' };

    const view = new WebContentsView({
      webPreferences: {
        session: browserSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        spellcheck: false,
      },
    });

    const entry = { view, browserSession, partition, profileKind, profileId };
    views.set(tabId, entry);
    const partitionEntry = partitions.get(partition) || { browserSession, profileKind, count: 0 };
    partitionEntry.count += 1;
    partitions.set(partition, partitionEntry);

    view.setBounds({ x: 0, y: 0, width: 1, height: 1 });
    view.setVisible(false);
    window.contentView.addChildView(view);
    attachEvents(tabId, view.webContents);

    try {
      await view.webContents.loadURL(initialUrl);
      return { ok: true, tabId };
    } catch {
      await close(tabId);
      return { ok: false, error: 'navigation-failed' };
    }
  }

  function setBounds(tabId, bounds) {
    const entry = getEntry(tabId);
    const window = getWindow();
    if (!entry || !window || window.isDestroyed()) return false;
    const safeBounds = clampBounds(bounds, window);
    if (!safeBounds) {
      entry.view.setVisible(false);
      return false;
    }
    entry.view.setBounds(safeBounds);
    return true;
  }

  function setVisible(tabId, visible) {
    const entry = getEntry(tabId);
    if (!entry) return false;
    entry.view.setVisible(visible === true);
    return true;
  }

  async function navigate(tabId, rawUrl) {
    const entry = getEntry(tabId);
    const url = safeSiteUrl(rawUrl, getTrustedAppOrigin());
    if (!entry || !url) return { ok: false, error: 'navigation-denied' };
    try {
      await entry.view.webContents.loadURL(url);
      return { ok: true };
    } catch {
      return { ok: false, error: 'navigation-failed' };
    }
  }

  function goBack(tabId) {
    const contents = getEntry(tabId)?.view.webContents;
    if (!contents || !contents.canGoBack()) return false;
    contents.goBack();
    return true;
  }

  function goForward(tabId) {
    const contents = getEntry(tabId)?.view.webContents;
    if (!contents || !contents.canGoForward()) return false;
    contents.goForward();
    return true;
  }

  function reload(tabId) {
    const contents = getEntry(tabId)?.view.webContents;
    if (!contents) return false;
    contents.reload();
    return true;
  }

  function setZoom(tabId, zoomLevel) {
    const contents = getEntry(tabId)?.view.webContents;
    const level = Number(zoomLevel);
    if (!contents || !Number.isFinite(level) || level < 50 || level > 200) return false;
    contents.setZoomFactor(level / 100);
    return true;
  }

  async function clearPrivateSession(browserSession) {
    await Promise.allSettled([
      browserSession.clearStorageData({ storages: PRIVATE_STORAGE_TYPES }),
      browserSession.clearCache(),
      browserSession.clearAuthCache(),
      browserSession.clearHostResolverCache(),
    ]);
  }

  async function close(tabId) {
    const entry = getEntry(tabId);
    if (!entry) return false;
    views.delete(tabId);
    const window = getWindow();
    if (window && !window.isDestroyed()) {
      try { window.contentView.removeChildView(entry.view); } catch {}
    }
    try {
      if (!entry.view.webContents.isDestroyed()) entry.view.webContents.destroy();
    } catch {}

    const partitionEntry = partitions.get(entry.partition);
    if (partitionEntry) {
      partitionEntry.count = Math.max(0, partitionEntry.count - 1);
      if (partitionEntry.count === 0) {
        partitions.delete(entry.partition);
        if (entry.profileKind === 'private') {
          const cleanup = clearPrivateSession(entry.browserSession);
          partitionCleanup.set(entry.partition, cleanup);
          await cleanup;
          if (partitionCleanup.get(entry.partition) === cleanup) partitionCleanup.delete(entry.partition);
        }
      }
    }
    return true;
  }

  async function closeAll() {
    await Promise.all([...views.keys()].map((tabId) => close(tabId)));
  }

  return Object.freeze({
    create, setBounds, setVisible, navigate, goBack, goForward, reload, setZoom, close, closeAll,
    has: (tabId) => views.has(tabId),
    getCount: () => views.size,
  });
}

module.exports = { createSiteViewManager, safeSiteUrl };
