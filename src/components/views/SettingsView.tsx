import React, { useState, useEffect } from 'react';
import { 
  Settings, Shield, Search, Moon, Sun, Lock, Globe, Check, 
  Palette, Sliders, Layout, Eye, Sparkles, RefreshCw, ZoomIn, 
  Bookmark, CheckCircle2, RotateCcw
} from 'lucide-react';
import { BrowserSettings, CustomColorTheme } from '../../types/browser';
import { SEARCH_ENGINES } from '../../data/initialData';
import { getAegisCsrfToken } from '../../utils/sessionSecurity';
import { THEME_PRESETS, applyCustomTheme } from '../../utils/theme';

interface SettingsViewProps {
  settings: BrowserSettings;
  onUpdateSettings: (newSettings: BrowserSettings) => void;
  onOpenClearData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onOpenClearData,
}) => {
  const [activeTab, setActiveTab] = useState<'appearance' | 'search' | 'ui' | 'privacy'>('appearance');
  
  // Custom Color State
  const initialTheme = settings.customColors || THEME_PRESETS[0];
  const [customTheme, setCustomTheme] = useState<CustomColorTheme>(initialTheme);
  const [isSavedToast, setIsSavedToast] = useState(false);
  const [aksaVpn, setAksaVpn] = useState<{ configured: boolean; enabled: boolean; connected?: boolean; scope?: string; desktop?: boolean }>({ configured: false, enabled: false, connected: false, desktop: false });
  const [aksaBusy, setAksaBusy] = useState(false);
  const [aksaError, setAksaError] = useState('');

  useEffect(() => {
    if (settings.customColors) {
      setCustomTheme(settings.customColors);
    }
  }, [settings.customColors]);

  useEffect(() => {
    let active = true;
    const desktopBridge = window.aegisDesktop?.vpn;
    Promise.all([
      fetch('/api/aksa/vpn/status', { credentials: 'same-origin' }).then(async (response) => {
        if (!response.ok) throw new Error('تعذر قراءة حالة Aksa من الخادم');
        return response.json();
      }),
      desktopBridge?.getStatus().catch(() => null) ?? Promise.resolve(null),
    ]).then(([serverStatus, desktopStatus]) => {
      if (!active) return;
      const isDesktop = !!desktopBridge;
      const desktopConfigured = !isDesktop || desktopStatus?.configured === true;
      setAksaVpn({
        configured: serverStatus.configured === true && desktopConfigured,
        enabled: serverStatus.enabled === true || (isDesktop && desktopStatus?.enabled === true),
        connected: serverStatus.connected === true && (!isDesktop || desktopStatus?.connected === true),
        scope: isDesktop ? 'electron-session + server-egress' : 'server-egress-only',
        desktop: isDesktop,
      });
    }).catch(() => {
      if (active) setAksaError('تعذر قراءة حالة Aksa. تحقق من تشغيل خادم المتصفح والبوابة المحلية.');
    });
    return () => { active = false; };
  }, []);

  const toggleAksaVpn = async (enabled: boolean) => {
    setAksaBusy(true);
    setAksaError('');
    let serverChanged = false;
    let csrfToken = '';
    const desktopBridge = window.aegisDesktop?.vpn;
    try {
      csrfToken = await getAegisCsrfToken();
      const postServer = async (next: boolean) => {
        const response = await fetch('/api/aksa/vpn/toggle', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-Aegis-CSRF': csrfToken },
          body: JSON.stringify({ enabled: next }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'تعذر تغيير حالة Aksa على الخادم.');
        return payload;
      };

      if (enabled) {
        const serverStatus = await postServer(true);
        serverChanged = true;
        let desktopStatus = null;
        if (desktopBridge) {
          const desktopResult = await desktopBridge.setEnabled(true);
          if (!desktopResult.ok || !desktopResult.status.connected) {
            throw new Error(desktopResult.error || 'لم يؤكد محرك Chromium اتصال نفق Aksa.');
          }
          desktopStatus = desktopResult.status;
        }
        setAksaVpn({
          configured: true,
          enabled: true,
          connected: serverStatus.connected === true && (!desktopBridge || desktopStatus?.connected === true),
          scope: desktopBridge ? 'electron-session + server-egress' : 'server-egress-only',
          desktop: !!desktopBridge,
        });
      } else {
        let desktopError = '';
        if (desktopBridge) {
          const desktopResult = await desktopBridge.setEnabled(false);
          if (!desktopResult.ok) desktopError = desktopResult.error || 'تعذر إيقاف نفق Chromium.';
        }
        const serverStatus = await postServer(false);
        serverChanged = true;
        setAksaVpn({
          configured: serverStatus.configured === true,
          enabled: false,
          connected: false,
          scope: desktopBridge ? 'electron-session + server-egress' : 'server-egress-only',
          desktop: !!desktopBridge,
        });
        if (desktopError) setAksaError(desktopError);
      }
    } catch (error) {
      if (enabled && serverChanged) {
        try {
          await desktopBridge?.setEnabled(false);
        } catch {}
        try {
          await fetch('/api/aksa/vpn/toggle', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-Aegis-CSRF': csrfToken },
            body: JSON.stringify({ enabled: false }),
          });
        } catch {}
        setAksaVpn((current) => ({ ...current, enabled: false, connected: false }));
      } else {
        // A disable operation may partially succeed; reflect both layers rather than falsely showing OFF.
        try {
          const [serverStatus, desktopStatus] = await Promise.all([
            fetch('/api/aksa/vpn/status', { credentials: 'same-origin' }).then((response) => response.json()),
            desktopBridge?.getStatus().catch(() => null) ?? Promise.resolve(null),
          ]);
          setAksaVpn({
            configured: serverStatus.configured === true && (!desktopBridge || desktopStatus?.configured === true),
            enabled: serverStatus.enabled === true || (!!desktopBridge && desktopStatus?.enabled === true),
            connected: serverStatus.connected === true && (!desktopBridge || desktopStatus?.connected === true),
            scope: desktopBridge ? 'electron-session + server-egress' : 'server-egress-only',
            desktop: !!desktopBridge,
          });
        } catch {}
      }
      setAksaError(error instanceof Error ? error.message : 'تعذر تغيير حالة Aksa.');
    } finally {
      setAksaBusy(false);
    }
  };

  const updateSetting = <K extends keyof BrowserSettings>(key: K, value: BrowserSettings[K]) => {
    onUpdateSettings({
      ...settings,
      [key]: value,
    });
  };

  // Handle Preset selection
  const handleSelectPreset = (preset: CustomColorTheme) => {
    setCustomTheme(preset);
    applyCustomTheme(preset);
    onUpdateSettings({
      ...settings,
      theme: preset.id === 'light_titanium' ? 'light' : 'dark',
      customColors: preset,
    });
    triggerSavedFeedback();
  };

  // Handle custom color input change
  const handleColorChange = (key: keyof CustomColorTheme, hexVal: string) => {
    const updated: CustomColorTheme = {
      ...customTheme,
      id: 'custom_user_theme',
      name: 'سمة مخصصة (Custom Theme)',
      isCustom: true,
      [key]: hexVal,
    };
    setCustomTheme(updated);
    applyCustomTheme(updated);
    onUpdateSettings({
      ...settings,
      customColors: updated,
    });
    triggerSavedFeedback();
  };

  const handleResetColors = () => {
    handleSelectPreset(THEME_PRESETS[0]);
  };

  const triggerSavedFeedback = () => {
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 2000);
  };

  return (
    <div className="min-h-full bg-slate-900 text-slate-100 p-6 sm:p-10 max-w-5xl mx-auto select-none">
      {/* Header */}
      <div className="pb-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <span>إعدادات المتصفح وتخصيص الواجهة</span>
              {isSavedToast && (
                <span className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 animate-fade-in">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  تم الحفظ في localStorage
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              تخصيص الألوان، محرك البحث، واجهة المستخدم، ومستويات الخصوصية الفولاذية
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-850 border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('appearance')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'appearance'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>الألوان والسمات</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ui')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'ui'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layout className="w-3.5 h-3.5" />
            <span>تخصيص الواجهة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'search'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>محرك البحث</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'privacy'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>الخصوصية والأمان</span>
          </button>
        </div>
      </div>

      <div className="my-8">
        {/* ==================== TAB 1: APPEARANCE & CUSTOM COLORS ==================== */}
        {activeTab === 'appearance' && (
          <div className="space-y-8 animate-fade-in">
            {/* Curated Presets */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span>سمات ألوان المتصفح الجاهزة (Theme Presets)</span>
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    اختر قالباً لونياً متناسقاً يغير ألوان الإطار وشريط التبويبات والأزرار فوراً
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleResetColors}
                  className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>استعادة الافتراضي</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {THEME_PRESETS.map((preset) => {
                  const isSelected = customTheme.id === preset.id;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => handleSelectPreset(preset)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-slate-850 shadow-md scale-[1.01]'
                          : 'border-slate-800 bg-slate-850/60 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-xs text-white flex items-center gap-1.5">
                          {preset.name}
                        </span>
                        {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                      </div>

                      {/* Color Palette Swatches */}
                      <div className="flex items-center gap-1.5 h-6 rounded-lg p-1 bg-slate-900/60 border border-slate-800">
                        <div
                          className="h-full flex-1 rounded"
                          style={{ backgroundColor: preset.primaryAccent }}
                          title={`التمييز: ${preset.primaryAccent}`}
                        />
                        <div
                          className="h-full flex-1 rounded"
                          style={{ backgroundColor: preset.browserNavbar }}
                          title={`الناڤبار: ${preset.browserNavbar}`}
                        />
                        <div
                          className="h-full flex-1 rounded"
                          style={{ backgroundColor: preset.browserSurface }}
                          title={`السطح: ${preset.browserSurface}`}
                        />
                        <div
                          className="h-full flex-1 rounded"
                          style={{ backgroundColor: preset.browserBg }}
                          title={`الخلفية: ${preset.browserBg}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Color Palette Customizer */}
            <div className="p-5 rounded-2xl bg-slate-850 border border-slate-800 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-cyan-400" />
                  <span>تخصيص لوحة الألوان يدوياً (Custom Color Studio)</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  تحكم دقيق بألوان كل عنصر في المتصفح، يتم تطبيقها فوراً وحفظها في localStorage عبر متغيرات CSS (CSS Variables)
                </p>
              </div>

              {/* Color Pickers Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 pt-2">
                {/* 1. Primary Accent */}
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-slate-200">لون التمييز والأزرار (Accent)</label>
                    <span className="text-[10px] text-slate-400 font-mono">{customTheme.primaryAccent}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customTheme.primaryAccent}
                      onChange={(e) => handleColorChange('primaryAccent', e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                  </div>
                </div>

                {/* 2. Navbar Background */}
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-slate-200">لون شريط العناوين (Navbar)</label>
                    <span className="text-[10px] text-slate-400 font-mono">{customTheme.browserNavbar}</span>
                  </div>
                  <input
                    type="color"
                    value={customTheme.browserNavbar}
                    onChange={(e) => handleColorChange('browserNavbar', e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                  />
                </div>

                {/* 3. Tab Bar & Surface */}
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-slate-200">لون شريط التبويبات (Surface)</label>
                    <span className="text-[10px] text-slate-400 font-mono">{customTheme.browserSurface}</span>
                  </div>
                  <input
                    type="color"
                    value={customTheme.browserSurface}
                    onChange={(e) => handleColorChange('browserSurface', e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                  />
                </div>

                {/* 4. Frame Background */}
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-slate-200">خلفية إطار المتصفح (Frame Bg)</label>
                    <span className="text-[10px] text-slate-400 font-mono">{customTheme.browserBg}</span>
                  </div>
                  <input
                    type="color"
                    value={customTheme.browserBg}
                    onChange={(e) => handleColorChange('browserBg', e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                  />
                </div>

                {/* 5. Border Color */}
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-slate-200">لون الحدود والفواصل (Border)</label>
                    <span className="text-[10px] text-slate-400 font-mono">{customTheme.browserBorder}</span>
                  </div>
                  <input
                    type="color"
                    value={customTheme.browserBorder}
                    onChange={(e) => handleColorChange('browserBorder', e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                  />
                </div>

                {/* 6. Text Color */}
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-slate-200">لون النصوص الرئيسية (Text)</label>
                    <span className="text-[10px] text-slate-400 font-mono">{customTheme.textColor}</span>
                  </div>
                  <input
                    type="color"
                    value={customTheme.textColor}
                    onChange={(e) => handleColorChange('textColor', e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                  />
                </div>
              </div>

              {/* Interactive Live Mini-Preview */}
              <div className="mt-4 pt-4 border-t border-slate-800">
                <label className="block text-[11px] font-bold text-slate-400 mb-2">
                  معاينة حية للمتصفح بالألوان المختارة:
                </label>
                <div 
                  className="rounded-xl border p-3 shadow-inner"
                  style={{
                    backgroundColor: customTheme.browserBg,
                    borderColor: customTheme.browserBorder,
                    color: customTheme.textColor,
                  }}
                >
                  {/* Mock Tabs */}
                  <div className="flex items-center gap-1 mb-2">
                    <div 
                      className="px-3 py-1 rounded-t-lg text-[10px] font-bold flex items-center gap-1.5"
                      style={{
                        backgroundColor: customTheme.browserNavbar,
                        color: customTheme.textColor,
                        borderTop: `2px solid ${customTheme.primaryAccent}`,
                      }}
                    >
                      <span style={{ color: customTheme.primaryAccent }}>🛡️</span>
                      <span>علامة تبويب نشطة</span>
                    </div>
                    <div 
                      className="px-3 py-1 rounded-t-lg text-[10px] opacity-70"
                      style={{ backgroundColor: customTheme.browserSurface }}
                    >
                      تبويب آخر
                    </div>
                  </div>

                  {/* Mock Navbar */}
                  <div 
                    className="flex items-center gap-2 p-2 rounded-lg"
                    style={{
                      backgroundColor: customTheme.browserNavbar,
                      borderColor: customTheme.browserBorder,
                    }}
                  >
                    <div 
                      className="flex-1 h-6 rounded-full px-2 flex items-center gap-2 text-[10px] border"
                      style={{
                        backgroundColor: customTheme.browserBg,
                        borderColor: customTheme.browserBorder,
                      }}
                    >
                      <span style={{ color: customTheme.primaryAccent }}>🔒</span>
                      <span className="opacity-75 font-mono">https://aegis-secure.internal</span>
                    </div>
                    <div 
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-slate-950 font-bold"
                      style={{ backgroundColor: customTheme.primaryAccent }}
                    >
                      🛡️
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: UI CUSTOMIZATION ==================== */}
        {activeTab === 'ui' && (
          <div className="space-y-6 animate-fade-in text-xs">
            {/* 1. Tab Shape */}
            <div className="p-5 rounded-2xl bg-slate-850 border border-slate-800 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layout className="w-4 h-4 text-emerald-400" />
                <span>نمط وشكل ألسنة التبويب (Tab Shape)</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                اختر التصميم الهندسي لشريط ألسنة كروم العلوي
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {[
                  { id: 'chrome', name: 'كروم المنحني (Curved Chrome)', desc: 'شكل جوجل كروم الكلاسيكي بانحناءات جانبية' },
                  { id: 'rounded', name: 'عصري دائري (Modern Rounded)', desc: 'أركان دائرية ناعمة خفيفة على العين' },
                  { id: 'compact', name: 'مستطيل مضغوط (Square Flat)', desc: 'شكل مسطح بدون حواف يمنح مساحة أكبر' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => updateSetting('tabStyle', item.id as any)}
                    className={`p-3 rounded-xl border text-right transition-all ${
                      (settings.tabStyle || 'chrome') === item.id
                        ? 'border-emerald-500 bg-emerald-950/20 text-white ring-1 ring-emerald-500/30'
                        : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">{item.name}</span>
                      {(settings.tabStyle || 'chrome') === item.id && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                    <p className="text-[10px] text-slate-400">{item.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. UI Density */}
            <div className="p-5 rounded-2xl bg-slate-850 border border-slate-800 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <span>كثافة وارتفاع الواجهة (UI Density)</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                التحكم بارتفاع شريط العناوين وحجم الأزرار للملاءمة مع الشاشة
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {[
                  { id: 'comfortable', name: 'مريح وواسع (Comfortable)', desc: 'أزرار ومساحات لمس واسعة (ارتفاع 52px)' },
                  { id: 'standard', name: 'قياسي كروم (Standard)', desc: 'الحجم الافتراضي لكروم ومناسب لجميع الشاشات' },
                  { id: 'compact', name: 'مضغوط (Compact)', desc: 'مدمج لشاشات اللابتوب الصغيرة لزيادة مساحة العرض' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => updateSetting('uiDensity', item.id as any)}
                    className={`p-3 rounded-xl border text-right transition-all ${
                      (settings.uiDensity || 'standard') === item.id
                        ? 'border-emerald-500 bg-emerald-950/20 text-white ring-1 ring-emerald-500/30'
                        : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">{item.name}</span>
                      {(settings.uiDensity || 'standard') === item.id && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                    <p className="text-[10px] text-slate-400">{item.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Toggles: Bookmarks bar, Omnibox badge, New Tab Widgets */}
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-200 flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-amber-400" />
                    <span>إظهار شريط الإشارات المرجعية (Bookmarks Bar)</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    عرض شريط الروابط السريعة تحت شريط العناوين للوصول الفوري
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showBookmarksBar}
                  onChange={(e) => updateSetting('showBookmarksBar', e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-200 flex items-center gap-2">
                    <Search className="w-4 h-4 text-emerald-400" />
                    <span>مؤشر محرك البحث السريع في شريط العناوين (Omnibox Badge)</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    إظهار أيقونة محرك البحث النشط مباشرة داخل شريط العناوين للتبديل الفوري
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showEngineBadgeInOmnibox ?? true}
                  onChange={(e) => updateSetting('showEngineBadgeInOmnibox', e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-200">إظهار الساعة الرقمية في علامة التبويب الجديدة</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    عرض الوقت والتاريخ الحالي بجمالية في صفحة الترحيب
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showClockInNewTab ?? true}
                  onChange={(e) => updateSetting('showClockInNewTab', e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: SEARCH ENGINES & GENERAL WEB SEARCH ==================== */}
        {activeTab === 'search' && (
          <div className="space-y-6 animate-fade-in text-xs">
            {/* Search Engine Selection */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Search className="w-4 h-4 text-emerald-400" />
                <span>اختيار محرك البحث الافتراضي للبحث العام في الإنترنت</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                ابحث في جميع أنحاء الإنترنت بخصوصية مطلقة مع حظر إعلانات التتبع ونزع معرفات الاستهداف
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                {(Object.keys(SEARCH_ENGINES) as Array<keyof typeof SEARCH_ENGINES>).map((key) => {
                  const eng = SEARCH_ENGINES[key];
                  const isSelected = settings.defaultSearchEngine === key;
                  return (
                    <div
                      key={key}
                      onClick={() => updateSetting('defaultSearchEngine', key)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/20 shadow-md text-emerald-100'
                          : 'bg-slate-850 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold flex items-center gap-2 text-sm">
                          <span className="text-lg">{eng.icon}</span>
                          <span>{eng.name}</span>
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 font-bold border border-slate-700">
                          درجة: {eng.privacyRating}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{eng.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Search Routing Mode */}
            <div className="p-5 rounded-2xl bg-slate-850 border border-slate-800 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  <span>طريقة استعراض نتائج البحث في الإنترنت</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  حدد كيف يفتح المتصفح استعلامات البحث العامة عند كتابتها في شريط العناوين
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => updateSetting('searchMode', 'internal_results')}
                  className={`p-3.5 rounded-xl border text-right transition-all ${
                    (settings.searchMode || 'internal_results') === 'internal_results'
                      ? 'border-emerald-500 bg-emerald-950/30 text-white ring-1 ring-emerald-500/30'
                      : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs flex items-center gap-1.5">
                      <span>🛡️</span>
                      <span>مركز نتائج Aegis المشفر (مُوصى به)</span>
                    </span>
                    {(settings.searchMode || 'internal_results') === 'internal_results' && (
                      <Check className="w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                    عرض نتائج الويب داخل واجهة Aegis النظيفة مع إحصائيات التتبع المحظور، وتمكين الدخول لأي موقع بنقرة واحدة عبر وكيل الأمان.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => updateSetting('searchMode', 'direct_engine')}
                  className={`p-3.5 rounded-xl border text-right transition-all ${
                    settings.searchMode === 'direct_engine'
                      ? 'border-emerald-500 bg-emerald-950/30 text-white ring-1 ring-emerald-500/30'
                      : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs flex items-center gap-1.5">
                      <span>🌐</span>
                      <span>التوجيه المباشر لموقع المحرك عبر الوكيل</span>
                    </span>
                    {settings.searchMode === 'direct_engine' && (
                      <Check className="w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                    فتح صفحة المحرك الأصلية (مثل DuckDuckGo أو Google أو Brave) كاملة عبر وكيل Aegis مع تصفية الإعلانات والنوافذ المنبثقة.
                  </p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 4: PRIVACY & FORTRESS ==================== */}
        {activeTab === 'privacy' && (
          <div className="space-y-4 animate-fade-in text-xs">
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-200">إرسال إشارة عدم التعقب (Do Not Track) و (Sec-GPC)</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    تُرسَل مع كل طلب. المواقع غير ملزمة قانونياً أو تقنياً باحترامها.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.doNotTrack}
                  onChange={(e) => updateSetting('doNotTrack', e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-200">تشفير استعلامات DNS (DNS over HTTPS)</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    غير متوفر بعد. الخادم يستخدم DNS النظام حالياً، فمزود الإنترنت يرى أسماء النطاقات.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={false}
                  disabled
                  title="غير متوفر بعد"
                  className="w-4 h-4 rounded opacity-40 cursor-not-allowed"
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-200 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    <span>Aksa VPN — اتصال خاص بالمتصفح</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {aksaVpn.configured
                      ? (aksaVpn.enabled && aksaVpn.connected
                        ? (aksaVpn.desktop
                          ? 'متصل: طلبات الخادم وحركة جلسة Chromium تمر عبر بوابة Aksa. يراقب التطبيق صحة النفق ويوقف الحركة عند فقدانه.'
                          : 'متصل لطلبات خادم Aegis فقط. المتصفح داخل تبويب الويب لا يضمن تمرير كل الوسائط والإطارات المباشرة عبر النفق.')
                        : 'البوابة مهيأة، لكن Aksa غير متصل حالياً. لن يُعلن عن الاتصال قبل تأكيد نفق WireGuard.')
                      : 'غير مهيأ: يحتاج بوابة محلية تعتمد WireGuard وتعيد حالة /health وفيها tunnel=connected.'}
                  </p>
                  {aksaError && <p className="text-[11px] text-rose-300 mt-1">{aksaError}</p>}
                </div>
                <input
                  type="checkbox"
                  checked={aksaVpn.enabled}
                  disabled={!aksaVpn.configured || aksaBusy}
                  onChange={(e) => toggleAksaVpn(e.target.checked)}
                  aria-label="تشغيل Aksa VPN"
                  className="w-4 h-4 accent-emerald-500 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-200">محو سجل التصفح تلقائياً عند إغلاق المتصفح</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    يُمسح السجل عند بدء الجلسة التالية (أو عند فك قفل الخزنة).
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.clearHistoryOnExit}
                  onChange={(e) => updateSetting('clearHistoryOnExit', e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={onOpenClearData}
                className="px-4 py-2.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 text-xs font-semibold transition-colors"
              >
                محو بيانات التصفح الآن (تاريخ، كوكيز، كاش)...
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
