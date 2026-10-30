import React, { useState } from 'react';
import { Bookmark as BookmarkIcon, Plus, Trash2, Globe, Search, Folder, ExternalLink } from 'lucide-react';
import { Bookmark } from '../../types/browser';

interface BookmarksViewProps {
  bookmarks: Bookmark[];
  onNavigate: (url: string) => void;
  onAddBookmark: (title: string, url: string, category: string) => void;
  onDeleteBookmark: (id: string) => void;
}

export const BookmarksView: React.FC<BookmarksViewProps> = ({
  bookmarks,
  onNavigate,
  onAddBookmark,
  onDeleteBookmark,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState('عام');

  const categories = ['all', ...Array.from(new Set(bookmarks.map((b) => b.category || 'عام')))];

  const filteredBookmarks = bookmarks.filter((bm) => {
    const matchesSearch =
      bm.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bm.url.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || bm.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newUrl.trim()) return;
    const formattedUrl = newUrl.startsWith('http') ? newUrl : `https://${newUrl}`;
    onAddBookmark(newTitle.trim(), formattedUrl, newCategory);
    setNewTitle('');
    setNewUrl('');
    setShowAddModal(false);
  };

  return (
    <div className="min-h-full bg-slate-900 text-slate-100 p-6 sm:p-10 max-w-4xl mx-auto select-none">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-950/60 text-amber-400 border border-amber-800/40 flex items-center justify-center">
            <BookmarkIcon className="w-5 h-5 fill-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">مدير الإشارات المرجعية (Bookmarks)</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              تنظيم المواقع المحفوظة والوصول السريع إليها
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة إشارة مرجعية</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 my-6">
        <div className="flex items-center h-10 px-3 rounded-xl bg-slate-800 border border-slate-700/80 focus-within:border-emerald-500 flex-1">
          <Search className="w-4 h-4 text-slate-400 ml-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث في الإشارات المرجعية..."
            className="flex-1 bg-transparent border-none outline-none text-xs text-slate-200 placeholder-slate-500"
          />
        </div>

        {/* Categories Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto p-1 bg-slate-800/80 rounded-xl border border-slate-700/60">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat === 'all' ? 'جميع المجلدات' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Bookmarks Grid */}
      {filteredBookmarks.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredBookmarks.map((bm) => (
            <div
              key={bm.id}
              className="group p-3.5 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between"
            >
              <div
                onClick={() => onNavigate(bm.url)}
                className="flex items-center gap-3 overflow-hidden cursor-pointer flex-1"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-sm shrink-0">
                  {bm.favicon || '🌐'}
                </div>
                <div className="truncate">
                  <h4 className="text-xs font-semibold text-slate-200 hover:text-emerald-400 truncate">
                    {bm.title}
                  </h4>
                  <p className="text-[10px] text-slate-500 truncate" dir="ltr">
                    {bm.url}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                  {bm.category || 'عام'}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteBookmark(bm.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-rose-400 transition-all"
                  title="حذف الإشارة"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-slate-500 space-y-2">
          <BookmarkIcon className="w-8 h-8 mx-auto opacity-40" />
          <p className="text-xs">لم يتم العثور على أي إشارات مرجعية.</p>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 text-slate-100">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>إضافة إشارة مرجعية جديدة</span>
            </h3>
            <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">العنوان:</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="مثال: ويكيبيديا العربية"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">الرابط:</label>
                <input
                  type="text"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://ar.wikipedia.org"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 outline-none focus:border-emerald-500 direction-ltr text-left"
                  dir="ltr"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">التصنيف:</label>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="أخبار / تقنية / أبحاث"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 outline-none focus:border-emerald-500"
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
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
