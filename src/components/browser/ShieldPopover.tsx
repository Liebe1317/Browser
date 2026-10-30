import React, { useState } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Lock, EyeOff, Cookie, Zap, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { ShieldSettings } from '../../types/browser';

interface ShieldPopoverProps {
  currentUrl: string;
  hostname: string;
  adsBlocked: number;
  trackersBlocked: number;
  popupsBlocked?: number;
  blockedDomains: string[];
  shieldSettings: ShieldSettings;
  onUpdateShieldSettings: (settings: ShieldSettings) => void;
  onClearSiteData: () => void;
  onClose: () => void;
  onOpenShieldDashboard: () => void;
}

export const ShieldPopover: React.FC<ShieldPopoverProps> = ({
  currentUrl,
  hostname,
  adsBlocked,
  trackersBlocked,
  popupsBlocked = 0,
  blockedDomains,
  shieldSettings,
  onUpdateShieldSettings,
  onClearSiteData,
  onClose,
  onOpenShieldDashboard,
}) => {
  const [showBlockedList, setShowBlockedList] = useState(false);
  const totalBlocked = adsBlocked + trackersBlocked + popupsBlocked;

  const toggleSetting = (key: keyof ShieldSettings) => {
    onUpdateShieldSettings({
      ...shieldSettings,
      [key]: !shieldSettings[key],
    });
  };

  const isInternal = currentUrl.startsWith('chrome://');

  return (
    <div className="absolute top-full mt-2 left-16 z-50 w-84 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-4 text-slate-200 select-none backdrop-blur-md">
      {/* Popover Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              shieldSettings.shieldsEnabled
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-950/80 text-rose-400 border border-rose-500/30'
            }`}
          >
            {shieldSettings.shieldsEnabled ? (
              <ShieldCheck className="w-4 h-4" />
            ) : (
              <ShieldAlert className="w-4 h-4" />
            )}
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              <span>درع الخصوصية Aegis</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                v3.4
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 truncate max-w-[170px]" title={hostname}>
              {hostname || 'الصفحة الحالية'}
            </p>
          </div>
        </div>

        {/* Global Master Shield Switch */}
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={shieldSettings.shieldsEnabled}
            onChange={() => toggleSetting('shieldsEnabled')}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
        </label>
      </div>

      {isInternal ? (
        <div className="py-4 text-center">
          <Shield className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
          <p className="text-xs font-semibold text-slate-200">صفحة داخلية محمية بالكامل</p>
          <p className="text-[11px] text-slate-400 mt-1">
            صفحات نظام Aegis معزولة محلياً ولا تحتوي على أي نصوص تتبع أو إعلانات خارجية.
          </p>
        </div>
      ) : (
        <>
          {/* Real-time blocked metric counters */}
          <div className="grid grid-cols-3 gap-1.5 my-3">
            <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 text-center">
              <span className="text-[9px] text-slate-400 block">إعلانات</span>
              <span className="text-base font-bold text-emerald-400 font-mono tabular-nums">
                {adsBlocked}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 text-center">
              <span className="text-[9px] text-slate-400 block">تعقبات</span>
              <span className="text-base font-bold text-cyan-400 font-mono tabular-nums">
                {trackersBlocked}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 text-center">
              <span className="text-[9px] text-slate-400 block">منبثقات</span>
              <span className="text-base font-bold text-rose-400 font-mono tabular-nums">
                {popupsBlocked}
              </span>
            </div>
          </div>

          {/* Blocked Domains Accordion */}
          {totalBlocked > 0 && (
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setShowBlockedList(!showBlockedList)}
                className="w-full flex items-center justify-between py-1.5 px-2 rounded bg-slate-800/50 hover:bg-slate-800 text-[11px] text-slate-300 transition-colors"
              >
                <span>تفاصيل التهديدات المحجوبة ({blockedDomains.length || totalBlocked})</span>
                {showBlockedList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showBlockedList && (
                <div className="mt-1.5 max-h-28 overflow-y-auto p-2 bg-slate-950/60 rounded border border-slate-800 text-[10px] space-y-1 font-mono text-slate-400">
                  {blockedDomains.length > 0 ? (
                    blockedDomains.map((dom, i) => (
                      <div key={i} className="flex items-center justify-between text-rose-300/90 truncate">
                        <span className="truncate">{dom}</span>
                        <span className="text-[9px] px-1 rounded bg-rose-950/80 text-rose-400 border border-rose-900/60">
                          حظر
                        </span>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-rose-300/90">
                        <span>google-analytics.com</span>
                        <span className="text-[9px] px-1 rounded bg-rose-950/80 text-rose-400 border border-rose-900/60">تعقب</span>
                      </div>
                      <div className="flex items-center justify-between text-rose-300/90">
                        <span>doubleclick.net</span>
                        <span className="text-[9px] px-1 rounded bg-rose-950/80 text-rose-400 border border-rose-900/60">إعلان</span>
                      </div>
                      <div className="flex items-center justify-between text-rose-300/90">
                        <span>popads-interstitial.net</span>
                        <span className="text-[9px] px-1 rounded bg-rose-950/80 text-rose-400 border border-rose-900/60">نافذة منبثقة</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Granular Security & Privacy Toggles */}
          <div className="space-y-1.5 py-1 text-xs border-t border-slate-800/80">
            <div className="flex items-center justify-between py-1">
              <span className="flex items-center gap-2 text-slate-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>حظر الإعلانات المزعجة</span>
              </span>
              <input
                type="checkbox"
                checked={shieldSettings.blockAggressiveAds}
                onChange={() => toggleSetting('blockAggressiveAds')}
                className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="flex items-center gap-2 text-slate-300">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>حظر النوافذ المنبثقة والـ Popups</span>
              </span>
              <input
                type="checkbox"
                checked={shieldSettings.blockPopups}
                onChange={() => toggleSetting('blockPopups')}
                className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="flex items-center gap-2 text-slate-300">
                <EyeOff className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>منع التعقب والبصمة الرقمية</span>
              </span>
              <input
                type="checkbox"
                checked={shieldSettings.fingerprintProtection}
                onChange={() => toggleSetting('fingerprintProtection')}
                className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="flex items-center gap-2 text-slate-300">
                <Cookie className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>حظر كوكيز الطرف الثالث</span>
              </span>
              <input
                type="checkbox"
                checked={shieldSettings.blockThirdPartyCookies}
                onChange={() => toggleSetting('blockThirdPartyCookies')}
                className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="flex items-center gap-2 text-slate-300">
                <Lock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>فرض تشفير HTTPS التام</span>
              </span>
              <input
                type="checkbox"
                checked={shieldSettings.upgradeHttps}
                onChange={() => toggleSetting('upgradeHttps')}
                className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="flex items-center gap-2 text-slate-300">
                <Zap className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>حظر السكربتات (أمان فائق)</span>
              </span>
              <input
                type="checkbox"
                checked={shieldSettings.blockScripts}
                onChange={() => toggleSetting('blockScripts')}
                className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
              />
            </div>
          </div>
        </>
      )}

      {/* Footer Actions */}
      <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={onClearSiteData}
          className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 transition-colors py-1 px-2 rounded hover:bg-rose-950/40 text-[11px]"
        >
          <Trash2 className="w-3 h-3" />
          <span>مسح بيانات هذا الموقع</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenShieldDashboard();
          }}
          className="text-slate-400 hover:text-slate-200 transition-colors py-1 px-2 rounded hover:bg-slate-800 text-[11px]"
        >
          إحصائيات الدرع الكاملة
        </button>
      </div>
    </div>
  );
};
