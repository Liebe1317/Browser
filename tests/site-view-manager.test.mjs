import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';

const require = createRequire(import.meta.url);
const { createSiteViewManager, safeSiteUrl } = require('../electron/site-view-manager.cjs');
const ok = (condition, message) => {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + message);
  if (!condition) process.exitCode = 1;
};

ok(safeSiteUrl('https://video.example/watch', 'http://127.0.0.1:3000') === 'https://video.example/watch', 'ordinary HTTPS navigation is accepted');
ok(safeSiteUrl('javascript:alert(1)', null) === null, 'script URLs are rejected');
ok(safeSiteUrl('file:///etc/passwd', null) === null, 'file URLs are rejected');
ok(safeSiteUrl('https://user:pass@video.example/', null) === null, 'embedded credentials are rejected');
ok(safeSiteUrl('http://127.0.0.1:3000/private', 'http://127.0.0.1:3000') === null, 'site views cannot navigate to the trusted app origin');

const sessions = new Map();
const registered = [];
const prepared = [];
const sessionFor = (partition) => {
  if (!sessions.has(partition)) {
    sessions.set(partition, {
      clearStorage: 0, clearCacheCount: 0, clearAuthCount: 0, clearDnsCount: 0,
      clearStorageData: async (options) => { sessions.get(partition).clearStorage += 1; sessions.get(partition).storageOptions = options; if (sessions.get(partition).failStorageClear) throw new Error('simulated private cleanup failure'); },
      clearCache: async () => { sessions.get(partition).clearCacheCount += 1; },
      clearAuthCache: async () => { sessions.get(partition).clearAuthCount += 1; },
      clearHostResolverCache: async () => { sessions.get(partition).clearDnsCount += 1; },
    });
  }
  return sessions.get(partition);
};

const windows = {
  children: [],
  isDestroyed: () => false,
  getContentBounds: () => ({ width: 800, height: 600 }),
  contentView: {
    addChildView(view) { windows.children.push(view); },
    removeChildView(view) { windows.children = windows.children.filter((candidate) => candidate !== view); },
  },
};

const createdViews = [];
class FakeWebContentsView {
  constructor(options) {
    this.options = options;
    this.bounds = null;
    this.visible = null;
    this.webContents = new EventEmitter();
    this.webContents.id = createdViews.length + 100;
    this.webContents.isDestroyed = () => false;
    this.webContents.canGoBack = () => true;
    this.webContents.canGoForward = () => false;
    this.webContents.goBack = () => { this.webContents.wentBack = true; };
    this.webContents.goForward = () => { this.webContents.wentForward = true; };
    this.webContents.reload = () => { this.webContents.reloaded = true; };
    this.webContents.setZoomFactor = (factor) => { this.webContents.zoomFactor = factor; };
    this.webContents.destroy = () => { this.webContents.destroyed = true; };
    this.webContents.setWindowOpenHandler = (handler) => { this.webContents.openHandler = handler; };
    this.webContents.playerObserverOrder = [];
    this.webContents.insertCSS = async (css) => { this.webContents.playerObserverOrder.push('css'); this.webContents.insertedCss = css; };
    this.webContents.executeJavaScriptInIsolatedWorld = async (worldId, scripts, userGesture) => { this.webContents.playerObserverOrder.push('observer'); this.webContents.playerObserverScript = scripts[0]?.code || ''; this.webContents.playerObserverWorldId = worldId; this.webContents.playerObserverUserGesture = userGesture; return 'installed'; };
    this.getBounds = () => this.bounds || { x: 0, y: 0 };
    for (const method of ['copy', 'cut', 'paste', 'undo', 'redo', 'selectAll']) {
      this.webContents[method] = () => { this.webContents.lastCommand = method; };
    }
    this.webContents.loadURL = async (url) => { this.webContents.loadedUrl = url; };
    this.webContents.getURL = () => this.webContents.loadedUrl || '';
    createdViews.push(this);
  }
  setBounds(bounds) { this.bounds = bounds; }
  setVisible(visible) { this.visible = visible; }
}

