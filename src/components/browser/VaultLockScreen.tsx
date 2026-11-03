import React, { useState } from 'react';
import { Lock, Key, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';
import type { UnlockResult } from '../../utils/vault';

interface VaultLockScreenProps {
  onUnlock: (passphrase: string) => Promise<UnlockResult>;
}

export const VaultLockScreen: React.FC<VaultLockScreenProps> = ({ onUnlock }) => {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerifying || !passphrase) return;
    setIsVerifying(true);
    setError(null);
    try {
      const result = await onUnlock(passphrase);
      if (!result.ok) {
        if (result.reason === 'locked-out') {
          const secs = Math.ceil((result.retryAfterMs ?? 0) / 1000);
          setError(`محاولات خاطئة كثيرة، انتظر ${secs} ثانية ثم حاول مجدداً`);
        } else if (result.reason === 'corrupt') {
          setError('بيانات الخزنة تالفة أو غير قابلة للقراءة');
        } else {
          setError('كلمة المرور غير صحيحة');
        }
        setPassphrase('');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl p-6 sm:p-8 text-center space-y-6">
        <div className="relative mx-auto w-18 h-18 rounded-3xl bg-gradient-to-tr from-amber-500/20 via-emerald-500/20 to-cyan-500/20 border border-emerald-500/40 flex items-center justify-center shadow-xl shadow-emerald-500/10">
          <Lock className="w-8 h-8 text-emerald-400" />
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
            المفضلات والسجل مشفّران ولا يمكن قراءتهما بدون كلمة مرور الخزنة.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
              setError(null);
            }}
            placeholder="أدخل كلمة مرور الخزنة"
            autoComplete="current-password"
            className={`w-full h-12 px-4 rounded-xl bg-slate-800 border text-center text-sm font-mono text-white outline-none transition-all ${
              error
                ? 'border-rose-500 ring-2 ring-rose-500/20'
                : 'border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
            }`}
            autoFocus
          />

          {error && (
            <p className="text-xs text-rose-400 flex items-center justify-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{error}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={isVerifying || !passphrase}
            className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
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
        </form>

        <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-center gap-2 leading-relaxed">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>التأخير بعد المحاولات الخاطئة داخل المتصفح فقط؛ الحماية الفعلية هي قوة كلمة المرور.</span>
        </div>
      </div>
    </div>
  );
};
