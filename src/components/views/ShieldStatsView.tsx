import React from 'react';
import { ShieldCheck, Zap, Lock, EyeOff, Cookie, Globe, Server, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { ShieldSettings } from '../../types/browser';

interface ShieldStatsViewProps {
  totalAdsBlocked: number;
  totalTrackersBlocked: number;
  shieldSettings: ShieldSettings;
  onUpdateShieldSettings: (settings: ShieldSettings) => void;
  onResetStats: () => void;
}

export const ShieldStatsView: React.FC<ShieldStatsViewProps> = ({
  totalAdsBlocked,
  totalTrackersBlocked,
  shieldSettings,
  onUpdateShieldSettings,
  onResetStats,
}) => {
  const bandwidthSavedMB = ((totalAdsBlocked * 0.85) + (totalTrackersBlocked * 0.15)).toFixed(1);
  const timeSavedSec = (((totalAdsBlocked + totalTrackersBlocked) * 0.35)).toFixed(1);

  const toggle = (key: keyof ShieldSettings) => {
    onUpdateShieldSettings({
      ...shieldSettings,
      [key]: !shieldSettings[key],
    });
  };

  return (
    <div className="min-h-full bg-slate-900 text-slate-100 p-6 sm:p-10 max-w-4xl mx-auto select-none">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <span>لوحة تحكم درع الخصوصية (Aegis Shields)</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                محمي بالكامل
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              إحصائيات المراقبة الحية ومنظومة الدفاع ضد الإعلانات والمتعقبات
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onResetStats}
          className="self-start sm:self-auto text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
        >
          تصفير الإحصائيات
        </button>
      </div>

      {/* Hero 4-stat metrics cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-8">
        <div className="p-4 rounded-xl bg-slate-850 border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">إجمالي الإعلانات المحظورة</span>
          <span className="text-2xl sm:text-3xl font-bold text-emerald-400 font-mono tabular-nums">
            {totalAdsBlocked}
          </span>
          <p className="text-[10px] text-slate-500 mt-1">بانرات، فيديو، ونوافذ منبثقة</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-850 border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">أدوات التعقب المحيدة</span>
          <span className="text-2xl sm:text-3xl font-bold text-cyan-400 font-mono tabular-nums">
            {totalTrackersBlocked}
          </span>
          <p className="text-[10px] text-slate-500 mt-1">Google, Meta, Criteo وغيرها</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-850 border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">حجم البيانات الموفر (تقدير)</span>
          <span className="text-2xl sm:text-3xl font-bold text-amber-400 font-mono tabular-nums">
            {bandwidthSavedMB} <span className="text-sm font-normal text-slate-400">MB</span>
          </span>
          <p className="text-[10px] text-slate-500 mt-1">تقليل استهلاك باقة الإنترنت</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-850 border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">زمن التصفح الموفر (تقدير)</span>
          <span className="text-2xl sm:text-3xl font-bold text-indigo-400 font-mono tabular-nums">
            {timeSavedSec} <span className="text-sm font-normal text-slate-400">ثانية</span>
          </span>
          <p className="text-[10px] text-slate-500 mt-1">تسريع تحميل الصفحات بنسبة 40%</p>
        </div>
      </div>

      {/* Shield Protection Features Grid */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-slate-200">إعدادات الحماية الدفاعية الافتراضية</h2>
        
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-950/60 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-200">حظر الإعلانات الشامل (Ad Blocking)</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  يزيل جميع إعلانات جوجل، وإعلانات الفيديو، والبانرات التتبعية، ومساحات المحتوى المروج المزعج.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={shieldSettings.blockAggressiveAds}
              onChange={() => toggle('blockAggressiveAds')}
              className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
            />
          </div>

          <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-950/60 text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-200">حظر النوافذ المنبثقة والإعلانات الطافية (Pop-ups & Overlays)</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  يعترض النوافذ الإعلانية الجديدة غير المرغوبة (window.open)، ويلغي حيل تحويل النقرات (Click-Jacking) والبانرات الشفافة.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={shieldSettings.blockPopups}
              onChange={() => toggle('blockPopups')}
              className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
            />
          </div>

          <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/60 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
                <EyeOff className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-200">منع البصمة الرقمية (غير متوفر بعد)</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  لم يُنفَّذ بعد. المواقع ما زالت تستطيع قراءة بصمة Canvas/WebGL/Audio.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={false}
              disabled
              title="غير متوفر بعد"
              className="w-4 h-4 rounded opacity-40 cursor-not-allowed"
            />
          </div>

          <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-950/60 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <Cookie className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-200">عزل وحظر كوكيز الطرف الثالث (Cookie Isolation)</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  يعزل ملفات تعريف الارتباط لكل موقع داخل صندوق رملي منفصل لمنع مشاركة نشاطك بين المواقع.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={shieldSettings.blockThirdPartyCookies}
              onChange={() => toggle('blockThirdPartyCookies')}
              className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
            />
          </div>

          <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-950/60 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-200">ترقية الروابط التلقائية إلى HTTPS</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  يجبر أي موقع على استخدام الاتصال المشفر لتجنب هجمات اعتراض البيانات على الشبكات العامة.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={shieldSettings.upgradeHttps}
              onChange={() => toggle('upgradeHttps')}
              className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
            />
          </div>

          <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-950/60 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-200">منع تسريب عنوان IP عبر WebRTC</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  يحجب ثغرة WebRTC التي تستخدمها بعض الشبكات لكشف عنوان IP الحقيقي أثناء التصفح.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={shieldSettings.preventWebRTCLeak}
              onChange={() => toggle('preventWebRTCLeak')}
              className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