const events = [];
const playerObservations = [];
let lastContextMenu = null;
let lastContextMenuOptions = null;
let copiedText = '';
const fakeMenu = {
  buildFromTemplate: (template) => ({ template, popup: (options) => { lastContextMenu = template; lastContextMenuOptions = options; } }),
};
const manager = createSiteViewManager({
  WebContentsView: FakeWebContentsView,
  Menu: fakeMenu,
  clipboard: { writeText: (value) => { copiedText = value; } },
  getWindow: () => windows,
  getSession: sessionFor,
  registerSession: (session) => registered.push(session),
  prepareSession: async (session) => prepared.push(session),
  getTrustedAppOrigin: () => 'http://127.0.0.1:3000',
  onEvent: (event) => events.push(event),
  onPlayerObservation: (observation) => { playerObservations.push(observation); return { fingerprint: 'a'.repeat(64) }; },
});

const unknownProfile = await manager.create({ tabId: 'tab-unknown', profileKind: 'regular', profileId: 'another-profile', url: 'https://video.example/' });
ok(unknownProfile.ok === false && unknownProfile.error === 'unknown-profile', 'renderer cannot select an unregistered profile partition');

const first = await manager.create({
  tabId: 'tab-a', profileKind: 'private', profileId: 'main',
  url: 'https://www.youtube.com/watch?v=test-video',
});
ok(first.ok && manager.has('tab-a'), 'a site view is created for a validated tab');
const duplicate = await manager.create({ tabId: 'tab-a', profileKind: 'private', profileId: 'main', url: 'https://www.youtube.com/watch?v=test-video' });
ok(duplicate.ok && duplicate.existing === true && createdViews.length === 1, 're-activating an existing tab reuses its native view without duplication');
ok(registered.length === 1 && prepared.length === 1, 'session policy and VPN preparation run before view creation');
ok(createdViews[0].options.webPreferences.nodeIntegration === false, 'site view has Node integration disabled');
ok(createdViews[0].options.webPreferences.contextIsolation === true, 'site view enforces context isolation');
ok(createdViews[0].options.webPreferences.sandbox === true, 'site view enforces renderer sandboxing');
ok(createdViews[0].options.webPreferences.webSecurity === true, 'site view keeps Chromium web security enabled');
ok(!('preload' in createdViews[0].options.webPreferences), 'untrusted site view receives no privileged preload');
ok(createdViews[0].options.webPreferences.session === sessionFor('aegis-private-main'), 'private tabs use an ephemeral profile partition');
ok(createdViews[0].visible === false, 'new native views start hidden until layout activates them');
createdViews[0].webContents.emit('dom-ready');
await Promise.resolve();
ok(createdViews[0].webContents.insertedCss.includes('.ytp-ad-overlay-container')
  && createdViews[0].webContents.insertedCss.includes('.adsbygoogle'),
  'site views install cosmetic ad-slot and YouTube overlay filtering');
ok(createdViews[0].webContents.playerObserverScript.includes('MutationObserver')
  && createdViews[0].webContents.playerObserverWorldId === 1337
  && createdViews[0].webContents.playerObserverUserGesture === true
  && createdViews[0].webContents.playerObserverOrder.indexOf('observer') < createdViews[0].webContents.playerObserverOrder.indexOf('css'),
  'site views install the dynamic Player-Aware DOM observer in an isolated Chromium world before applying cosmetic CSS');
const playerToken = createdViews[0].webContents.playerObserverScript.match(/const token = "([a-f0-9]{48})"/)?.[1];
ok(!!playerToken, 'Player-Aware observer uses a per-document secret event token');
createdViews[0].webContents.emit('console-message', {}, {
  message: 'AKRAM_PLAYER_OBS:' + playerToken + ':' + JSON.stringify({
    type: 'candidate', state: 'visible', selector: '.sponsored-overlay', placement: 'player-overlay',
    confidence: 'high', reasons: ['sponsored'],
  }),
});
ok(playerObservations.length === 1 && playerObservations[0].surface === 'player'
  && playerObservations[0].pageHost === 'www.youtube.com',
  'authenticated player observations are recorded with page-scoped metadata');
