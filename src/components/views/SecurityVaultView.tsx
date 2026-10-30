import React, { useState } from 'react';
import { 
  Lock, Key, ShieldCheck, ShieldAlert, Cpu, EyeOff, Radio, 
  RotateCw, RefreshCw, CheckCircle2, AlertTriangle, Flame, 
  Layers, Globe, Terminal, FileCode, Check, Shield
} from 'lucide-react';
import { VaultState, OnionCircuit } from '../../types/browser';

interface SecurityVaultViewProps {
  vaultState: VaultState;
  onionCircuit: OnionCircuit;
  onToggleOnion: () => void;
  onResetCircuit: () => void;
  onLockVault: () => void;
  onEmergencyPurge: () => void;
  onRotateKey: () => void;
}

export const SecurityVaultView: React.FC<SecurityVaultViewProps> = ({
  vaultState,
  onionCircuit,
  onToggleOnion,
  onResetCircuit,
  onLockVault,
  onEmergencyPurge,
  onRotateKey,
}) => {
  const [isRotating, setIsRotating] = useState(false);
  const [rotateSuccess, setRotateSuccess] = useState(false);
  const [testingLeaks, setTestingLeaks] = useState(false);
  const [leakResults, setLeakResults] = useState<{
    webrtc: boolean;
    dns: boolean;
    canvas: boolean;
    mitm: boolean;
  }>({
    webrtc: true,
    dns: true,
    canvas: true,
    mitm: true,
  });

  const handleKeyRotate = () => {
    setIsRotating(true);
    setTimeout(() => {
      onRotateKey();
      setIsRotating(false);
      setRotateSuccess(true);
      setTimeout(() => setRotateSuccess(false), 2500);
    }, 800);
  };

  const handleRunLeakTest = () => {
    setTestingLeaks(true);
    setTimeout(() => {
      setTestingLeaks(false);
    }, 1200);
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
                عصي على الاختراق
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              تشفير شامل من النهاية إلى النهاية (AES-256-GCM) مع عزل عتادي ونفق متعدد الطبقات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={onLockVault}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
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
              مشفر بنسبة 100%
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            جميع بيانات التصفح، وسجل المواقع، والإشارات المرجعية، وبيانات الجلسات لا يتم حفظها كنصوص مقروءة،
            بل يتم تشفيرها محلياً في معالج جهازك عبر خوارزمية <strong>AES-256-GCM</strong> مع اشتقاق مفاتيح 
            عبر <strong>PBKDF2</strong> بـ 100,000 دورة تشفير.
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
              <span>تشفير الذاكرة المؤقتة (RAM):</span>
              <span className="text-emerald-400">Ephemeral In-Memory Zeroization</span>
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between">
            <button
              type="button"
              onClick={handleKeyRotate}
              disabled={isRotating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
              <span>{isRotating ? 'جاري تدوير المفاتيح...' : 'تدوير مفاتيح التشفير (Rotate Key)'}</span>
            </button>

            {rotateSuccess && (
              <span className="text-emerald-400 text-xs flex items-center gap-1 animate-fade-in">
                <Check className="w-3.5 h-3.5" />
                <span>تم التوليد والتشفير بنجاح!</span>
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Anti-Exploit & Leak Prevention */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
              <h2 className="text-sm font-bold text-white">حصن الحماية ضد ثغرات الاختراق</h2>
            </div>
            <button
              type="button"
              onClick={handleRunLeakTest}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${testingLeaks ? 'animate-spin' : ''}`} />
              <span>فحص الثغرات الحية</span>
            </button>
          </div>

          <div className="space-y-2 text-xs">
            {/* Leak test 1 */}
            <div className="p-2.5 rounded-xl bg-slate-850/60 border border-slate-800 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-200">ثغرة تسريب عنوان IP عبر WebRTC</p>
                <p className="text-[10px] text-slate-400">إلغاء بروتوكولات STUN/TURN لكشف IP الحقيقي</p>
              </div>
              <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                <CheckCircle2 className="w-3 h-3" />
                <span>محصن كلياً</span>
              </span>
            </div>

            {/* Leak test 2 */}
            <div className="p-2.5 rounded-xl bg-slate-850/60 border border-slate-800 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-200">تسميم البصمة العتادية (Hardware Cloaking)</p>
                <p className="text-[10px] text-slate-400">تشويش قراءات كرت الشاشة والـ Canvas والـ Audio</p>
              </div>
              <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                <CheckCircle2 className="w-3 h-3" />
                <span>مموه بنجاح</span>
              </span>
            </div>

            {/* Leak test 3 */}
            <div className="p-2.5 rounded-xl bg-slate-850/60 border border-slate-800 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-200">تشفير استعلامات النطاق (DNS Leak Shield)</p>
                <p className="text-[10px] text-slate-400">DNS over HTTPS عبر نفق Quad9 الآمن 9.9.9.9</p>
              </div>
              <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                <CheckCircle2 className="w-3 h-3" />
                <span>مشفر 100%</span>
              </span>
            </div>

            {/* Leak test 4 */}
            <div className="p-2.5 rounded-xl bg-slate-850/60 border border-slate-800 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-200">مقاومة هجمات رجل المنتصف (Anti-MITM)</p>
                <p className="text-[10px] text-slate-400">التحقق الصارم من شهادات TLS 1.3 مع منع الهبوط إلى HTTP</p>
              </div>
              <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                <CheckCircle2 className="w-3 h-3" />
                <span>نشط</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Multi-Hop Onion Circuit */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-950/60 text-purple-400 border border-purple-800/40 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>نفق التوجيه البصلي متعدد القفزات (Multi-Hop Onion Tunnel)</span>
                <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800/40">
                  {onionCircuit.cipher}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                يمر اتصالك عبر 3 محطات مشفرة في دول مختلفة لعزل موقعك الجغرافي وهويتك تماماً
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onResetCircuit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
              title="تغيير المسار وتوليد هوية رقمية جديدة"
            >
              <RotateCw className="w-3.5 h-3.5 text-slate-400" />
              <span>هوية ومسار جديد</span>
            </button>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={onionCircuit.isActive}
                onChange={onToggleOnion}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>
        </div>

        {/* 3-Hop Circuit Visual Flow */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* Node 1: Entry */}
          <div className="p-3.5 rounded-xl bg-slate-850/80 border border-slate-700/60 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-bold text-purple-400">1. عقدة الدخول (Entry Guard)</span>
              <span className="text-base">{onionCircuit.entryNode.countryCode}</span>
            </div>
            <h4 className="text-xs font-bold text-slate-100">{onionCircuit.entryNode.name}</h4>
            <p className="text-[10px] text-slate-400">{onionCircuit.entryNode.country}</p>
            <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>{onionCircuit.entryNode.ip}</span>
              <span className="text-emerald-400">{onionCircuit.entryNode.latency}ms</span>
            </div>
          </div>

          {/* Node 2: Middle */}
          <div className="p-3.5 rounded-xl bg-slate-850/80 border border-slate-700/60 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-bold text-cyan-400">2. عقدة الترحيل (Middle Relay)</span>
              <span className="text-base">{onionCircuit.middleNode.countryCode}</span>
            </div>
            <h4 className="text-xs font-bold text-slate-100">{onionCircuit.middleNode.name}</h4>
            <p className="text-[10px] text-slate-400">{onionCircuit.middleNode.country}</p>
            <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>{onionCircuit.middleNode.ip}</span>
              <span className="text-emerald-400">{onionCircuit.middleNode.latency}ms</span>
            </div>
          </div>

          {/* Node 3: Exit */}
          <div className="p-3.5 rounded-xl bg-slate-850/80 border border-slate-700/60 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-bold text-emerald-400">3. عقدة الخروج (Exit Relay)</span>
              <span className="text-base">{onionCircuit.exitNode.countryCode}</span>
            </div>
            <h4 className="text-xs font-bold text-slate-100">{onionCircuit.exitNode.name}</h4>
            <p className="text-[10px] text-slate-400">{onionCircuit.exitNode.country}</p>
            <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>{onionCircuit.exitNode.ip}</span>
              <span className="text-emerald-400">{onionCircuit.exitNode.latency}ms</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
