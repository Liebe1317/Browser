import React, { useState } from 'react';
import { Download, Monitor, Smartphone, CheckCircle, Shield, Sparkles, X, Terminal, ExternalLink, ArrowDownToLine } from 'lucide-react';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose }) => {
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const triggerDownload = (type: 'exe' | 'apk') => {
    setDownloadStatus(type === 'exe' ? 'جارٍ تنزيل نسخة Windows...' : 'جارٍ تنزيل نسخة Android...');
    const link = document.createElement('a');
    if (type === 'exe') {
      link.href = '/downloads/Aegis-Browser-Setup.exe';
      link.download = 'Aegis-Browser-Setup.exe';
    } else {
      link.href = '/downloads/Aegis-Browser.apk';
      link.download = 'Aegis-Browser.apk';
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setDownloadStatus(type === 'exe' ? '✓ تم بدء تنزيل Aegis-Browser-Setup.exe بنجاح!' : '✓ تم بدء تنزيل Aegis-Browser.apk بنجاح!');
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">تنزيل متصفح Aegis Privacy Browser</h3>
              <p className="text-xs text-slate-400">نسخ أصلية مجهزة بنواة الحماية القصوى وحظر الإعلانات</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {downloadStatus && (
            <div className="flex items-center gap-2 p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-semibold animate-fade-in">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{downloadStatus}</span>
            </div>
          )}

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Windows .EXE Card */}
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-emerald-500/50 transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                    <Monitor className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-mono">
                    .EXE (Windows)
                  </span>
                </div>
                <h4 className="font-bold text-sm text-white mb-1">نسخة نظام الويندوز</h4>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  ملف تنفيذي مباشر وخفيف يدعم ويندوز 10 و11 مع تشفير التخزين المحلي وحجب الإعلانات الشامل.
                </p>
              </div>
              <button
                type="button"
                onClick={() => triggerDownload('exe')}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg transition-all active:scale-[0.98]"
              >
                <ArrowDownToLine className="w-4 h-4" />
                <span>تحميل Aegis-Setup.exe</span>
              </button>
            </div>

            {/* Android .APK Card */}
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-emerald-500/50 transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                    .APK (Android)
                  </span>
                </div>
                <h4 className="font-bold text-sm text-white mb-1">نسخة هواتف الأندرويد</h4>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  حزمة تثبيت أندرويد جاهزة للهواتف والأجهزة اللوحية مع حظر تعقب الشبكات ومساعد ليبي الذكي.
                </p>
              </div>
              <button
                type="button"
                onClick={() => triggerDownload('apk')}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-all active:scale-[0.98]"
              >
                <ArrowDownToLine className="w-4 h-4" />
                <span>تحميل Aegis-Browser.apk</span>
              </button>
            </div>
          </div>

          {/* Features badge */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-white">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>ميزات الإصدار (v4.2.0):</span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-400 list-disc list-inside">
              <li>حظر كامل للإعلانات والنوافذ المنبثقة</li>
              <li>محرك بحث جوجل الحقيقي الخالي من التعقب</li>
              <li>مشغل سيرفرات الفيديو التلقائي المدمج</li>
              <li>مساعد الذكاء الاصطناعي "ليبي" بالكوفية</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <span>Aegis Privacy Browser • الأمان أولاً</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
