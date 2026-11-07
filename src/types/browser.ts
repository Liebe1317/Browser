export type BrowserPageType = 
  | 'newtab'
  | 'webpage'
  | 'search'
  | 'reader'
  | 'youtube'
  | 'security'
  | 'history'
  | 'bookmarks'
  | 'settings'
  | 'shields'
  | 'downloads';

export interface VaultState {
  isLocked: boolean;
  isSetUp: boolean;
  algorithm: 'AES-256-GCM';
  keyDerivation: 'PBKDF2-SHA256 (600,000 rounds)';
  storageEncrypted: boolean;
  lastEncryptedTimestamp: number;
}

export interface Tab {
  id: string;
  title: string;
  url: string;
  displayUrl: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  history: string[];
  historyIndex: number;
  isIncognito: boolean;
  isPinned: boolean;
  isMuted: boolean;
  mediaState?: 'playing' | 'paused';
  isAudible?: boolean;
  readerMode: boolean;
  zoomLevel: number;
  adsBlocked: number;
  trackersBlocked: number;
  popupsBlocked: number;
  blockedDomains: string[];
  securityStatus: 'secure' | 'warning' | 'insecure' | 'internal';
  pageType: BrowserPageType;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  category: string;
  dateAdded: number;
}

export interface HistoryItem {
  id: string;
  title: string;
  url: string;
  visitedAt: number;
  adsBlocked: number;
  trackersBlocked: number;
  isIncognito?: boolean;
}

export interface DownloadItem {
  id: string;
  filename: string;
  size: string;
  progress: number;
  status: 'completed' | 'downloading' | 'paused';
  sourceUrl: string;
  date: number;
}

export interface ShieldSettings {
  shieldsEnabled: boolean;
  blockAggressiveAds: boolean;
  blockTrackers: boolean;
  blockThirdPartyCookies: boolean;
  fingerprintProtection: boolean;
  upgradeHttps: boolean;
  preventWebRTCLeak: boolean;
  blockScripts: boolean;
  blockPopups: boolean;
}

export interface CustomColorTheme {
  id: string;
  name: string;
  primaryAccent: string; // e.g. #10b981
  browserBg: string; // e.g. #090d16
  browserSurface: string; // e.g. #0f172a
  browserNavbar: string; // e.g. #161f30
  browserBorder: string; // e.g. #1e293b
  textColor: string; // e.g. #f8fafc
  isCustom?: boolean;
}

export interface BrowserSettings {
  defaultSearchEngine: 'duckduckgo' | 'brave' | 'startpage' | 'qwant' | 'google' | 'bing' | 'ecosia';
  homePage: string;
  theme: 'dark' | 'light' | 'stealth' | 'custom';
  customColors?: CustomColorTheme;
  tabStyle: 'chrome' | 'rounded' | 'compact';
  uiDensity: 'comfortable' | 'standard' | 'compact';
  fontScale: number; // 90, 100, 110, 125
  showBookmarksBar: boolean;
  showEngineBadgeInOmnibox: boolean;
  showClockInNewTab: boolean;
  showShortcutsInNewTab: boolean;
  clearHistoryOnExit: boolean;
  language: 'ar' | 'en';
  doNotTrack: boolean;
  globalPrivacyControl: boolean;
  dnsOverHttps: boolean;
  searchMode: 'internal_results' | 'direct_engine';
  shieldSettings: ShieldSettings;
}

export type NetworkResourceType = 'document' | 'script' | 'xhr' | 'fetch' | 'image' | 'stylesheet' | 'iframe' | 'font' | 'media' | 'websocket' | 'other';

export interface NetworkRequestEvent {
  tabId: string;
  requestId: string;
  url: string;
  method: string;
  resourceType: string;
  phase: 'started' | 'completed' | 'failed' | 'blocked';
  statusCode?: number;
  duration?: number;
  error?: string;
  blockedReason?: string;
  responseHeaders?: Record<string, string>;
  timestamp: number;
}

export interface NetworkRequest {
  id: string;
  tabId?: string;
  url: string;
  domain: string;
  method?: string;
  type: NetworkResourceType;
  status: 'pending' | 'allowed' | 'blocked' | 'failed';
  statusCode?: number;
  error?: string;
  reason?: 'ad' | 'tracker' | 'fingerprinting' | 'insecure' | 'shield' | 'private-network' | 'vpn-disconnected';
  timestamp: number;
  duration?: number;
  responseHeaders?: Record<string, string>;
}