ok(events.at(-1).type === 'player-observation' && events.at(-1).fingerprint === 'a'.repeat(64),
  'player observations are forwarded to the trusted browser UI');
createdViews[0].webContents.emit('console-message', {}, {
  message: 'AKRAM_PLAYER_OBS:' + playerToken + ':' + JSON.stringify({
    type: 'transition', state: 'hidden', selector: '.sponsored-overlay', placement: 'player-overlay',
    confidence: 'high', reasons: ['sponsored'],
  }),
});
ok(playerObservations.at(-1).state === 'hidden' && events.at(-1).state === 'hidden',
  'player overlay visibility transitions are persisted and forwarded');
createdViews[0].webContents.emit('console-message', {}, {
  message: 'AKRAM_PLAYER_OBS:' + playerToken + ':' + JSON.stringify({
    type: 'transition', state: 'removed', selector: '.floating-ad', placement: 'player-overlay',
    confidence: 'medium', reasons: ['ad'],
  }),
});
ok(playerObservations.at(-1).state === 'removed' && events.at(-1).state === 'removed',
  'removed player overlays are persisted and forwarded');
createdViews[0].webContents.emit('console-message', {}, {
  message: 'AKRAM_PLAYER_OBS:' + playerToken + ':' + JSON.stringify({
    type: 'transition', state: 'reclassified', selector: '.sponsored-overlay',
    confidence: 'high', reasons: ['sponsored'],
  }),
});
ok(playerObservations.at(-1).state === 'reclassified' && events.at(-1).state === 'reclassified',
  'reclassified player elements are persisted and forwarded without pretending they were removed');
