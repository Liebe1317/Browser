import React, { useState, useEffect, useCallback } from 'react';
import { ChromeTabs } from './components/browser/ChromeTabs';
import { ChromeNavbar } from './components/browser/ChromeNavbar';
import { BookmarksBar } from './components/browser/BookmarksBar';
import { DevTools } from './components/browser/DevTools';
import { ClearDataModal } from './components/browser/ClearDataModal';
import { NewTabPage } from './components/views/NewTabPage';
import { SearchResultsView } from './components/views/SearchResultsView';
import { WebPageView } from './components/views/WebPageView';
import { ReaderView } from './components/views/ReaderView';
import { HistoryView } from './components/views/HistoryView';
import { BookmarksView } from './components/views/BookmarksView';
import { SettingsView } from './components/views/SettingsView';
import { ShieldStatsView } from './components/views/ShieldStatsView';
import { DownloadsView } from './components/views/DownloadsView';
import { YouTubeView } from './components/views/YouTubeView';
import { SecurityVaultView } from './components/views/SecurityVaultView';
import { VaultLockScreen } from './components/browser/VaultLockScreen';
import { isVaultSetUp, createVault, unlockVault, lockVault, saveVaultData, loadVaultData, destroyVault, UnlockResult } from './utils/vault';
import { LibiAssistant } from './components/browser/LibiAssistant';
import { LibiBrowserAction } from './types/libi';
import { getAegisCsrfToken } from './utils/sessionSecurity';

import { Tab, Bookmark, HistoryItem, DownloadItem, BrowserSettings, ShieldSettings, NetworkRequest, BrowserPageType, VaultState } from './types/browser';
import { DEFAULT_SETTINGS, DEFAULT_SHIELD_SETTINGS, DEFAULT_BOOKMARKS, SEARCH_ENGINES } from './data/initialData';
import { THEME_PRESETS, applyCustomTheme, getSavedTheme } from './utils/theme';

