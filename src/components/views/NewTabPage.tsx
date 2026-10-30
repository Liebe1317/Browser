import React, { useState, useEffect } from 'react';
import { 
  Search, Shield, ShieldCheck, Zap, Globe, Plus, Trash2, 
  ExternalLink, Sparkles, EyeOff, Lock, Clock, ArrowRight,
  ChevronDown
} from 'lucide-react';
import { SPEED_DIAL_ITEMS, SEARCH_ENGINES, PRIVACY_TIPS } from '../../data/initialData';
import { Bookmark } from '../../types/browser';

interface NewTabPageProps {
  isIncognito: boolean;
  onNavigate: (url: string) => void;
  totalAdsBlocked: number;
  totalTrackersBlocked: number;
  searchEngine: keyof typeof SEARCH_ENGINES;
  onChangeSearchEngine: (engine: keyof typeof SEARCH_ENGINES) => void;
  onOpenShieldDashboard: () => void;
}

export const NewTabPage: React.FC<NewTabPageProps> = ({
  isIncognito,
  onNavigate,
  totalAdsBlocked,
  totalTrackersBlocked,
  searchEngine,
  onChangeSearchEngine,
  onOpenShieldDashboard,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [showEngineDropdown, setShowEngineDropdown] = useState(false);
  const [speedDials, setSpeedDials] = useState(SPEED_DIAL_ITEMS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');

  // Clock update
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      );
      setCurrentDate(
        now.toLocaleDateString('ar-EG', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    onNavigate(searchQuery.trim());
  };

  const handleAddSpeedDial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newUrl.trim()) return;
    const formattedUrl = newUrl.startsWith('http') ? newUrl : `https://${newUrl}`;
    setSpeedDials([
      ...speedDials,
      {
        id: `sd-${Date.now()}`,
        title: newTitle.trim(),
        url: formattedUrl,
        icon: '🔗',
        description: 'موقع مخصص',
        bgColor: 'from-slate-700/30 to-slate-800/20',
      },
    ]);
    setNewTitle('');
    setNewUrl('');
    setShowAddModal(false);
  };

  const handleRemoveSpeedDial = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSpeedDials(speedDials.filter((item) => item.id !== id));
  };

  const currentEngineInfo = SEARCH_ENGINES[searchEngine] || SEARCH_ENGINES.duckduckgo;
  const bandwidthSavedMB = ((totalAdsBlocked * 0.85) + (totalTrackersBlocked * 0.15)).toFixed(1);
  const timeSavedSec = (((totalAdsBlocked + totalTrackersBlocked) * 0.35)).toFixed(1);

  return (
    <div className={`min-h-full flex flex-col items-center justify-between p-6 sm:p-10 select-none transition-colors ${
      isIncognito
        ? 'bg-gradient-to-b from-slate-950 via-slate-900 to-purple-950/20 text-slate-100'
        : 'bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-100'
    }`}>
      {/* Top Banner if Incognito */}
      {isIncognito ? (
        <div className="w-full max-w-3xl p-6 rounded-2xl bg-purple-950/40 border border-purple-800/40 backdrop-blur-md mb-8 text-center animate-fade-in">
          <div className="w-14 h-14 rounded-full bg-purple-900/60 border border-purple-500/30 flex items-center justify-center mx-auto mb-3 text-purple-300">
            <EyeOff className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-purple-200">أنت الآن في وضع التصفح الخفي (Incognito)</h2>
          <p className="text-xs text-purple-300/80 mt-1.5 max-w-lg mx-auto leading-relaxed">
            لن يقوم هذا المتصفح بحفظ أي سجل تصفح، أو ملفات تعريف ارتباط، أو بيانات مواقع. 
            تظل دروع حظر الإعلانات والتعقب نشطة بكامل طاقتها لحماية خصوصيتك.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 mt-4 text-[11px] text-purple-300/70">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              <span>حظر الإعلانات مفعل</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-purple-400" />
              <span>لا يتم حفظ السجل</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              <span>عزل تام للهوية الرقمية</span>
            </span>
          </div>
        </div>
      ) : (
        /* Top Privacy Telemetry Bar */
        <div className="w-full max-w-4xl mb-6">
          <div 
            onClick={onOpenShieldDashboard}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-slate-800/50 hover:bg-slate-800/70 border border-slate-700/60 cursor-pointer transition-all duration-200 group"
          >
            <div className="text-center p-2 rounded-xl bg-slate-900/40 border border-slate-700/30">
              <span className="text-[11px] text-slate-400 block mb-0.5">إعلانات محجوبة</span>
              <span className="text-xl font-bold text-emerald-400 font-mono tabular-nums">
                {totalAdsBlocked}
              </span>
            </div>

            <div className="text-center p-2 rounded-xl bg-slate-900/40 border border-slate-700/30">
              <span className="text-[11px] text-slate-400 block mb-0.5">أدوات تعقب موقوفة</span>
              <span className="text-xl font-bold text-cyan-400 font-mono tabular-nums">
                {totalTrackersBlocked}
              </span>
            </div>

            <div className="text-center p-2 rounded-xl bg-slate-900/40 border border-slate-700/30">
              <span className="text-[11px] text-slate-400 block mb-0.5">بيانات تم توفيرها</span>
              <span className="text-xl font-bold text-amber-400 font-mono tabular-nums">
                {bandwidthSavedMB} <span className="text-xs font-normal text-slate-400">MB</span>
              </span>
            </div>

            <div className="text-center p-2 rounded-xl bg-slate-900/40 border border-slate-700/30">
              <span className="text-[11px] text-slate-400 block mb-0.5">زمن تحميل موفر</span>
              <span className="text-xl font-bold text-indigo-400 font-mono tabular-nums">
                {timeSavedSec} <span className="text-xs font-normal text-slate-400">ث</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Center Area: Clock, Brand, Search Bar */}
      <div className="w-full max-w-2xl flex flex-col items-center my-auto">
        {/* Time and Date */}
        {!isIncognito && (
          <div className="text-center mb-6">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-100 font-mono">
              {currentTime}
            </h1>
            <p className="text-xs text-slate-400 mt-1">{currentDate}</p>
          </div>
        )}

        {/* Brand Logo & Title */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>متصفح Aegis</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                درع الخصوصية
              </span>
            </h2>
            <p className="text-xs text-slate-400">تصفح حر، سريع، وبدون إعلانات أو تعقب إطلاقاً</p>
          </div>
        </div>

        {/* Central Search Omnibar */}
        <form onSubmit={handleSearch} className="w-full relative mb-8">
          <div className="flex items-center w-full h-13 px-4 rounded-2xl bg-slate-800/90 border border-slate-700/80 hover:border-emerald-500/60 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 shadow-xl transition-all duration-200 backdrop-blur-md">
            {/* Search Engine Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEngineDropdown(!showEngineDropdown)}
                className="flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-lg hover:bg-slate-700/60 text-xs font-medium text-slate-300 transition-colors shrink-0"
                title="تغيير محرك البحث الآمن"
              >
                <span>{currentEngineInfo.icon}</span>
                <span className="hidden sm:inline">{currentEngineInfo.name}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {/* Dropdown Menu */}
              {showEngineDropdown && (
                <div className="absolute top-full mt-2 right-0 z-30 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 space-y-1 text-xs">
                  <p className="px-2 py-1 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    اختر محرك البحث الافتراضي
                  </p>
                  {(Object.keys(SEARCH_ENGINES) as Array<keyof typeof SEARCH_ENGINES>).map((key) => {
                    const engine = SEARCH_ENGINES[key];
                    const isSelected = key === searchEngine;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          onChangeSearchEngine(key);
                          setShowEngineDropdown(false);
                        }}
                        className={`w-full flex items-start gap-2.5 p-2 rounded-lg text-right transition-colors ${
                          isSelected
                            ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/30'
                            : 'hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        <span className="text-base">{engine.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{engine.name}</span>
                            <span className="text-[10px] font-mono px-1 rounded bg-slate-800 text-emerald-400">
                              {engine.privacyRating}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">{engine.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="w-[1px] h-6 bg-slate-700 mx-2" />

            {/* Input field */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder=""
              className="flex-1 bg-transparent border-none outline-none text-sm text-slate-100 placeholder-slate-500 px-2 font-sans"
              autoFocus
            />

            {/* Submit Button */}
            <button
              type="submit"
              className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition-colors shrink-0 shadow-md shadow-emerald-600/30"
              title="بحث آمن"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Speed Dial Grid */}
        <div className="w-full">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs font-semibold text-slate-400">المواقع الأكثر زيارة ومصادر المعرفة</span>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة اختصار</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {speedDials.map((dial) => (
              <div
                key={dial.id}
                onClick={() => onNavigate(dial.url)}
                className="group relative p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 cursor-pointer transition-all duration-200 flex flex-col justify-between h-24"
              >
                <div className="flex items-start justify-between">
                  <div className="w-8 h-8 rounded-lg bg-slate-700/60 flex items-center justify-center text-lg shadow-sm">
                    {dial.icon}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleRemoveSpeedDial(dial.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-700/80 transition-opacity"
                    title="حذف الاختصار"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200 truncate">{dial.title}</h4>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">{dial.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Privacy Tip Ribbon */}
      <div className="w-full max-w-3xl mt-8 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="line-clamp-1">{PRIVACY_TIPS[0]}</span>
        </div>
        <button
          type="button"
          onClick={onOpenShieldDashboard}
          className="text-emerald-400 hover:text-emerald-300 whitespace-nowrap shrink-0 flex items-center gap-1 font-medium"
        >
          <span>إعدادات الخصوصية المتقدمة</span>
          <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
        </button>
      </div>

      {/* Add Speed Dial Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 text-slate-100">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>إضافة اختصار جديد للصفحة الرئيسية</span>
            </h3>
            <form onSubmit={handleAddSpeedDial} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">اسم الموقع:</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="مثال: مدونتي التقنية"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">رابط الموقع (URL):</label>
                <input
                  type="text"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 outline-none focus:border-emerald-500 direction-ltr text-left"
                  dir="ltr"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium"
                >
                  إضافة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
