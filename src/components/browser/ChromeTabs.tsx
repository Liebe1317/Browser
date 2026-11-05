import React from 'react';
import { Plus, X, Globe, Shield, EyeOff, Pin, Volume2, VolumeX, Search } from 'lucide-react';
import { Tab } from '../../types/browser';

interface ChromeTabsProps {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string, e: React.MouseEvent) => void;
  onNewTab: (incognito?: boolean) => void;
  onTogglePin?: (id: string) => void;
  onToggleMute?: (id: string) => void;
  isIncognitoMode: boolean;
  tabStyle?: 'chrome' | 'rounded' | 'compact';
}

export const ChromeTabs: React.FC<ChromeTabsProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onTogglePin,
  onToggleMute,
  isIncognitoMode,
  tabStyle = 'chrome',
}) => {
  return (
    <div
      className={`flex items-end h-10 px-2 pt-1 gap-1 select-none border-b transition-colors ${
        isIncognitoMode
          ? 'bg-slate-950 border-purple-950/40'
          : 'border-slate-800'
      }`}
      style={{
        backgroundColor: isIncognitoMode ? undefined : 'var(--theme-bg-base, #06130f)',
        borderColor: isIncognitoMode ? undefined : 'var(--theme-border, #17473a)',
      }}
    >
      {/* Incognito indicator if any tab or mode is incognito */}
      {isIncognitoMode && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 mb-1 mr-1 text-xs font-semibold rounded-md bg-purple-950/60 text-purple-300 border border-purple-800/40 shrink-0">
          <EyeOff className="w-3.5 h-3.5 text-purple-400" />
          <span className="hidden sm:inline">التصفح الخفي</span>
        </div>
      )}

      {/* Tabs list with horizontal scroll */}
      <div className="flex items-end gap-1 flex-1 overflow-x-auto no-scrollbar max-w-full">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isTabIncognito = tab.isIncognito;

          // Shape classes based on tabStyle
          const shapeClass =
            tabStyle === 'rounded'
              ? 'rounded-t-xl'
              : tabStyle === 'compact'
              ? 'rounded-none'
              : 'rounded-t-lg';

          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`group relative flex items-center h-8.5 px-3 max-w-[220px] min-w-[130px] ${shapeClass} text-xs font-medium cursor-pointer transition-all duration-150 border-t border-x ${
                isActive
                  ? isTabIncognito
                    ? 'bg-slate-900 text-slate-100 border-purple-500/40 shadow-sm z-10'
                    : 'text-white border-slate-700 shadow-sm z-10'
                  : 'text-slate-400 hover:text-slate-200 border-transparent hover:border-slate-800'
              }`}
              style={{
                backgroundColor: isActive
                  ? isTabIncognito
                    ? undefined
                    : 'var(--theme-bg-navbar, #102e26)'
                  : undefined,
                borderColor: isActive && !isTabIncognito ? 'var(--theme-border, #17473a)' : undefined,
                borderTopColor: isActive ? (isTabIncognito ? '#a855f7' : 'var(--theme-accent, #10b981)') : undefined,
                borderTopWidth: isActive ? '2px' : '1px',
              }}
            >
              {/* Tab Favicon or Status Icon */}
              <div className="shrink-0 mr-2 ml-1 flex items-center">
                {tab.isLoading ? (
                  <div 
                    className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: 'var(--theme-accent, #10b981)', borderTopColor: 'transparent' }}
                  />
                ) : tab.isIncognito ? (
                  <EyeOff className="w-3.5 h-3.5 text-purple-400" />
                ) : tab.pageType === 'shields' ? (
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                ) : tab.favicon ? (
                  <span className="text-xs leading-none">{tab.favicon}</span>
                ) : (
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                )}
              </div>

              {/* Tab Title */}
              <span className="flex-1 truncate text-right direction-rtl">
                {tab.title}
              </span>

              {/* Shield block mini counter on active tab */}
              {tab.adsBlocked + tab.trackersBlocked > 0 && (
                <span 
                  className="mx-1 px-1 py-0.2 rounded text-[10px] font-mono shrink-0 border"
                  style={{
                    backgroundColor: 'var(--theme-accent-10, rgba(16, 185, 129, 0.1))',
                    color: 'var(--theme-accent, #10b981)',
                    borderColor: 'var(--theme-accent-20, rgba(16, 185, 129, 0.2))',
                  }}
                >
                  {tab.adsBlocked + tab.trackersBlocked}
                </span>
              )}

              {/* Pinned Icon */}
              {tab.isPinned && (
                <Pin className="w-3 h-3 text-slate-400 mr-1 shrink-0" />
              )}

              {/* Native Chromium audio activity indicator */}
              {tab.isAudible && !tab.isMuted && (
                <Volume2 className="w-3 h-3 text-emerald-400 mr-1 shrink-0" title="يصدر صوتاً" />
              )}

              {/* Mute Audio Icon */}
              {tab.isMuted && (
                <VolumeX className="w-3 h-3 text-rose-400 mr-1 shrink-0" />
              )}

              {/* Close Tab Button */}
              <button
                type="button"
                aria-label="إغلاق علامة التبويب"
                onClick={(e) => onCloseTab(tab.id, e)}
                className="w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 transition-opacity ml-1 shrink-0"
              >
                <X className="w-3 h-3" />
              </button>

              {/* Seamless blend line to navbar below */}
              {isActive && (
                <div
                  className="absolute -bottom-[1px] left-0 right-0 h-[1px]"
                  style={{
                    backgroundColor: isTabIncognito ? '#0f172a' : 'var(--theme-bg-navbar, #102e26)',
                  }}
                />
              )}
            </div>
          );
        })}

        {/* New Tab Button (+) */}
        <button
          type="button"
          onClick={() => onNewTab(isIncognitoMode)}
          aria-label="علامة تبويب جديدة"
          className="w-7 h-7 mb-0.5 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors shrink-0"
          title="علامة تبويب جديدة (Ctrl+T)"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Window Controls / Search Tabs */}
      <div className="flex items-center gap-1 mb-1 shrink-0">
        <button
          type="button"
          onClick={() => onNewTab(true)}
          className={`p-1.5 rounded-md text-xs transition-colors ${
            isIncognitoMode
              ? 'text-purple-300 bg-purple-900/40 hover:bg-purple-900/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="فتح لسان تصفح خفي جديد (Incognito)"
        >
          <EyeOff className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
