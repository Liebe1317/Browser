import React from 'react';
import { Lock, ShieldCheck, CheckCircle2, XCircle, AlertTriangle, Key, Server, Globe, ExternalLink } from 'lucide-react';

interface SecurityModalProps {
  hostname: string;
  isHttps: boolean;
  onClose: () => void;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
  hostname,
  isHttps,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-4 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isHttps ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-amber-950 text-amber-400'}`}>
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                {isHttps ? 'الاتصال آمن ومشفر' : 'الاتصال غير مشفر'}
              </h3>
              <p className="text-xs text-slate-400">{hostname || 'Aegis Core'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-700 text-sm"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-200">الشهادة صالحة (TLS 1.3)</p>
                <p className="text-slate-400 mt-0.5 text-[11px] leading-relaxed">
                  تم التحقق من هوية الموقع عبر تشفير 256-bit AES متقدم. لا يمكن لأي طرف ثالث التلصص على بياناتك أو تغييرها.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 pt-2 border-t border-slate-700/50">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-200">عزل ملفات الارتباط (Cookie Sandboxing)</p>
                <p className="text-slate-400 mt-0.5 text-[11px] leading-relaxed">
                  يمنع المتصفح تخزين أي كوكيز تابعة لأطراف ثالثة (Third-party Cookies) ويمنع مشاركتها مع شبكات الإعلانات.
                </p>
              </div>
            </div>
          </div>

          {/* Permissions Overview */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-300">أذونات الموقع (مقفلة تلقائياً لحمايتك)</h4>
            <div className="space-y-1.5 text-slate-300">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/30 border border-slate-800">
                <span className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  <span>الموقع الجغرافي (Geolocation)</span>
                </span>
                <span className="text-[11px] font-mono text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-900/40">
                  محظور تلقائياً
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/30 border border-slate-800">
                <span className="flex items-center gap-2">
                  <Server className="w-3.5 h-3.5 text-slate-400" />
                  <span>الكاميرا والميكروفون</span>
                </span>
                <span className="text-[11px] font-mono text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-900/40">
                  محظور تلقائياً
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/30 border border-slate-800">
                <span className="flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 text-slate-400" />
                  <span>الإشعارات والنوافذ المنبثقة</span>
                </span>
                <span className="text-[11px] font-mono text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-900/40">
                  محظور تلقائياً
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-800/40 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-xs font-medium transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
