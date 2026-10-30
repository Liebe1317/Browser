import React, { useState } from 'react';
import { Download, FileText, CheckCircle2, ShieldCheck, Trash2, ExternalLink } from 'lucide-react';
import { DownloadItem } from '../../types/browser';

interface DownloadsViewProps {
  downloads: DownloadItem[];
  onClearDownloads: () => void;
}

export const DownloadsView: React.FC<DownloadsViewProps> = ({
  downloads,
  onClearDownloads,
}) => {
  return (
    <div className="min-h-full bg-slate-900 text-slate-100 p-6 sm:p-10 max-w-4xl mx-auto select-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">التنزيلات الآمنة (Downloads)</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              الملفات التي قمت بتنزيلها عبر الفحص الأمني لدرع Aegis
            </p>
          </div>
        </div>

        {downloads.length > 0 && (
          <button
            type="button"
            onClick={onClearDownloads}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors self-start sm:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>مسح سجل التنزيلات</span>
          </button>
        )}
      </div>

      <div className="my-6 space-y-3">
        {downloads.map((item) => (
          <div
            key={item.id}
            className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">{item.filename}</h4>
                <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                  <span className="font-mono">{item.size}</span>
                  <span>·</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>فحص الأمان: ملف آمن وخالٍ من الفيروسات</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                مكتمل
              </span>
            </div>
          </div>
        ))}

        {downloads.length === 0 && (
          <div className="py-16 text-center text-slate-500 space-y-2">
            <Download className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-xs">لا توجد تنزيلات في السجل حالياً.</p>
          </div>
        )}
      </div>
    </div>
  );
};
