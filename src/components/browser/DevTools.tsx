import React, { useState } from 'react';
import { Terminal, Activity, Lock, Database, X, Trash2, Filter, AlertCircle, CheckCircle2 } from 'lucide-react';
import { NetworkRequest } from '../../types/browser';

interface DevToolsProps {
  currentUrl: string;
  networkRequests: NetworkRequest[];
  onClose: () => void;
  onClearLogs: () => void;
}

export const DevTools: React.FC<DevToolsProps> = ({
  currentUrl,
  networkRequests,
  onClose,
  onClearLogs,
}) => {
  const [activeTab, setActiveTab] = useState<'network' | 'console' | 'security' | 'storage'>('network');
  const [networkFilter, setNetworkFilter] = useState<'all' | 'blocked' | 'allowed'>('all');

  const filteredRequests = networkRequests.filter((req) => {
    if (networkFilter === 'blocked') return req.status === 'blocked';
    if (networkFilter === 'allowed') return req.status === 'allowed' || req.status === 'pending';
    return true;
  });

  return (
    <div className="h-64 bg-slate-950 border-t border-slate-700/80 flex flex-col font-mono text-xs select-none shadow-2xl">
      {/* DevTools Top Bar */}
      <div className="flex items-center justify-between px-3 h-8 bg-slate-900 border-b border-slate-800 text-slate-300">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('network')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-t text-xs font-medium transition-colors ${
              activeTab === 'network'
                ? 'bg-slate-950 text-emerald-400 border-t-2 border-emerald-500'
                : 'hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>الشبكة (Network)</span>
            <span className="text-[10px] px-1 rounded bg-slate-800 text-slate-400">
              {networkRequests.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('console')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-t text-xs font-medium transition-colors ${
              activeTab === 'console'
                ? 'bg-slate-950 text-emerald-400 border-t-2 border-emerald-500'
                : 'hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>الطرفية (Console)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-t text-xs font-medium transition-colors ${
              activeTab === 'security'
                ? 'bg-slate-950 text-emerald-400 border-t-2 border-emerald-500'
                : 'hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>الأمان (Security)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('storage')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-t text-xs font-medium transition-colors ${
              activeTab === 'storage'
                ? 'bg-slate-950 text-emerald-400 border-t-2 border-emerald-500'
                : 'hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>ملفات الارتباط (Cookies)</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClearLogs}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
            title="مسح السجلات"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded"
            title="إغلاق DevTools"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* DevTools Body */}
      <div className="flex-1 overflow-auto p-2 bg-slate-950 text-slate-300">
        {activeTab === 'network' && (
          <div className="space-y-2">
            {/* Filter buttons */}
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-[11px]">
              <span className="text-slate-500 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                <span>تصفية:</span>
              </span>
              <button
                type="button"
                onClick={() => setNetworkFilter('all')}
                className={`px-2 py-0.5 rounded ${networkFilter === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400'}`}
              >
                الكل ({networkRequests.length})
              </button>
              <button
                type="button"
                onClick={() => setNetworkFilter('blocked')}
                className={`px-2 py-0.5 rounded ${networkFilter === 'blocked' ? 'bg-rose-950 text-rose-300 font-bold' : 'text-slate-400'}`}
              >
                المحظورة بالدرع ({networkRequests.filter(r => r.status === 'blocked').length})
              </button>
              <button
                type="button"
                onClick={() => setNetworkFilter('allowed')}
                className={`px-2 py-0.5 rounded ${networkFilter === 'allowed' ? 'bg-emerald-950 text-emerald-300 font-bold' : 'text-slate-400'}`}
              >
                المصرح بها ({networkRequests.filter(r => r.status === 'allowed').length})
              </button>
            </div>

            {/* Network Table */}
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800 text-[10px]">
                  <th className="py-1 px-2">الحالة</th>
                  <th className="py-1 px-2">الطلب / URL</th>
                  <th className="py-1 px-2">الطريقة</th>
                  <th className="py-1 px-2">النوع</th>
                  <th className="py-1 px-2">الحجم</th>
                  <th className="py-1 px-2">الزمن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-[11px]">
                {filteredRequests.map((req) => (
                  <tr
                    key={req.id}
                    className={`hover:bg-slate-900/60 ${
                      req.status === 'blocked' ? 'text-rose-400 bg-rose-950/15'
                        : req.status === 'failed' ? 'text-amber-300 bg-amber-950/10'
                        : 'text-slate-300'
                    }`}
                  >
                    <td className="py-1 px-2 font-mono">
                      <span className={`px-1.5 py-0.5 rounded border text-[9px] ${
                        req.status === 'blocked' ? 'bg-rose-950 text-rose-400 border-rose-900/40'
                        : req.status === 'failed' ? 'bg-amber-950 text-amber-300 border-amber-900/40'
                        : req.status === 'pending' ? 'bg-sky-950 text-sky-300 border-sky-900/40'
                        : 'bg-emerald-950 text-emerald-400 border-emerald-900/40'
                      }`}>
                        {req.status === 'blocked' ? 'BLOCKED' : req.status === 'failed' ? 'FAILED' : req.status === 'pending' ? 'PENDING' : (req.statusCode ? `${req.statusCode}` : 'DONE')}
                      </span>
                    </td>
                    <td className="py-1 px-2 truncate max-w-[360px]" dir="ltr" title={req.url}>{req.url}</td>
                    <td className="py-1 px-2 text-slate-400">{req.method || '—'}</td>
                    <td className="py-1 px-2 text-slate-400">{req.type}</td>
                    <td className="py-1 px-2 text-slate-500">{req.size}</td>
                    <td className="py-1 px-2 text-slate-500">{req.duration}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'console' && (
          <div className="space-y-1.5 font-mono text-[11px]">
            <div className="text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>[AegisShield] الدرع يحجب الإعلانات والتتبع بحسب اسم النطاق، وكل الطلبات تمر عبر الوكيل.</span>
            </div>
            <div className="text-cyan-400">
              [PrivacyGuard] إشارتا Sec-GPC وDNT تُرسلان إلى المواقع إذا كان الإعداد مفعّلاً.
            </div>
            {networkRequests
              .filter((r) => r.status === 'blocked')
              .map((r) => (
                <div key={r.id} className="text-rose-400/90">
                  [Blocked by Shield] Request to {r.domain} blocked (Rule: {r.reason || 'adware/tracker'}).
                </div>
              ))}
          </div>
        )}

        {activeTab === 'security' && (
          <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <Lock className="w-4 h-4" />
              <span>الاتصال بين الخادم والموقع</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-slate-400 text-[11px] pt-2 border-t border-slate-800">
              <div>
                <span className="block text-slate-500">التشفير:</span>
                <span className="text-slate-200">HTTPS، والتحقق من الشهادة يتم على الخادم</span>
              </div>
              <div>
                <span className="block text-slate-500">الاتصال المباشر من الصفحات:</span>
                <span className="text-slate-200">ممنوع، كل شيء عبر الوكيل</span>
              </div>
              <div>
                <span className="block text-slate-500">عزل الصفحات:</span>
                <span className="text-emerald-400">أصل معزول (Sandbox)</span>
              </div>
              <div>
                <span className="block text-slate-500">تسريب WebRTC:</span>
                <span className="text-amber-400">حماية جزئية، ويمكن تجاوزها</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'storage' && (
          <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-xs space-y-2">
            <h4 className="font-bold text-slate-200">عزل ملفات تعريف الارتباط (Cookie Jar)</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              ملفات الارتباط تُحفظ على الخادم داخل جلستك، في قسم مستقل لكل موقع. لا يستطيع موقع استخدام ملفات موقع آخر.
              عند تفعيل حجب ملفات الطرف الثالث لا تُرسَل ولا تُخزَّن ملفات الأطراف الخارجية.
            </p>
            <div className="p-2 rounded bg-slate-950 font-mono text-[10px] text-emerald-400">
              تُمسح عند قفل الخزنة أو مسح البيانات أو التدمير الذاتي.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