createdViews[0].webContents.emit('context-menu', {}, {
  linkURL: 'https://video.example/target',
  x: 115,
  y: 165,
  selectionText: 'selected text',
  isEditable: false,
  editFlags: { canCopy: true },
});
ok(Array.isArray(lastContextMenu) && lastContextMenu.some((item) => item.label === 'نسخ عنوان الرابط'), 'right-click opens a native context menu with link actions');
ok(lastContextMenuOptions.x === 115 && lastContextMenuOptions.y === 165, 'context menu is positioned at the native site-view pointer coordinates');
const copyLinkItem = lastContextMenu.find((item) => item.label === 'نسخ عنوان الرابط');
copyLinkItem.click();
ok(copiedText === 'https://video.example/target', 'context menu copies only validated HTTP(S) link URLs');
const copySelectionItem = lastContextMenu.find((item) => item.label === 'نسخ التحديد');
copySelectionItem.click();
ok(createdViews[0].webContents.lastCommand === 'copy', 'context menu copies selected page text through Chromium');
createdViews[0].webContents.emit('context-menu', {}, {
  isEditable: true,
  editFlags: { canUndo: true, canRedo: true, canCut: true, canCopy: true, canPaste: true },
});
ok(lastContextMenu.some((item) => item.label === 'لصق') && lastContextMenu.some((item) => item.label === 'قص'), 'editable fields receive standard editing actions');
const safePopup = createdViews[0].webContents.openHandler({ url: 'https://download.example/file', disposition: 'foreground-tab' });
ok(safePopup.action === 'deny', 'script-created foreground popups are denied by default');
ok(createdViews[0].webContents.openHandler({ url: 'https://download.example/file', disposition: 'background-tab' }).action === 'deny', 'background pop-under windows are blocked');
ok(createdViews[0].webContents.openHandler({ url: 'https://clickadu.com/redirect', disposition: 'foreground-tab' }).action === 'deny', 'known ad-network popup destinations are blocked');
ok(createdViews[0].webContents.openHandler({ url: 'https://download.example/file', disposition: 'new-window' }).action === 'deny', 'unsolicited new-window requests are blocked');
// Popup windows are denied before a child WebContents can be created.
ok(createdViews[0].webContents.openHandler({ url: 'javascript:alert(1)' }).action === 'deny', 'script popups remain blocked');
ok(createdViews[0].webContents.openHandler({ url: 'http://127.0.0.1:3000/private' }).action === 'deny', 'popups cannot target the privileged app origin');
const popupContents = new EventEmitter();
popupContents.id = 900;
popupContents.isDestroyed = () => false;
popupContents.setWindowOpenHandler = (handler) => { popupContents.openHandler = handler; };
const popupWindow = new EventEmitter();
popupWindow.webContents = popupContents;
popupWindow.isDestroyed = () => false;
popupWindow.close = () => { popupWindow.closed = true; popupWindow.emit('closed'); };
createdViews[0].webContents.emit('did-create-window', popupWindow);
const popupNetworkRouted = manager.recordNetworkEvent({
  webContentsId: 900, requestId: 'popup-network', url: 'https://download.example/file',
  method: 'GET', resourceType: 'document', phase: 'started', timestamp: 122,
});
ok(popupNetworkRouted, 'popup network events remain associated with their owning tab');
const routed = manager.recordNetworkEvent({
  webContentsId: createdViews[0].webContents.id,
  requestId: 'network-1',
  url: 'https://video.example/segment.ts',
  method: 'GET',
  resourceType: 'media',
  phase: 'completed',
  timestamp: 123,
  statusCode: 200,
  responseHeaders: { server: 'cloudflare', 'cf-ray': 'abc123-SAW', 'set-cookie': 'secret=session-cookie' },
  cookie: 'must-not-forward',
});
ok(routed === true, 'Chromium network events are associated with their owning tab');
ok(events.at(-1).type === 'network-request' && events.at(-1).tabId === 'tab-a', 'network events are delivered to the correct tab');
ok(!Object.hasOwn(events.at(-1), 'webContentsId') && !Object.hasOwn(events.at(-1), 'cookie'), 'internal identifiers and unexpected fields are not forwarded to the renderer');
ok(events.at(-1).responseHeaders.server === 'cloudflare' && events.at(-1).responseHeaders['cf-ray'] === 'abc123-SAW' && !JSON.stringify(events.at(-1)).includes('session-cookie'), 'only allowlisted response headers are forwarded; cookies remain private');
ok(manager.recordNetworkEvent({ webContentsId: 999999, requestId: 'orphan', url: 'https://video.example/', method: 'GET', resourceType: 'other', phase: 'started', timestamp: 124 }) === false, 'unowned WebContents network events are discarded');
ok(manager.recordNetworkEvent({ webContentsId: createdViews[0].webContents.id, requestId: 314159, url: 'https://video.example/', method: 'GET', resourceType: 'other', phase: 'started', timestamp: 124 }) === false, 'the renderer boundary rejects unnormalized numeric request identifiers');
ok(manager.recordNetworkEvent({ webContentsId: createdViews[0].webContents.id, requestId: 'bad-phase', url: 'https://video.example/', method: 'GET', resourceType: 'other', phase: 'unexpected', timestamp: 125 }) === false, 'malformed network event phases are rejected');

createdViews[0].webContents.listeners('media-started-playing')[0]();
ok(events.at(-1).type === 'media-state' && events.at(-1).state === 'playing', 'Chromium media-started events are forwarded without page script injection');
createdViews[0].webContents.listeners('media-paused')[0]();
ok(events.at(-1).type === 'media-state' && events.at(-1).state === 'paused', 'Chromium media-paused events are forwarded');
createdViews[0].webContents.listeners('audio-state-changed')[0]({}, true);
ok(events.at(-1).type === 'audio-state' && events.at(-1).audible === true, 'Chromium audio state is exposed as a boolean only');

let blockedNavigation = false;
const navigationHandler = createdViews[0].webContents.listeners('will-navigate')[0];
navigationHandler({ preventDefault: () => { blockedNavigation = true; } }, 'file:///etc/passwd');
ok(blockedNavigation, 'native site navigation blocks local file URLs');
blockedNavigation = false;
navigationHandler({ preventDefault: () => { blockedNavigation = true; } }, 'http://127.0.0.1:3000/api');
ok(blockedNavigation, 'native site navigation blocks the trusted app origin');

