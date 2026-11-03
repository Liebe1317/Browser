import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, ExternalLink, BookOpen, AlertTriangle, RefreshCw } from 'lucide-react';
import { Tab, ShieldSettings } from '../../types/browser';

interface WebPageViewProps {
  tab: Tab;
  shieldSettings: ShieldSettings;
  onUpdateTabInfo: (id: string, updates: Partial<Tab>) => void;
  onNavigate: (url: string) => void;
  onOpenReader: (url: string) => void;
  onRecordRequest: (domain: string, status: 'allowed' | 'blocked', reason?: 'ad' | 'tracker') => void;
}

export const WebPageView: React.FC<WebPageViewProps> = ({
  tab,
  shieldSettings,
  onUpdateTabInfo,
  onNavigate,
  onOpenReader,
  onRecordRequest,
}) => {
  const [loadProgress, setLoadProgress] = useState(25);
  const [isIframeLoading, setIsIframeLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const proxyUrl = `/api/proxy?url=${encodeURIComponent(tab.url)}`;

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
        onRecordRequest(event.data.url || 'popup-interstitial.ad', 'blocked', 'ad');
      }

      if (event.data.type === 'AEGIS_NAVIGATE') {
        const raw = String(event.data.url || '').trim();
        if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('chrome://')) {
          onNavigate(raw);
        }
      }

      if (event.data.type === 'AEGIS_OPEN_READER') {
        const raw = String(event.data.url || '').trim();
        if (raw.startsWith('http://') || raw.startsWith('https://')) {
          onOpenReader(raw);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [tab.id, tab.title, tab.adsBlocked, tab.trackersBlocked, tab.popupsBlocked]);

  const handleIframeLoad = () => {
    setLoadProgress(100);
    setIsIframeLoading(false);
    onUpdateTabInfo(tab.id, { isLoading: false });
  };

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
