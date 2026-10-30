import React from 'react';
import { Plus, EyeOff, Bookmark, History, Download, Shield, BookOpen, ZoomIn, ZoomOut, RotateCcw, Trash2, Code2, Settings, Moon, Sun, ShieldAlert, Check, Lock } from 'lucide-react';

interface ChromeMenuProps {
  onNewTab: (incognito?: boolean) => void;
  onOpenHistory: () => void;
  onOpenBookmarks: () => void;
  onOpenDownloads: () => void;
  onOpenShieldDashboard: () => void;
  onOpenSecurityVault: () => void;
  onToggleReaderMode: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  zoomLevel: number;
  onOpenClearData: () => void;
  onToggleDevTools: () => void;
  onOpenSettings: () => void;
  currentTheme: string;
  onToggleTheme: () => void;
  onClose: () => void;
}

export const ChromeMenu: React.FC<ChromeMenuProps> = ({
  onNewTab,
  onOpenHistory,
  onOpenBookmarks,
  onOpenDownloads,
  onOpenShieldDashboard,
  onOpenSecurityVault,
  onToggleReaderMode,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  zoomLevel,
  onOpenClearData,
  onToggleDevTools,
  onOpenSettings,
  currentTheme,
  onToggleTheme,
  onClose,
}) => {
  const handleAction = (callback: () => void) => {
    callback();
    onClose();
  };

  return (
    <div className="absolute top-full mt-2 left-2 z-50 w-64 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl py-1.5 text-slate-200 select-none backdrop-blur-md text-xs">
      {/* Tab controls */}
      <div className="px-1 py-1 space-y-0.5">
        <button
          type="button"
          onClick={() => handleAction(() => onNewTab(false))}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-right"
        >
          <span className="flex items-center gap-2.5">
            <Plus className="w-4 h-4 text-slate-400" />
            <span>علامة تبويب جديدة</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Ctrl+T</span>
        </button>

        <button
          type="button"
          onClick={() => handleAction(() => onNewTab(true))}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-purple-950/40 text-purple-300 transition-colors text-right"
        >
          <span className="flex items-center gap-2.5">
            <EyeOff className="w-4 h-4 text-purple-400" />
            <span>نافذة تصفح خفي</span>
          </span>
          <span className="text-[10px] text-purple-400/60 font-mono">Ctrl+Shift+N</span>
        </button>
      </div>

      <div className="h-[1px] bg-slate-800 my-1 mx-2" />

      {/* Navigation features */}
      <div className="px-1 py-1 space-y-0.5">
        <button
          type="button"
          onClick={() => handleAction(onOpenSecurityVault)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-amber-950/30 text-amber-300 transition-colors text-right"
        >
          <span className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-amber-400" />
            <span className="font-semibold">مركز التشفير الفولاذي</span>
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
            AES-256
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleAction(onOpenShieldDashboard)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-emerald-950/30 text-emerald-300 transition-colors text-right"
        >
          <span className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold">لوحة درع الخصوصية</span>
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
            نشط
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleAction(onOpenBookmarks)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-right"
        >
          <span className="flex items-center gap-2.5">
            <Bookmark className="w-4 h-4 text-slate-400" />
            <span>الإشارات المرجعية</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Ctrl+B</span>
        </button>

        <button
          type="button"
          onClick={() => handleAction(onOpenHistory)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-right"
        >
          <span className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-slate-400" />
            <span>سجل التصفح</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Ctrl+H</span>
        </button>

        <button
          type="button"
          onClick={() => handleAction(onOpenDownloads)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-right"
        >
          <span className="flex items-center gap-2.5">
            <Download className="w-4 h-4 text-slate-400" />
            <span>التنزيلات الآمنة</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Ctrl+J</span>
        </button>

        <button
          type="button"
          onClick={() => handleAction(onToggleReaderMode)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-right"
        >
          <span className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <span>نمط القراءة النظيف</span>
          </span>
          <span className="text-[10px] text-slate-500">بدون إعلانات</span>
        </button>
      </div>

      <div className="h-[1px] bg-slate-800 my-1 mx-2" />

      {/* Zoom controls */}
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-slate-400">التكبير / التصغير</span>
        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5 border border-slate-700">
          <button
            type="button"
            onClick={onZoomOut}
            className="w-6 h-6 flex items-center justify-center hover:bg-slate-700 rounded text-slate-300"
            title="تصغير"
          >
            -
          </button>
          <span
            onClick={onZoomReset}
            className="px-2 font-mono text-[11px] cursor-pointer hover:text-white tabular-nums"
            title="إعادة التعيين إلى 100%"
          >
            {zoomLevel}%
          </span>
          <button
            type="button"
            onClick={onZoomIn}
            className="w-6 h-6 flex items-center justify-center hover:bg-slate-700 rounded text-slate-300"
            title="تكبير"
          >
            +
          </button>
        </div>
      </div>

      <div className="h-[1px] bg-slate-800 my-1 mx-2" />

      {/* Advanced Tools & Settings */}
      <div className="px-1 py-1 space-y-0.5">
        <button
          type="button"
          onClick={() => handleAction(onOpenClearData)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-rose-950/30 text-rose-300 transition-colors text-right"
        >
          <span className="flex items-center gap-2.5">
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>محو بيانات التصفح...</span>
          </span>
          <span className="text-[10px] text-rose-400/70 font-mono">Ctrl+Shift+Del</span>
        </button>

        <button
          type="button"
          onClick={() => handleAction(onToggleDevTools)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-right"
        >
          <span className="flex items-center gap-2.5">
            <Code2 className="w-4 h-4 text-slate-400" />
            <span>مفتش الشبكة والأمان (DevTools)</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">F12</span>
        </button>

        <button
          type="button"
          onClick={() => handleAction(onToggleTheme)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-right"
        >
          <span className="flex items-center gap-2.5">
            {currentTheme === 'dark' ? (
              <Moon className="w-4 h-4 text-indigo-400" />
            ) : (
              <Sun className="w-4 h-4 text-amber-400" />
            )}
            <span>المظهر: {currentTheme === 'dark' ? 'داكن (Dark)' : 'فاتح (Light)'}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleAction(onOpenSettings)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-right"
        >
          <span className="flex items-center gap-2.5">
            <Settings className="w-4 h-4 text-slate-400" />
            <span>الإعدادات والخصوصية</span>
          </span>
        </button>
      </div>
    </div>
  );
};
