import React, { useState, useEffect, useRef } from 'react';
import { encodeShieldFlags } from '../../utils/shieldFlags';
import { BookOpen } from 'lucide-react';
import { Tab, ShieldSettings } from '../../types/browser';

interface WebPageViewProps {
  tab: Tab;
  shieldSettings: ShieldSettings;
  sendDoNotTrack: boolean;
  onUpdateTabInfo: (id: string, updates: Partial<Tab>) => void;
  onNavigate: (url: string) => void;
  onOpenReader: (url: string) => void;
  onRecordRequest: (domain: string, status: 'allowed' | 'blocked', reason?: 'ad' | 'tracker') => void;
  onPageText?: (id: string, text: string) => void;
  pageScrollCommand?: { id: number; direction: 'top' | 'bottom' } | null;
  requestPageText?: boolean;
  reloadNonce?: number;
  occluded?: boolean;
}

export const WebPageView: React.FC<WebPageViewProps> = ({
  tab,
  shieldSettings,
  sendDoNotTrack,
  onUpdateTabInfo,
  onNavigate,
  onOpenReader,
  onRecordRequest,
  onPageText,
  pageScrollCommand,
  requestPageText = false,
  reloadNonce = 0,
  occluded = false,
}) => {
  const nativeBrowser = window.aegisDesktop?.browser;
  const nativeViewportRef = useRef<HTMLDivElement>(null);
  const [loadProgress, setLoadProgress] = useState(25);
  const [isIframeLoading, setIsIframeLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [nativeReady, setNativeReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const tabRef = useRef(tab);
  const updateTabRef = useRef(onUpdateTabInfo);
  const navigateRef = useRef(onNavigate);
  const openReaderRef = useRef(onOpenReader);
  const lastNativeUrlRef = useRef(tab.url);
  const lastReloadNonceRef = useRef(reloadNonce);
  const occludedRef = useRef(occluded);

  tabRef.current = tab;
  occludedRef.current = occluded;
  updateTabRef.current = onUpdateTabInfo;
  navigateRef.current = onNavigate;
  openReaderRef.current = onOpenReader;

  // Electron desktop: create one isolated Chromium view per tab. Web-only builds retain
  // the compatibility iframe and its existing same-origin proxy boundary.
  useEffect(() => {
    if (!nativeBrowser) return;
    let mounted = true;
    setNativeReady(false);
    setHasLoadError(false);
    setIsIframeLoading(true);
    const unsubscribe = nativeBrowser.onSiteViewEvent((event) => {
      if (!mounted || event.tabId !== tab.id) return;
      if (event.type === 'loading') {
        const loading = event.isLoading === true;
        setIsIframeLoading(loading);
        setLoadProgress(loading ? 30 : 100);
        updateTabRef.current(tab.id, { isLoading: loading });
        return;
      }
      if (event.type === 'media-state') {
        if (event.state === 'playing' || event.state === 'paused') updateTabRef.current(tab.id, { mediaState: event.state });
        return;
      }
      if (event.type === 'audio-state') {
        updateTabRef.current(tab.id, { isAudible: event.audible === true });
        return;
      }
      if (event.type === 'title') {
        if (event.title) updateTabRef.current(tab.id, { title: event.title.slice(0, 200) });
        return;
      }
      if (event.type === 'navigation' && event.url) {
        const current = tabRef.current;
        let history = current.history;
        let historyIndex = current.historyIndex;
        if (event.url !== current.url) {
          const priorIndex = history.lastIndexOf(event.url);
          if (priorIndex >= 0 && priorIndex < historyIndex) {
            historyIndex = priorIndex;
          } else {
            history = [...history.slice(0, historyIndex + 1), event.url];
            historyIndex = history.length - 1;
          }
        }
        lastNativeUrlRef.current = event.url;
        setHasLoadError(false);
        updateTabRef.current(tab.id, {
          url: event.url,
          displayUrl: event.url,
          history,
          historyIndex,
          canGoBack: event.canGoBack ?? historyIndex > 0,
          canGoForward: event.canGoForward ?? false,
          isLoading: false,
          mediaState: 'paused',
          isAudible: false,
        });
        return;
      }
      if (event.type === 'error' || event.type === 'process-gone') {
        setHasLoadError(true);
        setIsIframeLoading(false);
        updateTabRef.current(tab.id, { isLoading: false });
        void nativeBrowser.setSiteViewVisible(tab.id, false);
      }
    });

    const initialUrl = tabRef.current.url;
    lastNativeUrlRef.current = initialUrl;
    void nativeBrowser.createSiteView({
      tabId: tab.id,
      profileKind: tab.isIncognito ? 'private' : 'regular',
      profileId: 'main',
      url: initialUrl,
    }).then((result) => {
      if (!mounted) {
        if (result.ok) void nativeBrowser.setSiteViewVisible(tab.id, false);
        return;
      }
      if (!result.ok) {
        setHasLoadError(true);
        setIsIframeLoading(false);
        updateTabRef.current(tab.id, { isLoading: false });
        return;
      }
      setNativeReady(true);
      void nativeBrowser.setSiteViewVisible(tab.id, !occludedRef.current);
    }).catch(() => {
      if (!mounted) return;
      setHasLoadError(true);
      setIsIframeLoading(false);
      updateTabRef.current(tab.id, { isLoading: false });
    });

    return () => {
      mounted = false;
      unsubscribe();
      void nativeBrowser.setSiteViewVisible(tab.id, false);
    };
  }, [nativeBrowser, tab.id, tab.isIncognito]);

  // Keep the native Chromium child view aligned with the visible React viewport.
  useEffect(() => {
    if (!nativeBrowser || !nativeReady) return;
    if (occluded) {
      void nativeBrowser.setSiteViewVisible(tab.id, false);
      return;
    }
    if (!nativeViewportRef.current) return;
    const element = nativeViewportRef.current;
    const updateBounds = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 3) {
        void nativeBrowser.setSiteViewVisible(tab.id, false);
        return;
      }
      void nativeBrowser.setSiteViewBounds(tab.id, {
        x: rect.left,
        y: rect.top + 2,
        width: rect.width,
        height: rect.height - 2,
      });
      void nativeBrowser.setSiteViewVisible(tab.id, true);
    };
    const observer = new ResizeObserver(updateBounds);
    observer.observe(element);
    window.addEventListener('resize', updateBounds);
    window.addEventListener('scroll', updateBounds, true);
    updateBounds();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateBounds);
      window.removeEventListener('scroll', updateBounds, true);
    };
  }, [nativeBrowser, nativeReady, tab.id, occluded]);

  // App-driven address-bar navigation is routed through the main-process owner.
  useEffect(() => {
    if (!nativeBrowser || !nativeReady || tab.url === lastNativeUrlRef.current) return;
    lastNativeUrlRef.current = tab.url;
    setHasLoadError(false);
    setIsIframeLoading(true);
    void nativeBrowser.navigateSiteView(tab.id, tab.url).then((result) => {
      if (!result.ok) {
        setHasLoadError(true);
        setIsIframeLoading(false);
        updateTabRef.current(tab.id, { isLoading: false });
      }
    });
  }, [nativeBrowser, nativeReady, tab.id, tab.url]);

  useEffect(() => {
    if (!nativeBrowser || !nativeReady) return;
    void nativeBrowser.setSiteViewZoom(tab.id, tab.zoomLevel);
  }, [nativeBrowser, nativeReady, tab.id, tab.zoomLevel]);

  useEffect(() => {
    if (!nativeBrowser || !nativeReady) return;
    if (reloadNonce !== lastReloadNonceRef.current) {
      lastReloadNonceRef.current = reloadNonce;
      setHasLoadError(false);
      setIsIframeLoading(true);
      void nativeBrowser.reloadSiteView(tab.id);
    }
  }, [nativeBrowser, nativeReady, tab.id, reloadNonce]);

  // Web-only compatibility mode. It is intentionally not used by Electron desktop views.
  const browsingContext = tab.isIncognito ? `private-${tab.id}` : 'regular';
  const proxyUrl = `/api/proxy?ctx=${encodeURIComponent(browsingContext)}&url=${encodeURIComponent(tab.url)}&s=${encodeShieldFlags(shieldSettings, sendDoNotTrack)}`;

  useEffect(() => {
    if (nativeBrowser) return;
    setIsIframeLoading(true);
    setHasLoadError(false);
    setLoadProgress(30);
    const timer1 = setTimeout(() => setLoadProgress(65), 350);
    const timer2 = setTimeout(() => setLoadProgress(88), 700);
    const fallbackTimer = setTimeout(() => {
      setLoadProgress(100);
      setIsIframeLoading(false);
    }, 4000);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(fallbackTimer);
    };
  }, [tab.url, nativeBrowser]);

  useEffect(() => {
    if (nativeBrowser) return;
    const handleMessage = (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      if (!event.data || typeof event.data !== 'object') return;

      if (event.data.type === 'AEGIS_PROXY_ERROR' && event.data.code === 'capability-expired') {
        setHasLoadError(true);
        setIsIframeLoading(false);
        updateTabRef.current(tab.id, { isLoading: false });
        return;
      }

      if (requestPageText && event.data.type === 'AEGIS_PAGE_CONTENT') {
        const pageText = typeof event.data.text === 'string' ? event.data.text.slice(0, 12000) : '';
        onPageText?.(tab.id, pageText);
      }

      if (event.data.type === 'AEGIS_PAGE_LOADED') {
        setLoadProgress(100);
        setIsIframeLoading(false);
        const clampCount = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1000, Number(v))) : 0);
        const adsBlocked = clampCount(event.data.adsBlocked);
        const trackersBlocked = clampCount(event.data.trackersBlocked);
        updateTabRef.current(tab.id, {
          title: typeof event.data.title === 'string' && event.data.title ? event.data.title.slice(0, 200) : tabRef.current.title,
          adsBlocked: tabRef.current.adsBlocked + adsBlocked,
          trackersBlocked: tabRef.current.trackersBlocked + trackersBlocked,
          isLoading: false,
        });
        if (adsBlocked > 0) onRecordRequest('googleads.g.doubleclick.net', 'blocked', 'ad');
        if (trackersBlocked > 0) onRecordRequest('google-analytics.com', 'blocked', 'tracker');
      }

      if (event.data.type === 'AEGIS_POPUP_BLOCKED') {
        const nextCount = (tabRef.current.popupsBlocked || 0) + 1;
        updateTabRef.current(tab.id, { popupsBlocked: nextCount });
        const popupTarget = typeof event.data.url === 'string' ? event.data.url.slice(0, 160) : 'popup-interstitial.ad';
        onRecordRequest(popupTarget, 'blocked', 'ad');
      }

      if (event.data.type === 'AEGIS_NAVIGATE' || event.data.type === 'AEGIS_OPEN_READER') {
        const raw = typeof event.data.url === 'string' ? event.data.url.trim().slice(0, 2048) : '';
        try {
          const target = new URL(raw);
          if ((target.protocol === 'http:' || target.protocol === 'https:') && target.hostname && !target.username && !target.password) {
            if (event.data.type === 'AEGIS_NAVIGATE') navigateRef.current(target.toString());
            else openReaderRef.current(target.toString());
          }
        } catch {}
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [nativeBrowser, requestPageText, tab.id, onPageText, onRecordRequest]);

  const handleIframeLoad = () => {
    if (requestPageText) iframeRef.current?.contentWindow?.postMessage({ type: 'AEGIS_EXTRACT_PAGE_TEXT' }, '*');
    setLoadProgress(100);
    setHasLoadError(false);
    setIsIframeLoading(false);
    updateTabRef.current(tab.id, { isLoading: false });
  };

  useEffect(() => {
    if (nativeBrowser || !pageScrollCommand || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({
      type: 'AEGIS_SCROLL',
      direction: pageScrollCommand.direction,
    }, '*');
  }, [nativeBrowser, pageScrollCommand?.id]);

  useEffect(() => {
    if (nativeBrowser || !requestPageText) return;
    iframeRef.current?.contentWindow?.postMessage({ type: 'AEGIS_EXTRACT_PAGE_TEXT' }, '*');
  }, [nativeBrowser, requestPageText, tab.url]);

  const handleIframeError = () => {
    setHasLoadError(true);
    setIsIframeLoading(false);
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 overflow-hidden">
      {isIframeLoading && loadProgress < 100 && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-800 z-30">
          <div
            className="h-full bg-emerald-500 transition-all duration-300 ease-out"
            style={{ width: `${loadProgress}%` }}
          />
        </div>
      )}

      <div
        ref={nativeViewportRef}
        className="flex-1 w-full h-full overflow-hidden relative"
        style={!nativeBrowser && tab.zoomLevel !== 100 ? {
          transform: `scale(${tab.zoomLevel / 100})`,
          transformOrigin: 'top right',
        } : undefined}
      >
        {nativeBrowser ? (
          hasLoadError ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-950 text-slate-200" dir="rtl">
              <p className="text-sm">تعذر تحميل الصفحة في نافذة Chromium المعزولة.</p>
              <button type="button" onClick={() => {
                setHasLoadError(false);
                setIsIframeLoading(true);
                void nativeBrowser.createSiteView({
                  tabId: tab.id,
                  profileKind: tab.isIncognito ? 'private' : 'regular',
                  profileId: 'main',
                  url: tabRef.current.url,
                }).then((result) => {
                  if (!result.ok) {
                    setHasLoadError(true);
                    setIsIframeLoading(false);
                    return;
                  }
                  setNativeReady(true);
                  void nativeBrowser.setSiteViewVisible(tab.id, true);
                  void nativeBrowser.reloadSiteView(tab.id);
                }).catch(() => {
                  setHasLoadError(true);
                  setIsIframeLoading(false);
                });
              }} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm">
                إعادة المحاولة
              </button>
            </div>
          ) : <div className="w-full h-full bg-white" />
        ) : (
          <iframe
            ref={iframeRef}
            src={proxyUrl}
            title={tab.title}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            className="w-full h-full border-none bg-white"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            sandbox="allow-scripts allow-forms allow-popups allow-modals allow-presentation allow-downloads"
          />
        )}
        {!nativeBrowser && hasLoadError && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-slate-950/95 text-slate-200" dir="rtl">
            <p className="text-sm">انتهت صلاحية جلسة الموقع أو تعذر التحقق منها.</p>
            <button
              type="button"
              onClick={() => {
                setHasLoadError(false);
                setIsIframeLoading(true);
                if (iframeRef.current) iframeRef.current.src = proxyUrl + '&_aegis_retry=' + Date.now();
              }}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
            >
              إعادة إنشاء جلسة الموقع
            </button>
          </div>
        )}
      </div>

      {!nativeBrowser && (
        <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenReader(tab.url)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-900 text-slate-200 border border-slate-700/80 shadow-lg text-xs backdrop-blur-md transition-colors"
            title="تفعيل نمط القراءة النظيف وتجريد كافة الإعلانات"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            <span>قراءة بدون إعلانات (Reader Mode)</span>
          </button>
        </div>
      )}
    </div>
  );
};
