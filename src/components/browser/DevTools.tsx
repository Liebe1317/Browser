import React, { useMemo, useState } from 'react';
import {
  Activity, Terminal, ShieldCheck, Database, X, Trash2, Filter,
  Search, MoreVertical, CircleHelp, Columns3,
} from 'lucide-react';
import { NetworkRequest } from '../../types/browser';

interface DevToolsProps {
  currentUrl: string;
  networkRequests: NetworkRequest[];
  onClose: () => void;
  onClearLogs: () => void;
}

type DevToolsTab = 'network' | 'console' | 'security' | 'storage';

export const DevTools: React.FC<DevToolsProps> = ({
  currentUrl,
  networkRequests,
  onClose,
  onClearLogs,
}) => {
  const [activeTab, setActiveTab] = useState<DevToolsTab>('network');
  const [networkFilter, setNetworkFilter] = useState<'all' | 'blocked' | 'allowed'>('all');
  const [filterText, setFilterText] = useState('');

  const filteredRequests = useMemo(() => networkRequests.filter((req) => {
    const statusMatches =
      networkFilter === 'all' ||
      (networkFilter === 'blocked' && req.status === 'blocked') ||
      (networkFilter === 'allowed' && (req.status === 'allowed' || req.status === 'pending'));
    const textMatches = !filterText ||
      req.url.toLowerCase().includes(filterText.toLowerCase()) ||
      (req.type || '').toLowerCase().includes(filterText.toLowerCase()) ||
      (req.method || '').toLowerCase().includes(filterText.toLowerCase());
    return statusMatches && textMatches;
  }), [networkRequests, networkFilter, filterText]);

  const tabs: { id: DevToolsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'console', label: 'Console', icon: <Terminal size={13} /> },
    { id: 'network', label: 'Network', icon: <Activity size={13} /> },
    { id: 'security', label: 'Security', icon: <ShieldCheck size={13} /> },
    { id: 'storage', label: 'Application', icon: <Database size={13} /> },
  ];

  return (
    <section
      className="h-72 min-h-[250px] w-full shrink-0 flex flex-col border-t border-[#3c4043] bg-[#202124] text-[#e8eaed] shadow-[0_-8px_24px_rgba(0,0,0,0.28)] select-none"
      aria-label="Developer Tools"
    >
      {/* Chrome DevTools-style window toolbar */}
      <div className="h-9 min-h-9 flex items-center justify-between border-b border-[#3c4043] bg-[#292a2d] px-2">
        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
          <span className="mr-2 flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-[#bdc1c6]">
            <Columns3 size={14} className="text-[#8ab4f8]" />
            DevTools
          </span>
          <div className="flex h-full min-w-0 items-center gap-0.5 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex h-8 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[11px] transition-colors ${
                  activeTab === tab.id
                    ? 'border-[#8ab4f8] bg-[#202124] text-[#8ab4f8]'
                    : 'border-transparent text-[#bdc1c6] hover:bg-[#35363a] hover:text-[#e8eaed]'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-1 text-[#9aa0a6]">
          <button type="button" className="rounded p-1.5 hover:bg-[#3c4043] hover:text-white" title="Help">
            <CircleHelp size={14} />
          </button>
          <button type="button" className="rounded p-1.5 hover:bg-[#3c4043] hover:text-white" title="More options">
            <MoreVertical size={14} />
          </button>
          <button type="button" onClick={onClose} className="rounded p-1.5 hover:bg-[#5f3033] hover:text-white" title="Close DevTools">
            <X size={15} />
          </button>
        </div>
      </div>

      {activeTab === 'network' && (
        <>
          {/* Network controls */}
          <div className="flex min-h-10 flex-wrap items-center gap-2 border-b border-[#3c4043] bg-[#202124] px-3 py-1.5 text-[11px]">
            <button type="button" onClick={onClearLogs} title="Clear network log" className="rounded p-1.5 text-[#bdc1c6] hover:bg-[#3c4043] hover:text-white">
              <Trash2 size={14} />
            </button>
            <button type="button" className="rounded p-1.5 text-[#bdc1c6] hover:bg-[#3c4043]" title="Filter requests">
              <Filter size={14} />
            </button>
            <label className="flex h-7 min-w-[150px] max-w-[260px] flex-1 items-center gap-2 rounded border border-[#5f6368] bg-[#292a2d] px-2 text-[#9aa0a6] focus-within:border-[#8ab4f8]">
              <Search size={13} />
              <input
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
                placeholder="Filter"
                className="w-full min-w-0 bg-transparent text-[11px] text-[#e8eaed] outline-none placeholder:text-[#9aa0a6]"
              />
            </label>
            <div className="flex items-center gap-1 rounded border border-[#5f6368] bg-[#292a2d] p-0.5">
              {([
                ['all', `All · ${networkRequests.length}`],
                ['blocked', `Blocked · ${networkRequests.filter(r => r.status === 'blocked').length}`],
                ['allowed', `Allowed · ${networkRequests.filter(r => r.status === 'allowed' || r.status === 'pending').length}`],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setNetworkFilter(value)}
                  className={`rounded px-2 py-1 text-[10px] ${
                    networkFilter === value ? 'bg-[#3c4043] text-[#e8eaed]' : 'text-[#bdc1c6] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="ml-auto whitespace-nowrap text-[10px] text-[#9aa0a6]">{filteredRequests.length} requests</span>
          </div>

          {/* Current page context */}
          <div className="flex min-h-7 items-center gap-2 border-b border-[#3c4043] bg-[#292a2d] px-3 text-[10px] text-[#9aa0a6]">
            <span className="text-[#8ab4f8]">Page:</span>
            <span className="truncate" dir="ltr" title={currentUrl}>{currentUrl || 'No page selected'}</span>
          </div>

          {/* Network request grid */}
          <div className="min-h-0 flex-1 overflow-auto bg-[#202124]">
            <table className="w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-[#292a2d] text-[#bdc1c6]">
                <tr className="h-7 border-b border-[#3c4043]">
                  <th className="w-16 px-3 font-medium">Status</th>
                  <th className="min-w-[220px] px-3 font-medium">Name</th>
                  <th className="w-20 px-3 font-medium">Method</th>
                  <th className="w-28 px-3 font-medium">Type</th>
                  <th className="w-20 px-3 font-medium">HTTP</th>
                  <th className="w-20 px-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req) => (
                  <tr
                    key={req.id}
                    className={`h-7 border-b border-[#303134] hover:bg-[#292a2d] ${
                      req.status === 'blocked' ? 'text-[#f28b82]'
                        : req.status === 'failed' ? 'text-[#fdd663]'
                        : 'text-[#e8eaed]'
                    }`}
                  >
                    <td className="px-3 font-mono text-[10px]">
                      {req.status === 'blocked' ? 'Blocked' : req.status === 'failed' ? 'Failed' : req.status === 'pending' ? 'Pending' : req.statusCode ?? 'Done'}
                    </td>
                    <td className="max-w-[520px] truncate px-3" dir="ltr" title={req.url}>{req.url}</td>
                    <td className="px-3 text-[#bdc1c6]">{req.method || '—'}</td>
                    <td className="px-3 text-[#bdc1c6]">{req.type || '—'}</td>
                    <td className="px-3 text-[#bdc1c6]">{req.statusCode ?? '—'}</td>
                    <td className="px-3 text-[#bdc1c6]">{req.duration !== undefined ? `${Math.round(req.duration)} ms` : '—'}</td>
                  </tr>
                ))}
                {filteredRequests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="h-20 px-4 text-center text-[11px] text-[#9aa0a6]">
                      {networkRequests.length === 0 ? 'No network activity recorded' : 'No requests match the current filters'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex h-6 min-h-6 items-center gap-4 border-t border-[#3c4043] bg-[#292a2d] px-3 text-[10px] text-[#9aa0a6]">
            <span>{filteredRequests.length} requests</span>
            <span>{networkRequests.filter(r => r.status === 'blocked').length} blocked by Aegis Shield</span>
          </div>
        </>
      )}

      {activeTab === 'console' && (
        <div className="min-h-0 flex-1 overflow-auto bg-[#202124] p-3 font-mono text-[11px]">
          <div className="mb-2 flex items-center gap-2 text-[#8ab4f8]"><Terminal size={13} /> Console</div>
          <div className="border-b border-[#3c4043] py-2 text-[#bdc1c6]">Aegis browser diagnostics</div>
          {networkRequests.filter(r => r.status === 'blocked' || r.status === 'failed').map((req) => (
            <div key={req.id} className="border-b border-[#3c4043] py-1.5 text-[#f28b82]">
              [{req.status.toUpperCase()}] {req.domain} — {req.reason || req.url}
            </div>
          ))}
          {networkRequests.every(r => r.status !== 'blocked' && r.status !== 'failed') && (
            <div className="py-2 text-[#9aa0a6]">No captured errors or blocked requests.</div>
          )}
        </div>
      )}

      {activeTab === 'security' && (
        <div className="min-h-0 flex-1 overflow-auto bg-[#202124] p-4 text-[11px]">
          <div className="mb-3 flex items-center gap-2 text-[#8ab4f8]"><ShieldCheck size={15} /> Security overview</div>
          <div className="rounded border border-[#3c4043] bg-[#292a2d] p-3">
            <div className="mb-2 text-[#e8eaed]">Current page</div>
            <div className="break-all text-[#bdc1c6]" dir="ltr">{currentUrl || 'No page selected'}</div>
            <div className="mt-3 text-[#9aa0a6]">Transport and certificate details are not exposed by the current browser diagnostics API.</div>
          </div>
        </div>
      )}

      {activeTab === 'storage' && (
        <div className="min-h-0 flex-1 overflow-auto bg-[#202124] p-4 text-[11px]">
          <div className="mb-3 flex items-center gap-2 text-[#8ab4f8]"><Database size={15} /> Application</div>
          <div className="rounded border border-[#3c4043] bg-[#292a2d] p-3">
            <div className="mb-2 text-[#e8eaed]">Storage isolation</div>
            <p className="leading-5 text-[#bdc1c6]">Aegis maintains isolated site storage partitions. Detailed cookie and storage inspection is not yet available in this panel.</p>
          </div>
        </div>
      )}
    </section>
  );
};
