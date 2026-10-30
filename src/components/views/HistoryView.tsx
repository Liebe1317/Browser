import React, { useState } from 'react';
import { History, Search, Trash2, Globe, ShieldCheck, Lock, ExternalLink } from 'lucide-react';
import { HistoryItem } from '../../types/browser';

interface HistoryViewProps {
  history: HistoryItem[];
  onNavigate: (url: string) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  onNavigate,
  onDeleteItem,
  onClearAll,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredHistory = history.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('ar-EG', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-full bg-slate-900 text-slate-100 p-6 sm:p-10 max-w-4xl mx-auto select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">سجل التصفح (History)</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              قائمة المواقع التي قمت بزيارتها. علماً بأن وضع التصفح الخفي لا يُسجل هنا إطلاقاً.
            </p>
          </div>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-xs transition-colors self-start sm:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>محو كل السجل</span>
          </button>
        )}
      </div>

      {/* Search Input */}
      <div className="my-6">
        <div className="flex items-center h-10 px-3 rounded-xl bg-slate-800 border border-slate-700/80 focus-within:border-emerald-500 max-w-md">
          <Search className="w-4 h-4 text-slate-400 ml-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="البحث في السجل..."
            className="flex-1 bg-transparent border-none outline-none text-xs text-slate-200 placeholder-slate-500"
          />
        </div>
      </div>

      {/* History Items List */}
      {filteredHistory.length > 0 ? (
        <div className="space-y-2">
          {filteredHistory.map((item) => (
            <div
              key={item.id}
              className="group flex items-center justify-between p-3 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-800 transition-colors"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <span className="text-[11px] text-slate-500 font-mono shrink-0">
                  {formatTime(item.visitedAt)}
                </span>

                <Globe className="w-4 h-4 text-slate-400 shrink-0" />

                <div className="truncate text-right">
                  <h4
                    onClick={() => onNavigate(item.url)}
                    className="text-xs font-semibold text-slate-200 hover:text-emerald-400 cursor-pointer truncate"
                  >
                    {item.title}
                  </h4>
                  <p className="text-[10px] text-slate-500 truncate" dir="ltr">
                    {item.url}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {item.adsBlocked + item.trackersBlocked > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/30">
                    حظر {item.adsBlocked + item.trackersBlocked}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-750 text-slate-400 hover:text-rose-400 transition-all"
                  title="حذف من السجل"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-slate-500 space-y-2">
          <History className="w-8 h-8 mx-auto opacity-40" />
          <p className="text-xs">لا يوجد أي عناصر في سجل التصفح حالياً.</p>
        </div>
      )}
    </div>
  );
};
