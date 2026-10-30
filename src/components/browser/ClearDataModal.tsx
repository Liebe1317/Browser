import React, { useState } from 'react';
import { Trash2, AlertTriangle, ShieldCheck, Check } from 'lucide-react';

interface ClearDataModalProps {
  onClear: (options: {
    history: boolean;
    cookies: boolean;
    cache: boolean;
    timeRange: string;
  }) => void;
  onClose: () => void;
}

export const ClearDataModal: React.FC<ClearDataModalProps> = ({
  onClear,
  onClose,
}) => {
  const [clearHistory, setClearHistory] = useState(true);
  const [clearCookies, setClearCookies] = useState(true);
  const [clearCache, setClearCache] = useState(true);
  const [timeRange, setTimeRange] = useState('all');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleConfirm = () => {
    onClear({
      history: clearHistory,
      cookies: clearCookies,
      cache: clearCache,
      timeRange,
    });
    setIsSuccess(true);
    setTimeout(() => {
      onClose();
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        <div className="p-4 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-bold text-slate-100">محو بيانات التصفح</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Time range */}
          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">النطاق الزمني:</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 outline-none focus:border-emerald-500"
            >
              <option value="hour">الساعة الأخيرة</option>
              <option value="day">آخر 24 ساعة</option>
              <option value="week">آخر 7 أيام</option>
              <option value="all">جميع الأوقات (تنظيف كامل)</option>
            </select>
          </div>

          {/* Options */}
          <div className="space-y-3 pt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={clearHistory}
                onChange={(e) => setClearHistory(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-emerald-500 rounded"
              />
              <div>
                <p className="font-semibold text-slate-200">سجل التصفح (Browsing History)</p>
                <p className="text-[11px] text-slate-400">يمسح سجل المواقع وعناوين الصفحات المفتوحة.</p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={clearCookies}
                onChange={(e) => setClearCookies(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-emerald-500 rounded"
              />
              <div>
                <p className="font-semibold text-slate-200">ملفات تعريف الارتباط وبيانات المواقع</p>
                <p className="text-[11px] text-slate-400">يسجل خروجك من المواقع ويمسح التخزين المؤقت للبيانات المعزولة.</p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={clearCache}
                onChange={(e) => setClearCache(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-emerald-500 rounded"
              />
              <div>
                <p className="font-semibold text-slate-200">الصور والملفات المخزنة مؤقتاً (Cache)</p>
                <p className="text-[11px] text-slate-400">يفرغ الذاكرة المؤقتة لتحرير المساحة وتسريع التصفح.</p>
              </div>
            </label>
          </div>
        </div>

        <div className="p-4 bg-slate-800/40 border-t border-slate-800 flex justify-end gap-2 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSuccess}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-medium flex items-center gap-1.5 transition-colors"
          >
            {isSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>تم المسح بنجاح!</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>محو البيانات الآن</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
