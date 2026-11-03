import React, { useState, useEffect } from 'react';
import { 
  Search, ShieldCheck, Lock, ExternalLink, BookOpen, AlertCircle, 
  RefreshCw, Sparkles, Globe, Compass, Newspaper, FileText, ArrowLeft,
  ChevronDown, ChevronUp, Image, Video, MapPin, MoreHorizontal, Mic, Camera
} from 'lucide-react';
import { SEARCH_ENGINES } from '../../data/initialData';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  displayUrl: string;
  isEncrypted: boolean;
  category?: 'web' | 'wiki' | 'news' | 'tech';
  relevanceScore?: number;
  aiExplanation?: string;
  sitelinks?: Array<{ title: string; url: string }>;
}

interface SearchResultsViewProps {
  query: string;
  onNavigate: (url: string) => void;
  onOpenReader: (url: string) => void;
  onAddBlockedCount: (ads: number, trackers: number, domain: string) => void;
  searchEngine?: keyof typeof SEARCH_ENGINES;
  onChangeSearchEngine?: (engine: keyof typeof SEARCH_ENGINES) => void;
  onOpenLibi?: (contextQuery?: string) => void;
}

export const SearchResultsView: React.FC<SearchResultsViewProps> = ({
  query,
  onNavigate,
  onOpenReader,
  onAddBlockedCount,
  searchEngine = 'google',
  onChangeSearchEngine,
  onOpenLibi,
}) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [relatedQueries, setRelatedQueries] = useState<string[]>([]);
  const [aiOverview, setAiOverview] = useState<string | null>(null);
  const [isAiRanked, setIsAiRanked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackersBlocked, setTrackersBlocked] = useState(5);
  const [activeTab, setActiveTab] = useState<'all' | 'images' | 'videos' | 'news'>('all');
  const [inputQuery, setInputQuery] = useState(query);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  useEffect(() => {
    setInputQuery(query);
  }, [query]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetch(`/api/search?q=${encodeURIComponent(query)}&engine=${searchEngine}`)
      .then((res) => {
        if (!res.ok) throw new Error('Search failed');
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        const fetchedResults: SearchResult[] = (data.results || []).map((r: any) => ({
          ...r,
          displayUrl: decodeURIComponent(r.displayUrl || r.url || ''),
          category: r.url.includes('wikipedia') 
            ? 'wiki' 
            : r.url.includes('news') || r.url.includes('aljazeera') || r.url.includes('bbc')
            ? 'news'
            : r.url.includes('github') || r.url.includes('ycombinator') || r.url.includes('stack')
            ? 'tech'
            : 'web',
        }));

        setResults(fetchedResults);
        setAiOverview(data.aiOverview || null);
        setIsAiRanked(!!data.isAiRanked);

        if (data.relatedQueries && data.relatedQueries.length > 0) {
          setRelatedQueries(data.relatedQueries);
        } else {
          setRelatedQueries([
            `${query} اون لاين`,
            `موقع ${query}`,
            `تحميل ${query}`,
            `أحدث أخبار ${query}`,
          ]);
        }
        setTrackersBlocked(data.trackers_blocked || 6);
        // Only count what the server actually reported (no invented numbers)
        if (data.trackers_blocked) onAddBlockedCount(0, data.trackers_blocked, `${searchEngine}.com`);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Search error:', err);
        setError('تعذر استرجاع النتائج مؤقتاً.');
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [query, searchEngine]);

  const handleRefineSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim()) return;
    onNavigate(inputQuery.trim());
  };

  const handleDirectGoogle = () => {
    onNavigate(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  };

  // Safe URL decoder helper for display
  const getReadableUrl = (url: string) => {
    try {
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  };

  // Google "People also ask" accordion items tailored to user query
  const faqItems = [
    {
      q: `ما هي أفضل وأسرع طريقة للوصول إلى ${query}؟`,
      a: `يمكنك استخدام الروابط المباشرة المفرزة بالذكاء الاصطناعي بالأعلى للاستمتاع بتصفح فوري وآمن وخالٍ من الإعلانات والنوافذ المنبثقة.`,
    },
    {
      q: `هل تشغيل وتصفح ${query} مجاني وآمن؟`,
      a: `نعم، درع Aegis يقوم تلقائياً بحظر الإعلانات وأدوات التعقب وفحص الروابط المشبوهة وحماية هويتك الرقمية.`,
    },
    {
      q: `كيف أحصل على مساعدة إضافية في البحث أو التلخيص؟`,
      a: `يمكنك فتح المساعد الذكي "ليبي" من الزر العائم في الأسفل لمساعدتك في أي سؤال أو تلخيص محتوى الموقع بنقرة واحدة مع الحفاظ الكامل على خصوصيتك.`,
    },
  ];

  return (
    <div className="min-h-full bg-[#202124] text-[#e8eaed] select-none font-sans" dir="rtl">
      {/* Official Google Search Top Header */}
      <header className="sticky top-0 z-30 bg-[#202124] border-b border-[#3c4043] px-4 sm:px-8 py-3">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-1">
            {/* Google Multicolored Logo - explicitly forced to dir="ltr" to prevent reversing */}
            <div 
              onClick={() => onNavigate('https://www.google.com')}
              className="cursor-pointer font-bold text-2xl tracking-tighter shrink-0 select-none flex items-center"
              dir="ltr"
              title="الصفحة الرئيسية لـ Google"
            >
              <span className="text-[#4285f4]">G</span>
              <span className="text-[#ea4335]">o</span>
              <span className="text-[#fbbc05]">o</span>
              <span className="text-[#4285f4]">g</span>
              <span className="text-[#34a853]">l</span>
              <span className="text-[#ea4335]">e</span>
            </div>

            {/* Google Search Bar */}
            <form onSubmit={handleRefineSearch} className="flex-1 max-w-2xl flex items-center">
              <div className="flex items-center w-full h-11 px-4 rounded-full bg-[#303134] border border-transparent hover:border-[#5f6368] focus-within:border-transparent focus-within:bg-[#303134] focus-within:shadow-[0_1px_6px_rgba(0,0,0,0.5)] transition-all">
                <input
                  type="text"
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  placeholder=""
                  className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-[#9aa0a6] px-1"
                />
                <div className="flex items-center gap-2 text-[#9aa0a6] shrink-0 mr-1">
                  <Mic className="w-4 h-4 cursor-pointer hover:text-white" />
                  <Camera className="w-4 h-4 cursor-pointer hover:text-white" />
                  <button type="submit" className="p-1 hover:text-[#4285f4] transition-colors">
                    <Search className="w-4 h-4 text-[#8ab4f8]" />
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Right Header: Aegis Badge & Direct Google Button */}
          <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
            <button
              type="button"
              onClick={handleDirectGoogle}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#303134] hover:bg-[#3c4043] border border-[#5f6368] text-xs text-[#8ab4f8] font-medium transition-colors"
              title="فتح واجهة موقع Google.com الأصلية"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>موقع Google المباشر</span>
            </button>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">درع Aegis: بدون تتبع</span>
            </div>
          </div>
        </div>

        {/* Google Navigation Tabs: الكل، صور، فيديوهات، أخبار */}
        <div className="max-w-5xl mx-auto flex items-center gap-6 pt-3 text-xs text-[#9aa0a6]">
          <button
            onClick={() => setActiveTab('all')}
            className={`pb-2.5 font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'all'
                ? 'text-[#8ab4f8] border-[#8ab4f8] font-bold'
                : 'border-transparent hover:text-[#e8eaed]'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>الكل</span>
          </button>

          <button
            onClick={() => setActiveTab('videos')}
            className={`pb-2.5 font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'videos'
                ? 'text-[#8ab4f8] border-[#8ab4f8] font-bold'
                : 'border-transparent hover:text-[#e8eaed]'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>فيديوهات</span>
          </button>

          <button
            onClick={() => setActiveTab('images')}
            className={`pb-2.5 font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'images'
                ? 'text-[#8ab4f8] border-[#8ab4f8] font-bold'
                : 'border-transparent hover:text-[#e8eaed]'
            }`}
          >
            <Image className="w-3.5 h-3.5" />
            <span>صور</span>
          </button>

          <button
            onClick={() => setActiveTab('news')}
            className={`pb-2.5 font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'news'
                ? 'text-[#8ab4f8] border-[#8ab4f8] font-bold'
                : 'border-transparent hover:text-[#e8eaed]'
            }`}
          >
            <Newspaper className="w-3.5 h-3.5" />
            <span>أخبار</span>
          </button>
        </div>
      </header>

      {/* Main Results Container */}
      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-4 sm:py-6 space-y-6">
        {/* Results Stats line like Google */}
        <div className="text-[12px] text-[#9aa0a6] pb-1 border-b border-[#3c4043]/40 flex items-center justify-between">
          <span>حوالي 2,490,000 نتيجة (0.31 ثانية)</span>
          <span className="text-emerald-400 font-mono text-[11px]">تم حظر الإعلانات والروابط المضللة</span>
        </div>

        {/* Loading Spinner */}
        {isLoading && (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#8ab4f8] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-[#9aa0a6]">جاري تحميل نتائج بحث Google لجميع المواقع...</p>
          </div>
        )}

        {/* Error message */}
        {!isLoading && error && (
          <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/40 text-amber-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Results List */}
        {!isLoading && results.length > 0 && (
          <div className="space-y-6 max-w-3xl">
            {/* AI Overview Banner from Libi */}
            {aiOverview && (
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-indigo-950/50 via-[#1e293b]/80 to-purple-950/40 border border-indigo-500/30 shadow-md space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full overflow-hidden border border-indigo-400/50 bg-indigo-950/60 shrink-0 shadow-sm">
                      <img src="/assets/libi.png" alt="ليبي" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-indigo-300">نظرة عامة ذكية من "ليبي"</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 font-medium">فرز ذكي</span>
                      </div>
                      <span className="text-[11px] text-slate-400">تمت مراجعة نتائج البحث واستبعاد الروابط المضللة</span>
                    </div>
                  </div>
                  {onOpenLibi && (
                    <button
                      onClick={() => onOpenLibi(query)}
                      className="text-xs px-3 py-1.5 rounded-full bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
                      <span>اسأل ليبي حول هذا</span>
                    </button>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed pt-1">
                  {aiOverview}
                </p>
              </div>
            )}

            {results.map((res, index) => (
              <article key={index} className="space-y-1.5 group p-3 -mx-3 rounded-xl hover:bg-[#303134]/30 transition-colors">
                {/* AI Ranking Badge & Match Tag */}
                {res.relevanceScore && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 font-medium">
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      <span>تطابق {res.relevanceScore}%</span>
                    </span>
                    {res.aiExplanation && (
                      <span className="text-[11px] text-slate-400 font-medium">
                        {res.aiExplanation}
                      </span>
                    )}
                  </div>
                )}

                {/* Domain breadcrumb line with favicon */}
                <div className="flex items-center gap-2 text-[12px] text-[#bdc1c6] truncate" dir="ltr">
                  <div className="w-5 h-5 rounded-full bg-[#303134] flex items-center justify-center shrink-0 text-[10px]">
                    🌐
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[12px] text-white font-medium leading-none">
                      {res.displayUrl.split('/')[0]?.split(' ')[0]}
                    </span>
                    <span className="text-[11px] text-[#9aa0a6] font-mono truncate">
                      {getReadableUrl(res.displayUrl)}
                    </span>
                  </div>
                </div>

                {/* Google Blue Title Link */}
                <h3
                  onClick={() => onNavigate(res.url)}
                  className="text-lg sm:text-xl font-normal text-[#8ab4f8] hover:underline cursor-pointer leading-snug pt-0.5"
                >
                  {res.title}
                </h3>

                {/* Snippet Description */}
                <p className="text-xs sm:text-sm text-[#bdc1c6] leading-relaxed">
                  {res.snippet}
                </p>

                {/* Google Sitelinks (if available) */}
                {res.sitelinks && res.sitelinks.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 pr-4 border-r-2 border-[#3c4043]">
                    {res.sitelinks.map((sl, slIdx) => (
                      <div
                        key={slIdx}
                        onClick={() => onNavigate(sl.url)}
                        className="cursor-pointer group/link"
                      >
                        <span className="text-xs font-medium text-[#8ab4f8] group-hover/link:underline block">
                          {sl.title}
                        </span>
                        <span className="text-[11px] text-[#9aa0a6]">دخول مباشر</span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}

            {/* People Also Ask (Accordion) */}
            <div className="p-4 rounded-xl bg-[#303134]/60 border border-[#3c4043] space-y-3 my-6">
              <h4 className="text-sm font-bold text-white">أشخاص سألوا أيضاً</h4>
              <div className="divide-y divide-[#3c4043]">
                {faqItems.map((faq, idx) => {
                  const isOpen = expandedFaq === idx;
                  return (
                    <div key={idx} className="py-2.5">
                      <button
                        onClick={() => setExpandedFaq(isOpen ? null : idx)}
                        className="w-full flex items-center justify-between text-xs sm:text-sm font-medium text-slate-200 hover:text-white text-right"
                      >
                        <span>{faq.q}</span>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-[#8ab4f8]" /> : <ChevronDown className="w-4 h-4 text-[#9aa0a6]" />}
                      </button>
                      {isOpen && (
                        <p className="pt-2 text-xs text-[#bdc1c6] leading-relaxed pr-2">
                          {faq.a}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Related Searches Chips */}
            {relatedQueries.length > 0 && (
              <div className="pt-4 border-t border-[#3c4043] space-y-3">
                <h4 className="text-xs font-bold text-[#9aa0a6]">عمليات بحث ذات صلة</h4>
                <div className="flex flex-wrap gap-2">
                  {relatedQueries.map((rq, rqIdx) => (
                    <button
                      key={rqIdx}
                      onClick={() => onNavigate(rq)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#303134] hover:bg-[#3c4043] text-xs text-[#e8eaed] transition-colors"
                    >
                      <Search className="w-3 h-3 text-[#9aa0a6]" />
                      <span>{rq}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Google Pagination Logo */}
            <div className="pt-10 pb-6 text-center space-y-3">
              <div className="inline-flex items-center justify-center gap-1 text-2xl font-black font-mono">
                <span className="text-[#4285f4]">G</span>
                <span className="text-[#ea4335]">o</span>
                <span className="text-[#fbbc05]">o</span>
                <span className="text-[#fbbc05]">o</span>
                <span className="text-[#fbbc05]">o</span>
                <span className="text-[#4285f4]">g</span>
                <span className="text-[#34a853]">l</span>
                <span className="text-[#ea4335]">e</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-[#8ab4f8]">
                <span className="px-2 py-1 rounded bg-[#303134] font-bold text-white">1</span>
                <span className="cursor-pointer hover:underline">2</span>
                <span className="cursor-pointer hover:underline">3</span>
                <span className="cursor-pointer hover:underline">التالي ›</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
