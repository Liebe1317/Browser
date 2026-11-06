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
  const webContentsToTab = new Map();
  const partitions = new Map();
  const partitionCleanup = new Map();

  function send(tabId, type, data = {}) {
    onEvent?.({ tabId, type, ...data });
  }

  function getEntry(tabId) {
    return views.get(tabId) || null;
  }

  function attachEvents(tabId, webContents, entry) {
    webContents.on('did-start-loading', () => send(tabId, 'loading', { isLoading: true }));
    webContents.on('did-stop-loading', () => send(tabId, 'loading', { isLoading: false }));
    webContents.on('media-started-playing', () => send(tabId, 'media-state', { state: 'playing' }));
    webContents.on('media-paused', () => send(tabId, 'media-state', { state: 'paused' }));
    webContents.on('audio-state-changed', (_event, audible) => send(tabId, 'audio-state', { audible: audible === true }));
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
    // Allow ordinary web popups as separate, sandboxed windows that reuse the
    // opener's exact profile partition. Chromium still applies its transient
    // user-activation popup policy; unsafe schemes and the privileged app origin
    // are rejected before a window is created.
    webContents.setWindowOpenHandler((details) => {
      const popupUrl = details && details.url === 'about:blank'
        ? 'about:blank'
        : safeSiteUrl(details?.url, getTrustedAppOrigin());
      if (!popupUrl) return { action: 'deny' };
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          parent: getWindow(),
          width: 1100,
          height: 760,
          show: true,
          webPreferences: {
            partition: entry.partition,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            webviewTag: false,
            spellcheck: false,
          },
        },
      };
    });
    webContents.on('did-create-window', (popupWindow) => {
      const popupContents = popupWindow?.webContents;
      if (!popupContents || popupContents.isDestroyed?.()) return;
      webContentsToTab.set(popupContents.id, tabId);
      attachEvents(tabId, popupContents, entry);
      popupContents.once('destroyed', () => webContentsToTab.delete(popupContents.id));
    });
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
        // Pin Chromium's storage partition explicitly on the WebContentsView itself.
        // Keep the preconfigured Session object too, so session policy is applied to
        // exactly the same partition used by the renderer.
        partition,
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
    webContentsToTab.set(view.webContents.id, tabId);
    const partitionEntry = partitions.get(partition) || { browserSession, profileKind, count: 0 };
    partitionEntry.count += 1;
    partitions.set(partition, partitionEntry);

    view.setBounds({ x: 0, y: 0, width: 1, height: 1 });
    view.setVisible(false);
    window.contentView.addChildView(view);
    attachEvents(tabId, view.webContents, entry);

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
    // Fail closed: never reuse a private partition if any cleanup operation fails.
    await Promise.all([
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
    webContentsToTab.delete(entry.view.webContents.id);
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
    recordNetworkEvent: (payload) => {
      if (!payload || !Number.isInteger(payload.webContentsId)) return false;
      const tabId = webContentsToTab.get(payload.webContentsId);
      if (!tabId) return false;
      const phase = ['started', 'completed', 'failed', 'blocked'].includes(payload.phase) ? payload.phase : null;
      if (!phase || typeof payload.requestId !== 'string' || typeof payload.url !== 'string'
        || typeof payload.method !== 'string' || typeof payload.resourceType !== 'string'
        || typeof payload.timestamp !== 'number') return false;
      send(tabId, 'network-request', {
        requestId: payload.requestId.slice(0, 160),
        url: payload.url.slice(0, 2048),
        method: payload.method.slice(0, 16),
        resourceType: payload.resourceType.slice(0, 32),
        phase,
        timestamp: payload.timestamp,
        ...(Number.isInteger(payload.statusCode) ? { statusCode: payload.statusCode } : {}),
        ...(Number.isFinite(payload.duration) ? { duration: Math.max(0, payload.duration) } : {}),
        ...(typeof payload.error === 'string' ? { error: payload.error.slice(0, 80) } : {}),
        ...(typeof payload.blockedReason === 'string' ? { blockedReason: payload.blockedReason.slice(0, 40) } : {}),
      });
      return true;
    },
    getCount: () => views.size,
  });
}

module.exports = { createSiteViewManager, safeSiteUrl };