ok(manager.setBounds('tab-a', { x: -50, y: -10, width: 2000, height: 1000 }), 'valid native view bounds are accepted and clamped');
ok(JSON.stringify(createdViews[0].bounds) === JSON.stringify({ x: 0, y: 0, width: 800, height: 600 }), 'native view bounds cannot escape the BrowserWindow content area');
ok(!manager.setBounds('tab-a', { x: 0, y: 0, width: 'bad', height: 20 }), 'malformed view bounds are rejected');
ok(createdViews[0].visible === false, 'invalid bounds hide the native view');
ok(manager.setVisible('tab-a', true) && createdViews[0].visible === true, 'the active tab view can be shown');

ok((await manager.navigate('tab-a', 'javascript:alert(1)')).ok === false, 'IPC navigation cannot load script URLs');
ok((await manager.navigate('tab-a', 'https://video.example/next')).ok, 'valid web navigation is accepted');
ok(manager.goBack('tab-a') && createdViews[0].webContents.wentBack, 'back navigation is routed to the owned WebContents');
ok(manager.reload('tab-a') && createdViews[0].webContents.reloaded, 'reload is routed to the owned WebContents');
ok(manager.setZoom('tab-a', 125) && createdViews[0].webContents.zoomFactor === 1.25, 'zoom is applied through Chromium without transforming the native view');
ok(!manager.setZoom('tab-a', 500), 'out-of-range zoom values are rejected');

const titleHandler = createdViews[0].webContents.listeners('page-title-updated')[0];
let titlePrevented = false;
titleHandler({ preventDefault: () => { titlePrevented = true; } }, 'A'.repeat(250));
ok(titlePrevented && events.at(-1).title.length === 200, 'page titles are prevented from changing the native window and are length-bounded');
const failHandler = createdViews[0].webContents.listeners('did-fail-load')[0];
const eventCountBeforeAbort = events.length;
failHandler({}, -3, 'net::ERR_ABORTED', 'https://video.example/redirected', true);
ok(events.length === eventCountBeforeAbort, 'superseded or aborted main-frame navigations do not surface as page-load failures');
failHandler({}, -105, 'private error text token=secret', 'https://video.example/private?token=secret', true);
ok(events.at(-1).type === 'error' && events.at(-1).code === -105 && !JSON.stringify(events.at(-1)).includes('secret'), 'real load errors expose only a numeric code, never URLs or error text');

const second = await manager.create({
  tabId: 'tab-b', profileKind: 'private', profileId: 'main',
  url: 'https://video.example/another',
});
ok(second.ok && registered.length === 2 && registered[0] === registered[1], 'private tabs share one profile session and reuse the registered session policy');
await manager.close('tab-a');
ok(popupWindow.closed === true, 'closing a tab also closes its popup windows');
ok(sessionFor('aegis-private-main').clearStorage === 0, 'private profile data is retained while another private tab remains open');
await manager.close('tab-b');
ok(sessionFor('aegis-private-main').clearStorage === 1, 'private profile storage is cleared after its last tab closes');
ok(sessionFor('aegis-private-main').clearCacheCount === 1 && sessionFor('aegis-private-main').clearAuthCount === 1, 'private cache and authentication state are cleared on final close');
ok(windows.children.length === 0 && manager.getCount() === 0, 'closed site views are removed and destroyed');

const privateSession = sessionFor('aegis-private-main');
privateSession.failStorageClear = true;
await manager.create({ tabId: 'tab-c', profileKind: 'private', profileId: 'main', url: 'https://video.example/private' });
let cleanupFailed = false;
try { await manager.close('tab-c'); } catch { cleanupFailed = true; }
ok(cleanupFailed, 'private close reports storage cleanup failures');
const beforeBlockedReuse = createdViews.length;
let reuseBlocked = false;
try { await manager.create({ tabId: 'tab-d', profileKind: 'private', profileId: 'main', url: 'https://video.example/private-again' }); } catch { reuseBlocked = true; }
ok(reuseBlocked && createdViews.length === beforeBlockedReuse, 'a private partition cannot be reused after incomplete cleanup');
