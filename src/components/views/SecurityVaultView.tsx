import React, { useState } from 'react';
import { 
  Lock, Key, ShieldCheck, 
  Cpu, RefreshCw, CheckCircle2, AlertTriangle, Flame, Shield
} from 'lucide-react';
import { VaultState, ShieldSettings } from '../../types/browser';

interface SecurityVaultViewProps {
  vaultState: VaultState;
  onLockVault: () => void;
  onEmergencyPurge: () => void;
  onCreateVault: (passphrase: string) => Promise<void>;
  shieldSettings: ShieldSettings;
  sendDoNotTrack: boolean;
}

export const SecurityVaultView: React.FC<SecurityVaultViewProps> = ({
  vaultState,
  onLockVault,
  onEmergencyPurge,
  onCreateVault,
  shieldSettings,
  sendDoNotTrack,
}) => {
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass.length < 8) {
      setCreateError('كلمة المرور يجب ألا تقل عن 8 أحرف');
      return;
    }
    if (newPass !== confirmPass) {
      setCreateError('كلمتا المرور غير متطابقتين');
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      await onCreateVault(newPass);
      setNewPass('');
      setConfirmPass('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'تعذّر إنشاء الخزنة');
    } finally {
      setIsCreating(false);
    }
  };

  type Status = 'on' | 'partial' | 'off';
  const on = shieldSettings.shieldsEnabled;
  const rows: Array<{ title: string; note: string; status: Status }> = [
    {
      title: 'عزل الصفحات عن المتصفح',
      note: 'كل صفحة تعمل بأصل معزول ولا تصل لبياناتك أو واجهة التطبيق. فعّال دائماً.',
      status: 'on',
    },
    {
      title: 'منع الاتصال المباشر بالمواقع الأخرى',
      note: 'المتصفح نفسه يمنع أي صفحة من الاتصال بغير الوكيل، فلا يتسرب عنوان IP الحقيقي. فعّال دائماً.',
      status: 'on',
    },
    {
      title: 'ملفات الارتباط لكل موقع على حدة',
      note: on && shieldSettings.blockThirdPartyCookies
        ? 'مقسّمة لكل موقع، وملفات الأطراف الثالثة محجوبة تماماً.'
        : 'مقسّمة لكل موقع، لكن ملفات الأطراف الثالثة مسموحة داخل قسم الموقع.',
      status: on && shieldSettings.blockThirdPartyCookies ? 'on' : 'partial',
    },
    {
      title: 'حظر الإعلانات والتتبع',
      note: on && (shieldSettings.blockAggressiveAds || shieldSettings.blockTrackers)
        ? 'حجب بحسب اسم النطاق من قائمة محدودة ومحدّثة يدوياً، وليس شاملاً.'
        : 'معطّل من إعدادات الدرع.',
      status: on && (shieldSettings.blockAggressiveAds || shieldSettings.blockTrackers) ? 'partial' : 'off',
    },
    {
      title: 'إجبار HTTPS',
      note: shieldSettings.upgradeHttps ? 'تُرفع روابط http إلى https تلقائياً.' : 'معطّل من إعدادات الدرع.',
      status: shieldSettings.upgradeHttps ? 'on' : 'off',
    },
    {
      title: 'إشارة عدم التعقب (GPC/DNT)',
      note: sendDoNotTrack ? 'تُرسل مع كل طلب، والموقع غير ملزم باحترامها.' : 'معطّلة من الإعدادات.',
      status: sendDoNotTrack ? 'partial' : 'off',
    },
    {
      title: 'منع تسريب WebRTC',
      note: shieldSettings.preventWebRTCLeak
        ? 'حماية جزئية بالجافاسكربت، ويمكن لسكربت متقدم تجاوزها.'
        : 'معطّل من إعدادات الدرع.',
      status: shieldSettings.preventWebRTCLeak ? 'partial' : 'off',
    },
    {
      title: 'تشفير المفضلات والسجل محلياً',
      note: vaultState.isSetUp ? 'مشفّرة بـ AES-256-GCM بكلمة مرورك.' : 'غير مشفّرة. أنشئ كلمة مرور للخزنة.',
      status: vaultState.isSetUp ? 'on' : 'off',
    },
    {
      title: 'منع البصمة الرقمية (Canvas/WebGL)',
      note: 'غير متوفر بعد. لم يُنفَّذ.',
      status: 'off',
    },
    {
      title: 'تشفير استعلامات DNS (DoH)',
      note: 'غير متوفر بعد. الخادم يستخدم DNS النظام.',
      status: 'off',
    },
  ];
  const badge: Record<Status, { label: string; cls: string }> = {
    on: { label: 'يعمل', cls: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/40' },
    partial: { label: 'جزئي', cls: 'text-amber-400 bg-amber-950/60 border-amber-800/40' },
    off: { label: 'غير مفعّل', cls: 'text-slate-400 bg-slate-800/60 border-slate-700/60' },
  };

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 p-6 sm:p-10 max-w-5xl mx-auto select-none space-y-8 font-sans">
      {/* Fortress Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10">
            <Lock className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <span>مركز التشفير والأمان الفولاذي (Aegis Cryptographic Fortress)</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                {vaultState.isSetUp ? 'الخزنة مفعّلة' : 'الخزنة غير مفعّلة'}
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              تشفير المفضلات والسجل محلياً بـ AES-256-GCM بكلمة مرور تختارها
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={onLockVault}
            disabled={!vaultState.isSetUp}
            title={vaultState.isSetUp ? undefined : 'أنشئ الخزنة أولاً'}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
          >
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>قفل الخزنة الآن</span>
          </button>

          <button
            type="button"
            onClick={onEmergencyPurge}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800/60 text-xs font-semibold shadow-md transition-colors"
            title="تدمير فوري لكافة السجلات والذاكرة والمفاتيح بدون أي أثر"
          >
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            <span>زر التدمير الذاتي (Kill Switch)</span>
          </button>
        </div>
      </div>

      {/* Grid: Storage Encryption & Anti-Exploit Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Storage Encryption Engine */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Cpu className="w-5 h-5 text-emerald-400" />
              <h2 className="text-sm font-bold text-white">تشفير التخزين والذاكرة الحية</h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
              {vaultState.isSetUp ? 'مشفّر' : 'غير مشفّر'}
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {vaultState.isSetUp ? (
              <>
                المفضلات والسجل مخزّنان مشفّرين بخوارزمية <strong>AES-256-GCM</strong> مع اشتقاق المفتاح من كلمة مرورك
                عبر <strong>PBKDF2</strong> بـ 600,000 دورة. الإعدادات والمظهر غير مشفّرة. إذا نسيت كلمة المرور فلا يمكن استرجاع البيانات.
              </>
            ) : (
              <>
                المفضلات والسجل محفوظان حالياً كنص عادي داخل المتصفح. أنشئ كلمة مرور للخزنة لتشفيرهما بـ
                <strong> AES-256-GCM</strong>.
              </>
            )}
          </p>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2 font-mono text-[11px]">
            <div className="flex items-center justify-between text-slate-400">
              <span>خوارزمية التشفير:</span>
              <span className="text-emerald-400 font-bold">{vaultState.algorithm}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>اشتقاق المفتاح:</span>
              <span className="text-cyan-400 font-bold">{vaultState.keyDerivation}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>متجه التهيئة (IV):</span>
              <span className="text-slate-300">96-bit عشوائي لكل عملية كتابة</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>مفتاح التشفير:</span>
              <span className="text-emerald-400">في الذاكرة فقط، يُحذف عند القفل</span>
            </div>
          </div>

          {!vaultState.isSetUp && (
            <form onSubmit={handleCreateVault} className="pt-1 space-y-2">
              <input
                type="password"
                value={newPass}
                onChange={(e) => { setNewPass(e.target.value); setCreateError(null); }}
                placeholder="كلمة مرور الخزنة (8 أحرف على الأقل)"
                autoComplete="new-password"
                className="w-full h-9 px-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 text-xs text-white outline-none"
              />
              <input
                type="password"
                value={confirmPass}
                onChange={(e) => { setConfirmPass(e.target.value); setCreateError(null); }}
                placeholder="أعد كتابة كلمة المرور"
                autoComplete="new-password"
                className="w-full h-9 px-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 text-xs text-white outline-none"
              />
              {createError && (
                <p className="text-[11px] text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{createError}</span>
                </p>
              )}
              <button
                type="submit"
                disabled={isCreating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 disabled:opacity-60 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors"
              >
                {isCreating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                <span>{isCreating ? 'جاري إنشاء الخزنة...' : 'إنشاء الخزنة وتشفير بياناتي'}</span>
              </button>
            </form>
          )}
        </div>

        {/* Card 2: what is actually protected right now */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold text-white">حالة الحماية الفعلية</h2>
          </div>
          <div className="space-y-2 text-xs">
            {rows.map((r) => (
              <div key={r.title} className="p-2.5 rounded-xl bg-slate-850/60 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-200">{r.title}</p>
                  <p className="text-[10px] text-slate-400 leading-relaxed">{r.note}</p>
                </div>
                <span className={`shrink-0 text-[11px] font-mono px-2 py-0.5 rounded border ${badge[r.status].cls}`}>
                  {badge[r.status].label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