export default function App() {
  // Initial default tab
  const createDefaultTab = (isIncognito = false, initialUrl = 'chrome://newtab'): Tab => {
    const isInternal = initialUrl.startsWith('chrome://');
    let pageType: BrowserPageType = 'newtab';
    if (initialUrl === 'chrome://history') pageType = 'history';
    else if (initialUrl.startsWith('chrome://search')) pageType = 'search';
    else if (initialUrl === 'chrome://bookmarks') pageType = 'bookmarks';
    else if (initialUrl === 'chrome://settings') pageType = 'settings';
    else if (initialUrl === 'chrome://shields') pageType = 'shields';
    else if (initialUrl === 'chrome://downloads') pageType = 'downloads';
    else if (initialUrl === 'chrome://security' || initialUrl === 'chrome://vault') pageType = 'security';
    else if (initialUrl.includes('youtube.com') || initialUrl.includes('youtu.be')) pageType = 'youtube';
    else if (!isInternal) pageType = 'webpage';

    return {
      id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: isIncognito
        ? 'تصفح خفي جديد'
        : initialUrl === 'chrome://newtab'
        ? 'علامة تبويب جديدة'
        : initialUrl === 'chrome://security' || initialUrl === 'chrome://vault'
        ? 'مركز التشفير الفولاذي'
        : initialUrl.includes('youtube.com')
        ? 'YouTube'
        : initialUrl,
      url: initialUrl,
      displayUrl: initialUrl === 'chrome://newtab' ? '' : initialUrl,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      history: [initialUrl],
      historyIndex: 0,
      isIncognito,
      isPinned: false,
      isMuted: false,
      readerMode: false,
      zoomLevel: 100,
      adsBlocked: 0,
      trackersBlocked: 0,
      popupsBlocked: 0,
      blockedDomains: [],
      securityStatus: initialUrl.startsWith('https://') || isInternal ? 'secure' : 'warning',
      pageType,
    };
  };

  const [tabs, setTabs] = useState<Tab[]>(() => [createDefaultTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0]?.id || '');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => {
    try {
      if (isVaultSetUp()) return DEFAULT_BOOKMARKS;
      const saved = localStorage.getItem('aegis_bookmarks');
      return saved ? JSON.parse(saved) : DEFAULT_BOOKMARKS;
    } catch {
      return DEFAULT_BOOKMARKS;
    }
  });
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      if (isVaultSetUp()) return [];
      const savedSettings = localStorage.getItem('aegis_settings');
      if (savedSettings && JSON.parse(savedSettings).clearHistoryOnExit) {
        localStorage.removeItem('aegis_history'); // user asked for history to be erased between sessions
        return [];
      }
      const saved = localStorage.getItem('aegis_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  const [settings, setSettings] = useState<BrowserSettings>(() => {
    try {
      const saved = localStorage.getItem('aegis_settings');
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [shieldSettings, setShieldSettings] = useState<ShieldSettings>(() => {
    try {
      const saved = localStorage.getItem('aegis_shield_settings');
      return saved ? JSON.parse(saved) : DEFAULT_SHIELD_SETTINGS;
    } catch {
      return DEFAULT_SHIELD_SETTINGS;
    }
  });

  const [totalAdsBlocked, setTotalAdsBlocked] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('aegis_total_ads');
      return saved ? Number(saved) : 0;
    } catch {
      return 0;
    }
  });

  const [totalTrackersBlocked, setTotalTrackersBlocked] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('aegis_total_trackers');
      return saved ? Number(saved) : 0;
    } catch {
      return 0;
    }
  });

  const [vaultState, setVaultState] = useState<VaultState>(() => {
    const setUp = isVaultSetUp();
    return {
      isLocked: setUp, // an existing vault always starts locked
      isSetUp: setUp,
      algorithm: 'AES-256-GCM',
      keyDerivation: 'PBKDF2-SHA256 (600,000 rounds)',
      storageEncrypted: setUp,
      lastEncryptedTimestamp: Date.now(),
    };
  });

  const [showDevTools, setShowDevTools] = useState(false);
  const [showClearDataModal, setShowClearDataModal] = useState(false);
  const [showLibi, setShowLibi] = useState(false);
  const [libiContextQuery, setLibiContextQuery] = useState<string | undefined>(undefined);
  const [networkRequests, setNetworkRequests] = useState<NetworkRequest[]>([]);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [pageTexts, setPageTexts] = useState<Record<string, string>>({});
  const [pageScrollCommand, setPageScrollCommand] = useState<{ id: number; direction: 'top' | 'bottom' } | null>(null);
  const handlePageText = useCallback((id: string, text: string) => {
    setPageTexts((previous) => ({ ...previous, [id]: text.slice(0, 12000) }));
  }, []);

  // Persist state
  useEffect(() => {
    try {
      // With an active vault, bookmarks/history are stored encrypted (see effect below), never in plain text.
      if (!vaultState.isSetUp) {
        localStorage.setItem('aegis_bookmarks', JSON.stringify(bookmarks));
        localStorage.setItem('aegis_history', JSON.stringify(history));
      }
      localStorage.setItem('aegis_settings', JSON.stringify(settings));
      localStorage.setItem('aegis_shield_settings', JSON.stringify(shieldSettings));
      localStorage.setItem('aegis_total_ads', String(totalAdsBlocked));
      localStorage.setItem('aegis_total_trackers', String(totalTrackersBlocked));
    } catch (e) {
      console.warn('Storage error:', e);
    }
  }, [bookmarks, history, settings, shieldSettings, totalAdsBlocked, totalTrackersBlocked, vaultState.isSetUp]);

  // Encrypted persistence. Skipped while locked so empty placeholder state can never overwrite stored data.
  useEffect(() => {
    if (!vaultState.isSetUp || vaultState.isLocked) return;
    saveVaultData(JSON.stringify({ bookmarks, history }));
  }, [bookmarks, history, vaultState.isSetUp, vaultState.isLocked]);

  // Sync dark class on HTML root
  useEffect(() => {
    if (settings.theme === 'dark' || settings.theme === 'stealth') {
      document.documentElement.classList.add('dark');
    } else if (settings.theme === 'light') {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  // Apply custom theme CSS variables to document
  useEffect(() => {
    const themeToApply = settings.customColors || getSavedTheme();
    applyCustomTheme(themeToApply);
  }, [settings.customColors]);

  // Get active tab
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0] || createDefaultTab();

  // Vault & Cryptographic Handlers
  const handleLockVault = () => {
    if (!vaultState.isSetUp) return; // nothing to unlock with yet
    lockVault();
    fetch('/api/session/clear', { method: 'POST' }).catch(() => {}); // log out of proxied sites too
    // Clear decrypted data and open pages from memory while locked
    setBookmarks(DEFAULT_BOOKMARKS);
    setHistory([]);
    setNetworkRequests([]);
    const freshTab = createDefaultTab(true, 'chrome://newtab');
    setTabs([freshTab]);
    setActiveTabId(freshTab.id);
    setVaultState((prev) => ({ ...prev, isLocked: true }));
  };

  const handleUnlockVault = async (passphrase: string): Promise<UnlockResult> => {
    const result = await unlockVault(passphrase);
    if (!result.ok) return result;
    try {
      const raw = await loadVaultData();
      if (raw) {
        const data = JSON.parse(raw) as { bookmarks?: Bookmark[]; history?: HistoryItem[] };
        setBookmarks(data.bookmarks ?? DEFAULT_BOOKMARKS);
        setHistory(settings.clearHistoryOnExit ? [] : data.history ?? []);
      }
    } catch (e) {
      // Never continue with defaults: the next save would overwrite the real (unreadable) data.
      console.warn('Vault data could not be read:', e);
      lockVault();
      return { ok: false, reason: 'corrupt' };
    }
    setVaultState((prev) => ({ ...prev, isLocked: false, lastEncryptedTimestamp: Date.now() }));
    return result;
  };

  const handleCreateVault = async (passphrase: string) => {
    await createVault(passphrase, JSON.stringify({ bookmarks, history }));
    try {
      localStorage.removeItem('aegis_bookmarks');
      localStorage.removeItem('aegis_history');
    } catch {}
    setVaultState((prev) => ({ ...prev, isSetUp: true, storageEncrypted: true, lastEncryptedTimestamp: Date.now() }));
  };

  const handleEmergencyPurge = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    setHistory([]);
    setBookmarks(DEFAULT_BOOKMARKS);
    setNetworkRequests([]);
    const freshTab = createDefaultTab(true, 'chrome://newtab');
    setTabs([freshTab]);
    setActiveTabId(freshTab.id);
    fetch('/api/session/clear', { method: 'POST' }).catch(() => {});
    destroyVault();
    setVaultState((prev) => ({ ...prev, isLocked: false, isSetUp: false, storageEncrypted: false, lastEncryptedTimestamp: Date.now() }));
  };

  // Tab Operations
  const handleSelectTab = (id: string) => {
    setActiveTabId(id);
  };

  const handleNewTab = (isIncognito = false, targetUrl = 'chrome://newtab') => {
    const newTab = createDefaultTab(isIncognito, targetUrl);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleCloseTab = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPageTexts((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    const closingTab = tabs.find((tab) => tab.id === id);
    if (closingTab?.isIncognito) {
      void (async () => {
        try {
          const csrfToken = await getAegisCsrfToken();
          await fetch('/api/session/context/close', {
            method: 'POST',
            credentials: 'same-origin',
            keepalive: true,
            headers: { 'Content-Type': 'application/json', 'X-Aegis-CSRF': csrfToken },
            body: JSON.stringify({ contextId: `private-${closingTab.id}` }),
          });
        } catch {
          // The browser tab is closed immediately; the server also expires abandoned sessions.
        }
      })();
    }
    if (tabs.length === 1) {
      // If closing last tab, reset to a fresh new tab
      const freshTab = createDefaultTab(activeTab.isIncognito);
      setTabs([freshTab]);
      setActiveTabId(freshTab.id);
      return;
    }

    const index = tabs.findIndex((t) => t.id === id);
    const newTabs = tabs.filter((t) => t.id !== id);
    setTabs(newTabs);

    if (activeTabId === id) {
      const nextTab = newTabs[Math.max(0, index - 1)];
      setActiveTabId(nextTab.id);
    }
  };

  const handleUpdateTab = (id: string, updates: Partial<Tab>) => {
    const existingTab = tabs.find((tab) => tab.id === id);
    if (existingTab && typeof updates.url === 'string' && updates.url !== existingTab.url) {
      setPageTexts((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
    }
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  };

  // Record a simulated or real network request for DevTools
  const handleRecordRequest = (domain: string, status: 'allowed' | 'blocked', reason?: 'ad' | 'tracker') => {
    const newReq: NetworkRequest = {
      id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      url: `https://${domain}/resource`,
      domain,
      type: 'script',
      status,
      reason,
      timestamp: Date.now(),
      size: `${Math.floor(Math.random() * 80 + 10)} KB`,
      duration: Math.floor(Math.random() * 50 + 5),
    };

    setNetworkRequests((prev) => [newReq, ...prev.slice(0, 49)]);

    if (status === 'blocked') {
      if (reason === 'ad') setTotalAdsBlocked((c) => c + 1);
      if (reason === 'tracker') setTotalTrackersBlocked((c) => c + 1);
    }
  };

  // Central Navigation
  const handleNavigate = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    let targetUrl = trimmed;
    let pageType: BrowserPageType = 'webpage';

    // Internal pages & YouTube Privacy mode & Security Fortress
    if (trimmed.startsWith('chrome://')) {
      if (trimmed === 'chrome://newtab') pageType = 'newtab';
      else if (trimmed.startsWith('chrome://search')) {
        let q = '';
        try {
          const u = new URL(trimmed.replace('chrome://search', 'https://search.internal'));
          q = u.searchParams.get('q') || '';
        } catch {}
        targetUrl = `https://www.google.com/search?q=${encodeURIComponent(q || '')}`;
        pageType = 'webpage';
      }
      else if (trimmed === 'chrome://history') pageType = 'history';
      else if (trimmed === 'chrome://bookmarks') pageType = 'bookmarks';
      else if (trimmed === 'chrome://settings') pageType = 'settings';
      else if (trimmed === 'chrome://shields') pageType = 'shields';
      else if (trimmed === 'chrome://downloads') pageType = 'downloads';
      else if (trimmed === 'chrome://security' || trimmed === 'chrome://vault') pageType = 'security';
      else if (trimmed === 'chrome://youtube') pageType = 'youtube';
    } else if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
      targetUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      pageType = 'youtube';
    } else if (trimmed.includes('google.com/search') || trimmed.includes('google.com/?q=')) {
      targetUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      pageType = 'webpage';
    } else if (trimmed === 'google.com' || trimmed === 'https://google.com' || trimmed === 'https://www.google.com' || trimmed === 'www.google.com') {
      targetUrl = 'https://www.google.com';
      pageType = 'webpage';
    } else if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      (trimmed.includes('.') && !trimmed.includes(' ') && trimmed.length >= 3)
    ) {
      // Direct Website URL (witanime.site, bbc.com, reddit.com, wikipedia.org, etc.)
      targetUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      pageType = 'webpage';
    } else {
      // General web search query -> DIRECT Google Search with Aegis privacy protection!
      targetUrl = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
      pageType = 'webpage';
    }

    const newHistory = [...activeTab.history.slice(0, activeTab.historyIndex + 1), targetUrl];
    const newHistoryIndex = newHistory.length - 1;

    handleUpdateTab(activeTab.id, {
      url: targetUrl,
      displayUrl: pageType === 'newtab' ? '' : targetUrl,
      title: pageType === 'newtab'
        ? 'علامة تبويب جديدة'
        : targetUrl.includes('google.com/search')
        ? `${trimmed} - بحث Google`
        : targetUrl,
      pageType,
      readerMode: false,
      history: newHistory,
      historyIndex: newHistoryIndex,
      canGoBack: newHistoryIndex > 0,
      canGoForward: false,
      isLoading: pageType === 'webpage',
      securityStatus: targetUrl.startsWith('https://') || pageType !== 'webpage' ? 'secure' : 'warning',
    });

    // Add to history if not incognito and not newtab
    if (!activeTab.isIncognito && pageType !== 'newtab') {
      const historyItem: HistoryItem = {
        id: `hist-${Date.now()}`,
        title: targetUrl,
        url: targetUrl,
        visitedAt: Date.now(),
        adsBlocked: 2,
        trackersBlocked: 3,
      };
      setHistory((prev) => [historyItem, ...prev.slice(0, 199)]);
    }
  };

  const handleGoBack = () => {
    if (activeTab.historyIndex > 0) {
      const newIndex = activeTab.historyIndex - 1;
      const targetUrl = activeTab.history[newIndex];
      let pageType: BrowserPageType = 'webpage';
      if (targetUrl.startsWith('chrome://newtab')) pageType = 'newtab';
      else if (targetUrl.startsWith('chrome://search')) pageType = 'search';
      else if (targetUrl.startsWith('chrome://history')) pageType = 'history';
      else if (targetUrl.startsWith('chrome://bookmarks')) pageType = 'bookmarks';
      else if (targetUrl.startsWith('chrome://settings')) pageType = 'settings';
      else if (targetUrl.startsWith('chrome://shields')) pageType = 'shields';
      else if (targetUrl.startsWith('chrome://downloads')) pageType = 'downloads';

      handleUpdateTab(activeTab.id, {
        url: targetUrl,
        displayUrl: pageType === 'newtab' ? '' : targetUrl,
        historyIndex: newIndex,
        pageType,
        canGoBack: newIndex > 0,
        canGoForward: true,
      });
    }
  };

  const handleGoForward = () => {
    if (activeTab.historyIndex < activeTab.history.length - 1) {
      const newIndex = activeTab.historyIndex + 1;
      const targetUrl = activeTab.history[newIndex];
      let pageType: BrowserPageType = 'webpage';
      if (targetUrl.startsWith('chrome://newtab')) pageType = 'newtab';
      else if (targetUrl.startsWith('chrome://search')) pageType = 'search';
      else if (targetUrl.startsWith('chrome://history')) pageType = 'history';
      else if (targetUrl.startsWith('chrome://bookmarks')) pageType = 'bookmarks';
      else if (targetUrl.startsWith('chrome://settings')) pageType = 'settings';
      else if (targetUrl.startsWith('chrome://shields')) pageType = 'shields';
      else if (targetUrl.startsWith('chrome://downloads')) pageType = 'downloads';

      handleUpdateTab(activeTab.id, {
        url: targetUrl,
        displayUrl: pageType === 'newtab' ? '' : targetUrl,
        historyIndex: newIndex,
        pageType,
        canGoBack: true,
        canGoForward: newIndex < activeTab.history.length - 1,
      });
    }
  };

  const handleReload = () => {
    setPageTexts((previous) => {
      const next = { ...previous };
      delete next[activeTab.id];
      return next;
    });
    setReloadNonce((value) => value + 1);
    handleUpdateTab(activeTab.id, { isLoading: true });
  };

  // Libi can request only allowlisted UI actions; each request is confirmed inside its panel.
  const handleLibiBrowserAction = (action: LibiBrowserAction) => {
    switch (action.type) {
      case 'navigate': handleNavigate(action.url); break;
      case 'new_tab': handleNewTab(); break;
      case 'back': handleGoBack(); break;
      case 'forward': handleGoForward(); break;
      case 'reload': handleReload(); break;
      case 'open_settings': handleNavigate('chrome://settings'); break;
      case 'open_history': handleNavigate('chrome://history'); break;
      case 'open_bookmarks': handleNavigate('chrome://bookmarks'); break;
      case 'open_downloads': handleNavigate('chrome://downloads'); break;
      case 'open_security': handleNavigate('chrome://security'); break;
      case 'open_shields': handleNavigate('chrome://shields'); break;
      case 'toggle_theme':
        setSettings((current) => ({ ...current, theme: current.theme === 'light' ? 'dark' : 'light' }));
        break;
      case 'toggle_reader': handleToggleReaderMode(); break;
      case 'bookmark_page': handleToggleBookmark(); break;
      case 'zoom_in': handleZoomIn(); break;
      case 'zoom_out': handleZoomOut(); break;
      case 'zoom_reset': handleZoomReset(); break;
      case 'scroll_top':
        setPageScrollCommand((current) => ({ id: (current?.id ?? 0) + 1, direction: 'top' }));
        break;
      case 'scroll_bottom':
        setPageScrollCommand((current) => ({ id: (current?.id ?? 0) + 1, direction: 'bottom' }));
        break;
    }
  };

  useEffect(() => {
    setPageScrollCommand(null);
    setPageTexts((previous) => previous[activeTabId] ? { [activeTabId]: previous[activeTabId] } : {});
  }, [activeTabId]);

  const handleGoHome = () => {
    handleNavigate(settings.homePage || 'chrome://newtab');
  };

  const handleToggleBookmark = () => {
    const isBookmarked = bookmarks.some((b) => b.url === activeTab.url);
    if (isBookmarked) {
      setBookmarks((prev) => prev.filter((b) => b.url !== activeTab.url));
    } else {
      const newBm: Bookmark = {
        id: `bm-${Date.now()}`,
        title: activeTab.title,
        url: activeTab.url,
        category: 'عام',
        dateAdded: Date.now(),
      };
      setBookmarks((prev) => [newBm, ...prev]);
    }
  };

  const handleToggleReaderMode = () => {
    handleUpdateTab(activeTab.id, {
      readerMode: !activeTab.readerMode,
    });
  };

  const handleOpenReader = (url: string) => {
    handleUpdateTab(activeTab.id, {
      url,
      readerMode: true,
    });
  };

  // Zoom controls
  const handleZoomIn = () => {
    handleUpdateTab(activeTab.id, {
      zoomLevel: Math.min(200, activeTab.zoomLevel + 10),
    });
  };

  const handleZoomOut = () => {
    handleUpdateTab(activeTab.id, {
      zoomLevel: Math.max(50, activeTab.zoomLevel - 10),
    });
  };

  const handleZoomReset = () => {
    handleUpdateTab(activeTab.id, { zoomLevel: 100 });
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        handleNewTab(e.shiftKey);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        handleCloseTab(activeTabId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        handleNavigate('chrome://history');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSettings((s) => ({ ...s, showBookmarksBar: !s.showBookmarksBar }));
      } else if (e.key === 'F12') {
        e.preventDefault();
        setShowDevTools((v) => !v);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId]);

  // Clear Browsing Data
  const handleClearData = (options: {
    history: boolean;
    cookies: boolean;
    cache: boolean;
    timeRange: string;
  }) => {
    if (options.history) setHistory([]);
    if (options.cache || options.cookies) {
      setNetworkRequests([]);
    }
    // Really clears the logins/cookies the proxy keeps for this session
    if (options.cookies) {
      fetch('/api/session/clear', { method: 'POST' }).catch(() => {});
    }
  };

  // Bookmark check
  const isCurrentTabBookmarked = bookmarks.some((b) => b.url === activeTab.url);

  // Parse search query if pageType === 'search'
  const getSearchQuery = () => {
    if (activeTab.url.includes('q=')) {
      try {
        const urlObj = new URL(activeTab.url.replace('chrome://search', 'https://search.internal'));
        return decodeURIComponent(urlObj.searchParams.get('q') || '');
      } catch {
        return activeTab.displayUrl;
      }
    }
    return activeTab.displayUrl;
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100 selection:bg-emerald-500/30 selection:text-white">
      {/* 1. Chrome Tab Strip (Tabs & New Tab button) */}
      <ChromeTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={(incognito) => handleNewTab(incognito)}
        isIncognitoMode={activeTab.isIncognito}
        tabStyle={settings.tabStyle || 'chrome'}
      />

      {/* 2. Chrome Navbar (Back/Forward, Omnibox, Shield Button, Extensions, Kebab Menu) */}
      <ChromeNavbar
        currentTab={activeTab}
        canGoBack={activeTab.canGoBack}
        canGoForward={activeTab.canGoForward}
        isBookmarked={isCurrentTabBookmarked}
        onNavigate={handleNavigate}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onReload={handleReload}
        onGoHome={handleGoHome}
        onToggleBookmark={handleToggleBookmark}
        onToggleReaderMode={handleToggleReaderMode}
        onOpenShieldDashboard={() => handleNavigate('chrome://shields')}
        onOpenSecurityVault={() => handleNavigate('chrome://security')}
        onNewTab={handleNewTab}
        onOpenHistory={() => handleNavigate('chrome://history')}
        onOpenBookmarks={() => handleNavigate('chrome://bookmarks')}
        onOpenDownloads={() => handleNavigate('chrome://downloads')}
        onOpenSettings={() => handleNavigate('chrome://settings')}
        onOpenClearData={() => setShowClearDataModal(true)}
        onToggleDevTools={() => setShowDevTools(!showDevTools)}
        shieldSettings={shieldSettings}
        onUpdateShieldSettings={setShieldSettings}
        onClearSiteData={() => {
          handleUpdateTab(activeTab.id, { adsBlocked: 0, trackersBlocked: 0 });
        }}
        zoomLevel={activeTab.zoomLevel}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        theme={settings.theme}
        onToggleTheme={() => {
          setSettings((s) => ({
            ...s,
            theme: s.theme === 'dark' ? 'light' : 'dark',
          }));
        }}
        defaultSearchEngine={settings.defaultSearchEngine}
        onChangeSearchEngine={(engine) =>
          setSettings((s) => ({ ...s, defaultSearchEngine: engine }))
        }
        showEngineBadge={settings.showEngineBadgeInOmnibox ?? true}
        uiDensity={settings.uiDensity || 'standard'}
        onToggleLibi={() => setShowLibi(!showLibi)}
        isLibiOpen={showLibi}
      />

      {/* 3. Bookmarks Bar (Quick Access Folders & Links) */}
      {settings.showBookmarksBar && (
        <BookmarksBar
          bookmarks={bookmarks}
          onNavigate={handleNavigate}
          onOpenBookmarksManager={() => handleNavigate('chrome://bookmarks')}
        />
      )}

      {/* 4. Active Tab Main Viewport Area */}
      <main className="flex-1 overflow-auto relative bg-slate-900">
        {/* Render Reader Mode if active */}
        {activeTab.readerMode ? (
          <ReaderView
            url={activeTab.url}
            onCloseReader={() => handleUpdateTab(activeTab.id, { readerMode: false })}
            onNavigate={handleNavigate}
          />
        ) : activeTab.pageType === 'newtab' ? (
          <NewTabPage
            isIncognito={activeTab.isIncognito}
            onNavigate={handleNavigate}
            totalAdsBlocked={totalAdsBlocked}
            totalTrackersBlocked={totalTrackersBlocked}
            searchEngine={settings.defaultSearchEngine}
            onChangeSearchEngine={(engine) =>
              setSettings((s) => ({ ...s, defaultSearchEngine: engine }))
            }
            onOpenShieldDashboard={() => handleNavigate('chrome://shields')}
          />
        ) : activeTab.pageType === 'search' ? (
          <SearchResultsView
            query={getSearchQuery()}
            onNavigate={handleNavigate}
            onOpenReader={handleOpenReader}
            searchEngine={settings.defaultSearchEngine}
            onChangeSearchEngine={(engine) =>
              setSettings((s) => ({ ...s, defaultSearchEngine: engine }))
            }
            onOpenLibi={(q) => {
              setLibiContextQuery(q);
              setShowLibi(true);
            }}
            onAddBlockedCount={(ads, trackers, domain) => {
              setTotalAdsBlocked((c) => c + ads);
              setTotalTrackersBlocked((c) => c + trackers);
              handleRecordRequest(domain, 'blocked', 'tracker');
            }}
          />
        ) : activeTab.pageType === 'youtube' ? (
          <YouTubeView
            initialVideoId={
              activeTab.url.includes('watch?v=')
                ? activeTab.url.split('watch?v=')[1]?.split('&')[0]
                : activeTab.url.includes('youtu.be/')
                ? activeTab.url.split('youtu.be/')[1]?.split('?')[0]
                : undefined
            }
            onNavigate={handleNavigate}
            onAddBlockedCount={(ads, trackers, domain) => {
              setTotalAdsBlocked((c) => c + ads);
              setTotalTrackersBlocked((c) => c + trackers);
              handleRecordRequest(domain, 'blocked', 'ad');
            }}
          />
        ) : activeTab.pageType === 'webpage' ? (
          <WebPageView
            key={`${activeTab.id}-${reloadNonce}`}
            tab={activeTab}
            shieldSettings={shieldSettings}
            sendDoNotTrack={settings.doNotTrack}
            onUpdateTabInfo={handleUpdateTab}
            onNavigate={handleNavigate}
            onOpenReader={handleOpenReader}
            onRecordRequest={handleRecordRequest}
            onPageText={handlePageText}
            pageScrollCommand={pageScrollCommand}
            requestPageText={showLibi}
          />
        ) : activeTab.pageType === 'history' ? (
          <HistoryView
            history={history}
            onNavigate={handleNavigate}
            onDeleteItem={(id) => setHistory((prev) => prev.filter((h) => h.id !== id))}
            onClearAll={() => setHistory([])}
          />
        ) : activeTab.pageType === 'bookmarks' ? (
          <BookmarksView
            bookmarks={bookmarks}
            onNavigate={handleNavigate}
            onAddBookmark={(title, url, category) => {
              const newBm: Bookmark = {
                id: `bm-${Date.now()}`,
                title,
                url,
                category,
                dateAdded: Date.now(),
              };
              setBookmarks((prev) => [newBm, ...prev]);
            }}
            onDeleteBookmark={(id) => setBookmarks((prev) => prev.filter((b) => b.id !== id))}
          />
        ) : activeTab.pageType === 'downloads' ? (
          <DownloadsView
            downloads={downloads}
            onClearDownloads={() => setDownloads([])}
          />
        ) : activeTab.pageType === 'shields' ? (
          <ShieldStatsView
            totalAdsBlocked={totalAdsBlocked}
            totalTrackersBlocked={totalTrackersBlocked}
            shieldSettings={shieldSettings}
            onUpdateShieldSettings={setShieldSettings}
            onResetStats={() => {
              setTotalAdsBlocked(0);
              setTotalTrackersBlocked(0);
            }}
          />
        ) : activeTab.pageType === 'settings' ? (
          <SettingsView
            settings={settings}
            onUpdateSettings={setSettings}
            onOpenClearData={() => setShowClearDataModal(true)}
          />
        ) : activeTab.pageType === 'security' ? (
          <SecurityVaultView
            vaultState={vaultState}
            onLockVault={handleLockVault}
            onEmergencyPurge={handleEmergencyPurge}
            onCreateVault={handleCreateVault}
            shieldSettings={shieldSettings}
            sendDoNotTrack={settings.doNotTrack}
          />
        ) : null}
      </main>

      {/* 5. Bottom DevTools Drawer (F12) */}
      {showDevTools && (
        <DevTools
          currentUrl={activeTab.url}
          networkRequests={networkRequests}
          onClose={() => setShowDevTools(false)}
          onClearLogs={() => setNetworkRequests([])}
        />
      )}

      {/* 6. Clear Browsing Data Modal */}
      {showClearDataModal && (
        <ClearDataModal
          onClear={handleClearData}
          onClose={() => setShowClearDataModal(false)}
        />
      )}

      {/* 7. Master Cryptographic Vault Lock Screen */}
      {vaultState.isLocked && (
        <VaultLockScreen onUnlock={handleUnlockVault} />
      )}

      {/* 8. Floating Libi AI Assistant Button (Bottom Left) */}
      {!showLibi && !vaultState.isLocked && (
        <button
          type="button"
          onClick={() => setShowLibi(true)}
          className="fixed bottom-5 left-5 z-40 flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-slate-900/95 hover:bg-slate-800 text-white border-2 border-indigo-500/60 shadow-[0_4px_24px_rgba(99,102,241,0.4)] transition-all hover:scale-105 group backdrop-blur-md cursor-pointer"
          title="ليبي (Libi) - مساعد الخصوصية والذكاء الاصطناعي 🇵🇸"
          dir="rtl"
        >
          <div className="relative w-8 h-8 rounded-full overflow-hidden border border-indigo-400 shrink-0 shadow-sm">
            <img src="/assets/libi.png" alt="ليبي" className="w-full h-full object-cover" />
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400" />
          </div>
          <div className="flex flex-col text-right leading-none pr-0.5">
            <span className="text-xs font-bold text-indigo-300 flex items-center gap-1">
              <span>ليبي</span>
              <span className="text-[10px]">🇵🇸</span>
            </span>
            <span className="text-[10px] text-slate-400 group-hover:text-slate-200 transition-colors">مساعدك الخاص</span>
          </div>
        </button>
      )}

      {/* 9. Libi AI Privacy Assistant Drawer */}
      <LibiAssistant
        isOpen={showLibi}
        onClose={() => {
          setShowLibi(false);
          setLibiContextQuery(undefined);
          setPageTexts({});
        }}
        currentPageContext={{
          title: activeTab.title,
          url: activeTab.url,
          tabId: activeTab.id,
          text: pageTexts[activeTab.id] || '',
        }}
        initialQuery={libiContextQuery}
        onNavigate={handleNavigate}
        onExecuteBrowserAction={handleLibiBrowserAction}
      />
    </div>
  );
}
