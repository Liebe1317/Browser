import React, { useState, useEffect, useRef } from 'react';
import { encodeShieldFlags } from '../../utils/shieldFlags';
import { ShieldCheck, Lock, ExternalLink, BookOpen, AlertTriangle, RefreshCw } from 'lucide-react';
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
}) => {
  const [loadProgress, setLoadProgress] = useState(25);
  const [isIframeLoading, setIsIframeLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // The privacy settings travel with the page load; the proxy applies them (see server/shield.ts).
  // Changing a setting changes this URL, so the page reloads with the new protection.
  const browsingContext = tab.isIncognito ? `private-${tab.id}` : 'regular';
  const proxyUrl = `/api/proxy?ctx=${encodeURIComponent(browsingContext)}&url=${encodeURIComponent(tab.url)}&s=${encodeShieldFlags(shieldSettings, sendDoNotTrack)}`;

  // Simulate smooth page loading bar like Chrome
  useEffect(() => {
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
  }, [tab.url]);

  // Listen to postMessage from the injected Aegis proxy script
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only trust messages that really come from THIS tab's page frame (never from other windows/frames)
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      if (!event.data || typeof event.data !== 'object') return;

      if (requestPageText && event.data.type === 'AEGIS_PAGE_CONTENT') {
        const pageText = typeof event.data.text === 'string' ? event.data.text.slice(0, 12000) : '';
        onPageText?.(tab.id, pageText);
      }

      if (event.data.type === 'AEGIS_PAGE_LOADED') {
        setLoadProgress(100);
        setIsIframeLoading(false);

        // Page-supplied values are untrusted: clamp numbers, cap text length
        const clampCount = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1000, Number(v))) : 0);
        const adsBlocked = clampCount(event.data.adsBlocked);
        const trackersBlocked = clampCount(event.data.trackersBlocked);

        onUpdateTabInfo(tab.id, {
          title: typeof event.data.title === 'string' && event.data.title ? event.data.title.slice(0, 200) : tab.title,
          adsBlocked: tab.adsBlocked + adsBlocked,
          trackersBlocked: tab.trackersBlocked + trackersBlocked,
          isLoading: false,
        });

        if (adsBlocked > 0) {
          onRecordRequest('googleads.g.doubleclick.net', 'blocked', 'ad');
        }
        if (trackersBlocked > 0) {
          onRecordRequest('google-analytics.com', 'blocked', 'tracker');
        }
      }

      if (event.data.type === 'AEGIS_POPUP_BLOCKED') {
        const nextCount = (tab.popupsBlocked || 0) + 1;
        onUpdateTabInfo(tab.id, {
          popupsBlocked: nextCount,
        });
        const popupTarget = typeof event.data.url === 'string' ? event.data.url.slice(0, 160) : 'popup-interstitial.ad';
        onRecordRequest(popupTarget, 'blocked', 'ad');
      }

      if (event.data.type === 'AEGIS_NAVIGATE') {
        const raw = typeof event.data.url === 'string' ? event.data.url.trim().slice(0, 2048) : '';
        try {
          const target = new URL(raw);
          // Untrusted site frames may request ordinary web navigation only, never internal browser pages.
          if (
            (target.protocol === 'http:' || target.protocol === 'https:') &&
            target.hostname &&
            !target.username &&
            !target.password
          ) onNavigate(target.toString());
        } catch {}
      }

      if (event.data.type === 'AEGIS_OPEN_READER') {
        const raw = typeof event.data.url === 'string' ? event.data.url.trim().slice(0, 2048) : '';
        try {
          const target = new URL(raw);
          if (
            (target.protocol === 'http:' || target.protocol === 'https:') &&
            target.hostname &&
            !target.username &&
            !target.password
          ) onOpenReader(target.toString());
        } catch {}
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [tab.id, tab.title, tab.adsBlocked, tab.trackersBlocked, tab.popupsBlocked, requestPageText, onPageText]);

  const handleIframeLoad = () => {
    if (requestPageText) {
      // Extracted text stays in React memory until the user explicitly opts to share it with Libi.
      iframeRef.current?.contentWindow?.postMessage({ type: 'AEGIS_EXTRACT_PAGE_TEXT' }, '*');
    }
    setLoadProgress(100);
    setIsIframeLoading(false);
    onUpdateTabInfo(tab.id, { isLoading: false });
  };

  useEffect(() => {
    if (!pageScrollCommand || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({
      type: 'AEGIS_SCROLL',
      direction: pageScrollCommand.direction,
    }, '*');
  }, [pageScrollCommand?.id]);

  useEffect(() => {
    if (requestPageText) {
      iframeRef.current?.contentWindow?.postMessage({ type: 'AEGIS_EXTRACT_PAGE_TEXT' }, '*');
    }
  }, [requestPageText, tab.url]);

  const handleIframeError = () => {
    setHasLoadError(true);
    setIsIframeLoading(false);
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 overflow-hidden">
      {/* Chrome Loading Bar (Slim Blue/Emerald Progress Line) */}
      {isIframeLoading && loadProgress < 100 && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-800 z-30">
          <div
            className="h-full bg-emerald-500 transition-all duration-300 ease-out"
            style={{ width: `${loadProgress}%` }}
          />
        </div>
      )}

      {/* Main Viewport Container */}
      <div
        className="flex-1 w-full h-full overflow-hidden relative"
        style={{
          transform: tab.zoomLevel !== 100 ? `scale(${tab.zoomLevel / 100})` : undefined,
          transformOrigin: 'top right',
        }}
      >
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
      </div>

      {/* Optional Reader Mode trigger overlay */}
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
    </div>
  );
};
