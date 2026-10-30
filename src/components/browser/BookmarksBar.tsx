import React from 'react';
import { Bookmark as BookmarkIcon, Folder, Globe, Plus } from 'lucide-react';
import { Bookmark } from '../../types/browser';

interface BookmarksBarProps {
  bookmarks: Bookmark[];
  onNavigate: (url: string) => void;
  onOpenBookmarksManager: () => void;
}

export const BookmarksBar: React.FC<BookmarksBarProps> = ({
  bookmarks,
  onNavigate,
  onOpenBookmarksManager,
}) => {
  return (
    <div 
      className="flex items-center h-7.5 px-3 border-b text-[11px] text-slate-300 gap-1 select-none overflow-x-auto no-scrollbar transition-colors"
      style={{
        backgroundColor: 'var(--theme-bg-surface, #0c221c)',
        borderColor: 'var(--theme-border, #17473a)',
      }}
    >
      {/* Chrome Apps / Bookmarks manager icon */}
      <button
        type="button"
        onClick={onOpenBookmarksManager}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors shrink-0"
        title="مدير الإشارات المرجعية (Ctrl+Shift+O)"
      >
        <Folder className="w-3.5 h-3.5 text-amber-400" />
        <span>جميع الإشارات</span>
      </button>

      <div className="w-[1px] h-3.5 bg-slate-800 mx-1 shrink-0" />

      {/* Bookmarks List */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {bookmarks.slice(0, 10).map((bm) => (
          <button
            key={bm.id}
            type="button"
            onClick={() => onNavigate(bm.url)}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors max-w-[150px] truncate shrink-0"
            title={bm.title}
          >
            {bm.favicon ? (
              <span className="text-xs leading-none shrink-0">{bm.favicon}</span>
            ) : (
              <Globe className="w-3 h-3 text-slate-400 shrink-0" />
            )}
            <span className="truncate">{bm.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
