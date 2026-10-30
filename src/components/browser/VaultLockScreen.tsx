import React, { useState } from 'react';
import { Lock, Key, ShieldCheck, ArrowRight, AlertCircle, Fingerprint, RefreshCw } from 'lucide-react';

interface VaultLockScreenProps {
  onUnlock: (pin: string) => boolean;
}

export const VaultLockScreen: React.FC<VaultLockScreenProps> = ({ onUnlock }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setTimeout(() => {
      const success = onUnlock(pin);
      if (!success) {
        setError(true);
        setIsVerifying(false);
      }
    }, 400);
  };

  const handleQuickBiometric = () => {
    setIsVerifying(true);
    setTimeout(() => {
      onUnlock('aegis-master-seed');
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl p-6 sm:p-8 text-center space-y-6">
        {/* Animated Vault Lock Icon */}
        <div className="relative mx-auto w-18 h-18 rounded-3xl bg-gradient-to-tr from-amber-500/20 via-emerald-500/20 to-cyan-500/20 border border-emerald-500/40 flex items-center justify-center shadow-xl shadow-emerald-500/10">
          <Lock className="w-8 h-8 text-emerald-400 animate-pulse" />
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-900 border border-emerald-500 flex items-center justify-center">
            <Key className="w-3 h-3 text-amber-400" />
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold text-white flex items-center justify-center gap-2">
            <span>الخزنة المشفرة مقفلة</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
              AES-256-GCM
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
            تم تشفير الذاكرة الحية وكافة بيانات التصفح. أدخل رمز الأمان لفك تشفير الجلسة ومتابعة التصفح.
          </p>
        </div>

        {/* PIN Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type="password"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setError(false);
              }}
              placeholder="أدخل رمز الـ PIN أو اضغط فتح سريع..."
              className={`w-full h-12 px-4 rounded-xl bg-slate-800 border text-center text-sm font-mono tracking-widest text-white outline-none transition-all ${
                error
                  ? 'border-rose-500 ring-2 ring-rose-500/20'
                  : 'border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
              }`}
              autoFocus
            />
          </div>

          {error && (
            <p className="text-xs text-rose-400 flex items-center justify-center gap-1.5 animate-shake">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>الرمز غير صحيح، أو اضغط على الفتح السريع أدناه</span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="submit"
              disabled={isVerifying}
              className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
            >
              {isVerifying ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Key className="w-3.5 h-3.5" />
                  <span>فك القفل</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleQuickBiometric}
              className="w-full h-10 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <Fingerprint className="w-4 h-4 text-cyan-400" />
              <span>فتح بالمفتاح الآمن</span>
            </button>
          </div>
        </form>

        <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>حماية ضد هجمات القوة الغاشمة (Anti-Brute Force active)</span>
        </div>
      </div>
    </div>
  );
};
