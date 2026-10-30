import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, ArrowRight, RotateCw, X, Home, Lock, Shield, 
  ShieldCheck, ShieldAlert, Star, BookOpen, Puzzle, MoreVertical, 
  EyeOff, Search, Globe, ChevronDown, Ban
} from 'lucide-react';
import { Tab, ShieldSettings } from '../../types/browser';
import { SEARCH_ENGINES } from '../../data/initialData';
import { ShieldPopover } from './ShieldPopover';
import { ChromeMenu } from './ChromeMenu';
import { SecurityModal } from './SecurityModal';

interface ChromeNavbarProps {
  currentTab: Tab;
  canGoBack: boolean;
  canGoForward: boolean;
  isBookmarked: boolean;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onGoHome: () => void;
  onToggleBookmark: () => void;
  onToggleReaderMode: () => void;
  onOpenShieldDashboard: () => void;
  onOpenSecurityVault: () => void;
  onNewTab: (incognito?: boolean) => void;
  onOpenHistory: () => void;
  onOpenBookmarks: () => void;
  onOpenDownloads: () => void;
  onOpenSettings: () => void;
  onOpenClearData: () => void;
  onToggleDevTools: () => void;
  shieldSettings: ShieldSettings;
  onUpdateShieldSettings: (settings: ShieldSettings) => void;
  onClearSiteData: () => void;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  theme: string;
  onToggleTheme: () => void;
  defaultSearchEngine?: keyof typeof SEARCH_ENGINES;
  onChangeSearchEngine?: (engine: keyof typeof SEARCH_ENGINES) => void;
  showEngineBadge?: boolean;
  uiDensity?: 'comfortable' | 'standard' | 'compact';
  onToggleLibi?: () => void;
  isLibiOpen?: boolean;
}

export const ChromeNavbar: React.FC<ChromeNavbarProps> = ({
  currentTab,
  canGoBack,
  canGoForward,
  isBookmarked,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onGoHome,
  onToggleBookmark,
  onToggleReaderMode,
  onOpenShieldDashboard,
  onOpenSecurityVault,
  onNewTab,
  onOpenHistory,
  onOpenBookmarks,
  onOpenDownloads,
  onOpenSettings,
  onOpenClearData,
  onToggleDevTools,
  shieldSettings,
  onUpdateShieldSettings,
  onClearSiteData,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  theme,
  onToggleTheme,
  defaultSearchEngine = 'google',
  onChangeSearchEngine,
  showEngineBadge = true,
  uiDensity = 'standard',
  onToggleLibi,
  isLibiOpen = false,
}) => {
  const [inputVal, setInputVal] = useState(currentTab.displayUrl || currentTab.url);
  const [isFocused, setIsFocused] = useState(false);
  const [showShieldPopover, setShowShieldPopover] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showExtensionsModal, setShowExtensionsModal] = useState(false);
  const [showEngineDropdown, setShowEngineDropdown] = useState(false);

  const shieldRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<HTMLDivElement>(null);

  // Sync input value whenever tab url changes, unless user is actively editing
  useEffect(() => {
    if (!isFocused) {
      if (currentTab.url === 'chrome://newtab') {
        setInputVal('');
      } else {
        setInputVal(currentTab.displayUrl || currentTab.url);
      }
    }
  }, [currentTab.url, currentTab.displayUrl, isFocused]);

  // Close popups on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (shieldRef.current && !shieldRef.current.contains(e.target as Node)) {
        setShowShieldPopover(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
      if (engineRef.current && !engineRef.current.contains(e.target as Node)) {
        setShowEngineDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    onNavigate(inputVal.trim());
    setIsFocused(false);
  };

  // Extract friendly hostname for display
  const getHostname = (url: string) => {
    try {
      if (url.startsWith('chrome://')) return url;
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return parsed.hostname;
    } catch {
      return url;
    }
  };

  const hostname = getHostname(currentTab.url);
  const totalBlocked = currentTab.adsBlocked + currentTab.trackersBlocked + (currentTab.popupsBlocked || 0);
  const activeEngine = SEARCH_ENGINES[defaultSearchEngine] || SEARCH_ENGINES.duckduckgo;
  const heightClass = uiDensity === 'comfortable' ? 'h-13' : uiDensity === 'compact' ? 'h-10' : 'h-12';

  return (
    <div
      className={`relative flex items-center ${heightClass} px-3 gap-2 border-b select-none transition-colors ${
        currentTab.isIncognito
          ? 'bg-slate-900 border-purple-950/40 text-slate-200'
          : 'text-slate-200'
      }`}
      style={{
        backgroundColor: currentTab.isIncognito ? undefined : 'var(--theme-bg-navbar, #102e26)',
        borderColor: currentTab.isIncognito ? undefined : 'var(--theme-border, #17473a)',
      }}
    >
      {/* Navigation action buttons: Back, Forward, Reload, Home */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onGoBack}
          disabled={!canGoBack}
          aria-label="الرجوع للخلف"
          title="الرجوع (Alt+Left)"
          className="p-1.5 rounded-full hover:bg-slate-750 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 hover:text-white transition-colors"
        >
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </button>

        <button
          type="button"
          onClick={onGoForward}
          disabled={!canGoForward}
          aria-label="التقدم للأمام"
          title="التقدم (Alt+Right)"
          className="p-1.5 rounded-full hover:bg-slate-750 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
        </button>

        <button
          type="button"
          onClick={onReload}
          aria-label={currentTab.isLoading ? 'إيقاف التحميل' : 'إعادة تحميل الصفحة'}
          title={currentTab.isLoading ? 'إيقاف التحميل' : 'إعادة التحميل (Ctrl+R)'}
          className="p-1.5 rounded-full hover:bg-slate-750 text-slate-300 hover:text-white transition-colors"
        >
          {currentTab.isLoading ? (
            <X className="w-4 h-4 text-rose-400" />
          ) : (
            <RotateCw className="w-4 h-4" />
          )}
        </button>

        <button
          type="button"
          onClick={onGoHome}
          aria-label="الصفحة الرئيسية"
          title="الصفحة الرئيسية"
          className="p-1.5 rounded-full hover:bg-slate-750 text-slate-300 hover:text-white transition-colors"
        >
          <Home className="w-4 h-4" />
        </button>
      </div>

      {/* Omnibox / Search & Address Bar */}
      <form
        onSubmit={handleSubmit}
        className={`flex items-center flex-1 h-8.5 px-3 rounded-full transition-all duration-200 border ${
          isFocused
            ? 'bg-slate-900 border-emerald-500/70 ring-2 ring-emerald-500/20 shadow-md'
            : currentTab.isIncognito
            ? 'bg-slate-950/90 border-slate-700/60 hover:border-purple-500/40'
            : 'bg-slate-800/90 border-slate-700/70 hover:border-slate-600'
        }`}
      >
        {/* Security Padlock / Certificate Button */}
        <button
          type="button"
          onClick={() => setShowSecurityModal(true)}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors ml-1 shrink-0"
          title="معلومات الأمان وتشفير الاتصال"
        >
          {currentTab.securityStatus === 'secure' ? (
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
          ) : currentTab.securityStatus === 'warning' ? (
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Globe className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        {/* Search Engine Quick Switcher Badge */}
        {showEngineBadge && (
          <div className="relative shrink-0 mx-1" ref={engineRef}>
            <button
              type="button"
              onClick={() => setShowEngineDropdown(!showEngineDropdown)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-slate-700/60 text-[11px] text-slate-300 hover:text-white transition-colors"
              title={`محرك البحث النشط: ${activeEngine.name} (انقر للتبديل السريع)`}
            >
              <span className="text-xs">{activeEngine.icon}</span>
              <ChevronDown className="w-2.5 h-2.5 opacity-60" />
            </button>

            {showEngineDropdown && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl py-1.5 z-50 text-right animate-fade-in">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 border-b border-slate-800 flex items-center justify-between">
                  <span>محرك البحث الافتراضي</span>
                  <span className="text-emerald-400 font-mono text-[9px]">Aegis Safe</span>
                </div>
                {(Object.keys(SEARCH_ENGINES) as Array<keyof typeof SEARCH_ENGINES>).map((key) => {
                  const eng = SEARCH_ENGINES[key];
                  const isSelected = defaultSearchEngine === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        onChangeSearchEngine?.(key);
                        setShowEngineDropdown(false);
                      }}
                      className={`w-full px-3 py-1.5 flex items-center justify-between text-xs hover:bg-slate-800 transition-colors ${
                        isSelected ? 'text-emerald-400 font-bold bg-slate-800/40' : 'text-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm">{eng.icon}</span>
                        <span>{eng.name}</span>
                      </span>
                      <span className="text-[10px] font-mono px-1.5 rounded bg-slate-800 text-slate-400">
                        {eng.privacyRating}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Omnibox Input */}
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder=""
          className="flex-1 bg-transparent border-none outline-none text-xs text-slate-100 placeholder-slate-500 px-2 font-sans direction-ltr text-left"
          dir="ltr"
        />

        {/* Omnibox Action Icons */}
        <div className="flex items-center gap-1.5 mr-1 shrink-0">
          {/* Chrome Pop-up Blocked Notification Pill */}
          {currentTab.popupsBlocked > 0 && (
            <div 
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950/80 border border-rose-800/60 text-rose-300 text-[10px] font-mono shrink-0 animate-pulse"
              title={`تم حظر ${currentTab.popupsBlocked} نافذة منبثقة أو إعلان طافٍ في هذه الصفحة`}
            >
              <Ban className="w-3 h-3 text-rose-400" />
              <span className="hidden sm:inline">حظر منبثقة ({currentTab.popupsBlocked})</span>
            </div>
          )}

          {/* Reader Mode Button */}
          {currentTab.pageType === 'webpage' && (
            <button
              type="button"
              onClick={onToggleReaderMode}
              className={`p-1 rounded-md transition-colors ${
                currentTab.readerMode
                  ? 'text-blue-400 bg-blue-950/60'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
              }`}
              title="نمط القراءة النظيف (بدون إعلانات ومشتتات)"
            >
              <BookOpen className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Bookmark Star Button */}
          <button
            type="button"
            onClick={onToggleBookmark}
            className={`p-1 rounded-md transition-colors ${
              isBookmarked
                ? 'text-amber-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
            }`}
            title={isBookmarked ? 'إزالة من الإشارات المرجعية' : 'إضافة إلى الإشارات المرجعية (Ctrl+D)'}
          >
            <Star className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-400' : ''}`} />
          </button>
        </div>
      </form>

      {/* Right Controls: Shield Badge, Extensions, Incognito & Kebab Menu */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Libi AI Assistant Button with Palestinian Keffiyeh Avatar */}
        {onToggleLibi && (
          <button
            type="button"
            onClick={onToggleLibi}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all shadow-sm ${
              isLibiOpen
                ? 'bg-indigo-600 text-white border-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                : 'bg-indigo-950/60 hover:bg-indigo-900/70 text-indigo-200 border-indigo-500/40 hover:border-indigo-400'
            }`}
            title="ليبي (Libi) - مساعد الذكاء الاصطناعي الخاص بك 🇵🇸"
          >
            <div className="w-5 h-5 rounded-full overflow-hidden border border-indigo-300/60 shrink-0">
              <img src="/assets/libi.png" alt="ليبي" className="w-full h-full object-cover" />
            </div>
            <span className="hidden sm:inline font-bold">ليبي</span>
          </button>
        )}

        {/* Military Encryption Vault & Onion Circuit Button */}
        <button
          type="button"
          onClick={onOpenSecurityVault}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-500/40 text-[11px] font-mono transition-colors shadow-sm"
          title="مركز التشفير الفولاذي وحصن الأمان (AES-256-GCM / Multi-Hop)"
        >
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden md:inline font-bold">AES-256</span>
        </button>

        {/* Aegis Shield Button & Live Counter */}
        <div className="relative" ref={shieldRef}>
          <button
            type="button"
            onClick={() => setShowShieldPopover(!showShieldPopover)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all border ${
              shieldSettings.shieldsEnabled
                ? totalBlocked > 0
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                  : 'bg-slate-800 text-emerald-400 border-slate-700'
                : 'bg-rose-950/80 text-rose-300 border-rose-500/40'
            }`}
            title="درع الخصوصية Aegis وحظر الإعلانات"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-bold font-mono tabular-nums">
              {totalBlocked}
            </span>
          </button>

          {/* Shield Popover Dropdown */}
          {showShieldPopover && (
            <ShieldPopover
              currentUrl={currentTab.url}
              hostname={hostname}
              adsBlocked={currentTab.adsBlocked}
              trackersBlocked={currentTab.trackersBlocked}
              popupsBlocked={currentTab.popupsBlocked}
              blockedDomains={currentTab.blockedDomains}
              shieldSettings={shieldSettings}
              onUpdateShieldSettings={onUpdateShieldSettings}
              onClearSiteData={onClearSiteData}
              onClose={() => setShowShieldPopover(false)}
              onOpenShieldDashboard={onOpenShieldDashboard}
            />
          )}
        </div>

        {/* Extensions Puzzle Icon */}
        <button
          type="button"
          onClick={() => setShowExtensionsModal(!showExtensionsModal)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-750 transition-colors"
          title="الإضافات المدمجة للحماية"
        >
          <Puzzle className="w-4 h-4" />
        </button>

        {/* Incognito quick indicator / button */}
        {currentTab.isIncognito && (
          <div
            className="p-1.5 rounded-lg bg-purple-950/70 border border-purple-800/40 text-purple-300"
            title="أنت في وضع التصفح الخفي الآمن - لا يتم تسجيل أي تاريخ"
          >
            <EyeOff className="w-4 h-4" />
          </div>
        )}

        {/* 3-Dots Chrome Menu (Kebab Menu) */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-750 transition-colors"
            title="تخصيص Aegis والتحكم فيه"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <ChromeMenu
              onNewTab={onNewTab}
              onOpenHistory={onOpenHistory}
              onOpenBookmarks={onOpenBookmarks}
              onOpenDownloads={onOpenDownloads}
              onOpenShieldDashboard={onOpenShieldDashboard}
              onOpenSecurityVault={onOpenSecurityVault}
              onToggleReaderMode={onToggleReaderMode}
              onZoomIn={onZoomIn}
              onZoomOut={onZoomOut}
              onZoomReset={onZoomReset}
              zoomLevel={zoomLevel}
              onOpenClearData={onOpenClearData}
              onToggleDevTools={onToggleDevTools}
              onOpenSettings={onOpenSettings}
              currentTheme={theme}
              onToggleTheme={onToggleTheme}
              onClose={() => setShowMenu(false)}
            />
          )}
        </div>
      </div>

      {/* Security Certificate Modal */}
      {showSecurityModal && (
        <SecurityModal
          hostname={hostname}
          isHttps={currentTab.securityStatus === 'secure'}
          onClose={() => setShowSecurityModal(false)}
        />
      )}

      {/* Built-in Extensions Modal */}
      {showExtensionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Puzzle className="w-4 h-4 text-emerald-400" />
                <span>الإضافات المدمجة للخصوصية</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowExtensionsModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <div className="py-3 space-y-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-200">Aegis AdBlocker Ultra</p>
                  <p className="text-[11px] text-slate-400">حظر إعلانات الفيديو والبانرات المزعجة</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                  مثبت ونشط
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-200">GhostTracker Shield</p>
                  <p className="text-[11px] text-slate-400">إلغاء بكسلات التتبع ومعرفات فيسبوك وجوجل</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                  مثبت ونشط
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-200">Canvas Fingerprint Cloaker</p>
                  <p className="text-[11px] text-slate-400">تشويش بصمة المعالج والمتصفح العشوائية</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                  مثبت ونشط
                </span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={() => setShowExtensionsModal(false)}
                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
