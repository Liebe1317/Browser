import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Search, Lock, 
  Share2, Maximize2, ExternalLink, Flame, Film,
  ThumbsUp, ThumbsDown, Bookmark, Download, Check, MessageSquare,
  Bell, X, MoreHorizontal, CheckCircle2
} from 'lucide-react';

interface YouTubeViewProps {
  initialVideoId?: string;
  onNavigate: (url: string) => void;
  onAddBlockedCount: (ads: number, trackers: number, domain: string) => void;
}

interface YouTubeVideo {
  id: string;
  title: string;
  channel: string;
  channelAvatar?: string;
  views: string;
  time: string;
  duration: string;
  thumbnail: string;
  category?: string;
  verified?: boolean;
}

interface CommentItem {
  id: string;
  author: string;
  avatar: string;
  time: string;
  text: string;
  likes: number;
}

export const YouTubeView: React.FC<YouTubeViewProps> = ({
  initialVideoId,
  onNavigate,
  onAddBlockedCount,
}) => {
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(initialVideoId || null);
  const [activeVideo, setActiveVideo] = useState<YouTubeVideo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [relatedVideos, setRelatedVideos] = useState<YouTubeVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const requestControllerRef = useRef<AbortController | null>(null);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [likesCount, setLikesCount] = useState(48200);
  const [hasLiked, setHasLiked] = useState(false);
  const [hasDisliked, setHasDisliked] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showWebviewDirect, setShowWebviewDirect] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([
    {
      id: 'c-1',
      author: 'عمر التميمي',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop',
      time: 'منذ يومين',
      text: 'المشاهدة هنا مريحة جداً وبدون أي انقطاع بسبب الإعلانات المزعجة! جودة الفيديو والصوت ممتازة.',
      likes: 342,
    },
    {
      id: 'c-2',
      author: 'سارة خالد',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop',
      time: 'منذ 5 ساعات',
      text: 'شكراً جزيلاً على توفير تجربة يوتيوب طبيعية وسلسة، تفتح الفيديوهات على الفور بدون تأخير.',
      likes: 89,
    },
    {
      id: 'c-3',
      author: 'أحمد نبيل',
      avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&h=100&fit=crop',
      time: 'منذ ساعة',
      text: 'أفضل شيء أنه يدعم ملء الشاشة ونمط المسرح مع حماية الخصوصية التامة.',
      likes: 19,
    },
    {
      id: 'c-4',
      author: 'فاطمة الزهراء',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop',
      time: 'منذ 3 ساعات',
      text: 'مقطع رائع جداً، الصوت نقي والدقة عالية!',
      likes: 54,
    },
  ]);
  const [newCommentText, setNewCommentText] = useState('');

  // Fetch only real results from the server. Never disguise stale/demo data as live YouTube content.
  const loadVideos = async (cat: string, query?: string) => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setIsLoading(true);
    setFeedError('');
    try {
      const endpoint = query
        ? `/api/youtube/search?q=${encodeURIComponent(query)}`
        : `/api/youtube/feed?category=${encodeURIComponent(cat)}`;
      const res = await fetch(endpoint, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(res.status === 502 ? 'تعذر الوصول إلى خدمة YouTube حالياً.' : 'تعذر تحميل نتائج YouTube.');
      const data: unknown = await res.json();
      if (!data || typeof data !== 'object' || !Array.isArray((data as { results?: unknown }).results)) {
        throw new Error('استجابة YouTube غير صالحة.');
      }
      const results = (data as { results: YouTubeVideo[] }).results;
      setVideos(results);
      setRelatedVideos(results.slice(0, 15));
      if (!currentVideoId && initialVideoId) setCurrentVideoId(initialVideoId);
      if (results.length === 0) setFeedError('لم يتم العثور على فيديوهات في هذه النتيجة.');
    } catch (error) {
      if (controller.signal.aborted) return;
      setVideos([]);
      setRelatedVideos([]);
      setFeedError(error instanceof Error ? error.message : 'تعذر تحميل YouTube.');
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadVideos(activeCategory);
    return () => requestControllerRef.current?.abort();
  }, [activeCategory]);

  useEffect(() => {
    if (initialVideoId) {
      setCurrentVideoId(initialVideoId);
    }
  }, [initialVideoId]);

  useEffect(() => {
    if (currentVideoId) {
      const found = videos.find((v) => v.id === currentVideoId) || 
                    relatedVideos.find((v) => v.id === currentVideoId);
      if (found) {
        setActiveVideo(found);
      } else {
        setActiveVideo({
          id: currentVideoId,
          title: 'تشغيل فيديو YouTube',
          channel: 'قناة YouTube',
          views: 'مشاهدة مباشرة',
          time: 'الآن',
          duration: 'تشغيل',
          thumbnail: `https://img.youtube.com/vi/${currentVideoId}/hqdefault.jpg`,
          verified: true,
        });
      }
    }
  }, [currentVideoId, videos, relatedVideos]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    let extractedId: string | null = null;
    if (/^[A-Za-z0-9_-]{11}$/.test(query)) {
      extractedId = query;
    } else {
      try {
        const parsed = new URL(query);
        const host = parsed.hostname.toLowerCase().replace(/^www\\./, '');
        if (host === 'youtu.be') {
          extractedId = parsed.pathname.split('/').filter(Boolean)[0] || null;
        } else if (host === 'youtube.com' || host === 'm.youtube.com') {
          if (parsed.pathname === '/watch') extractedId = parsed.searchParams.get('v');
          else extractedId = parsed.pathname.match(/^\\/(?:embed|shorts|live)\\/([A-Za-z0-9_-]{11})/)?.[1] || null;
        }
      } catch {
        // A plain search query is not a URL.
      }
    }

    if (extractedId && /^[A-Za-z0-9_-]{11}$/.test(extractedId)) {
      setCurrentVideoId(extractedId);
      setSearchQuery(query);
      return;
    }

    setCurrentVideoId(null);
    void loadVideos(activeCategory, query);
  };

  const handleSelectVideo = (video: YouTubeVideo) => {
    setCurrentVideoId(video.id);
    setActiveVideo(video);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLike = () => {
    if (hasLiked) {
      setHasLiked(false);
      setLikesCount((c) => c - 1);
    } else {
      setHasLiked(true);
      if (hasDisliked) setHasDisliked(false);
      setLikesCount((c) => c + 1);
    }
  };

  const handleDislike = () => {
    if (hasDisliked) {
      setHasDisliked(false);
    } else {
      setHasDisliked(true);
      if (hasLiked) {
        setHasLiked(false);
        setLikesCount((c) => c - 1);
      }
    }
  };

  const handleShare = () => {
    const url = currentVideoId 
      ? `https://www.youtube.com/watch?v=${currentVideoId}`
      : 'https://youtube.com';
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    const newC: CommentItem = {
      id: `c-${Date.now()}`,
      author: 'أنت',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop',
      time: 'الآن',
      text: newCommentText.trim(),
      likes: 1,
    };
    setComments([newC, ...comments]);
    setNewCommentText('');
  };

  const categories = [
    { id: 'all', label: 'الكل' },
    { id: 'anime', label: 'أنمي' },
    { id: 'gaming', label: 'ألعاب فيديو' },
    { id: 'music', label: 'موسيقى' },
    { id: 'podcast', label: 'بودكاست' },
    { id: 'tech', label: 'تقنية وبرمجة' },
    { id: 'news', label: 'أخبار' },
    { id: 'comedy', label: 'كوميديا' },
    { id: 'education', label: 'تعليم' },
  ];

  if (showWebviewDirect) {
    return (
      <div className="relative w-full h-full flex flex-col bg-[#0f0f0f]">
        <div className="px-4 py-2 bg-[#181818] border-b border-[#272727] flex items-center justify-between text-xs">
          <span className="text-white font-bold">موقع YouTube المباشر</span>
          <button
            onClick={() => setShowWebviewDirect(false)}
            className="px-3 py-1 rounded-full bg-[#272727] hover:bg-[#383838] text-white font-semibold transition-colors"
          >
            العودة لمشغل YouTube
          </button>
        </div>
        <iframe
          src="/api/proxy?url=https://m.youtube.com"
          title="Direct YouTube"
          sandbox="allow-scripts allow-forms allow-popups allow-presentation"
          className="w-full flex-1 border-none bg-black"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0f0f0f] text-[#f1f1f1] flex flex-col select-none font-sans" dir="rtl">
      {/* Official YouTube Header */}
      <header className="sticky top-0 z-40 px-4 py-2 bg-[#0f0f0f]/95 border-b border-[#272727] backdrop-blur-md flex items-center justify-between gap-3">
        {/* Left: YouTube Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <div 
            onClick={() => { setCurrentVideoId(null); setActiveVideo(null); }}
            className="flex items-center gap-1.5 cursor-pointer group"
          >
            <div className="w-8 h-6 rounded-[7px] bg-[#ff0000] flex items-center justify-center shadow-md shadow-red-600/20 group-hover:scale-105 transition-transform">
              <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5" />
            </div>
            <span className="text-lg font-black tracking-tighter text-white flex items-center gap-1">
              YouTube
              <span className="text-[10px] text-slate-400 font-normal">AR</span>
            </span>
          </div>
        </div>

        {/* Center: Real YouTube Search Box - Empty placeholder */}
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-2xl mx-2 flex items-center">
          <div className="flex items-center w-full h-10 rounded-full bg-[#121212] border border-[#303030] focus-within:border-[#1c62b9] focus-within:ring-1 focus-within:ring-[#1c62b9] overflow-hidden transition-all">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder=""
              className="flex-1 px-4 bg-transparent border-none outline-none text-xs text-white placeholder-[#888888]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              className="h-full px-5 bg-[#222222] hover:bg-[#272727] border-s border-[#303030] flex items-center justify-center text-slate-300 hover:text-white transition-colors"
              title="بحث"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Right Action Icons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowWebviewDirect(true)}
            className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#272727] hover:bg-[#383838] text-slate-300 text-[11px] font-medium transition-colors"
            title="فتح واجهة موقع YouTube المباشرة"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>موقع الويب</span>
          </button>

          <div className="w-8 h-8 rounded-full bg-[#272727] flex items-center justify-center text-white cursor-pointer hover:bg-[#383838] transition-colors">
            <Bell className="w-4 h-4 text-slate-300" />
          </div>

          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-slate-950 font-bold text-xs shadow-sm">
            A
          </div>
        </div>
      </header>

      {/* Category Pills Bar (Shown on Home or Header) */}
      <div className="px-4 py-2 border-b border-[#272727] bg-[#0f0f0f] flex items-center gap-2 overflow-x-auto no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setActiveCategory(cat.id);
              setCurrentVideoId(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeCategory === cat.id && !currentVideoId
                ? 'bg-white text-black'
                : 'bg-[#272727] text-white hover:bg-[#383838]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 max-w-[1700px] mx-auto w-full">
        {/* WATCH PAGE: Video + Comments next to Recommended Videos */}
        {currentVideoId ? (
          <div className="space-y-4">
            {/* If Theater Mode is on, full width player at the top */}
            {isTheaterMode && (
              <div className="w-full aspect-video max-h-[75vh] rounded-2xl overflow-hidden bg-black shadow-2xl border border-[#272727] mb-4">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${currentVideoId}?autoplay=1&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1`}
                  title={activeVideo?.title || 'YouTube Video Player'}
                  className="w-full h-full border-none"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                  allowFullScreen
                />
              </div>
            )}

            {/* Desktop Two-Column Layout: Main Column (Player/Comments) + Side Column (Recommended Videos) */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              {/* Primary Column: Video Player (if not theater) + Video Info + Comments Section */}
              <div className="flex-1 w-full min-w-0 space-y-4">
                {!isTheaterMode && (
                  <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl border border-[#272727]">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${currentVideoId}?autoplay=1&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1`}
                      title={activeVideo?.title || 'YouTube Video Player'}
                      className="w-full h-full border-none"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                      allowFullScreen
                    />
                  </div>
                )}

                {/* Video Title */}
                <h1 className="text-lg sm:text-xl font-bold text-white leading-snug">
                  {activeVideo?.title || 'فيديو يوتيوب'}
                </h1>

                {/* Channel Row & Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-4 py-2 border-b border-[#272727]">
                  {/* Channel Profile */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-[#272727] shrink-0 border border-[#383838]">
                      <img
                        src={activeVideo?.channelAvatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${activeVideo?.channel || 'yt'}`}
                        alt={activeVideo?.channel || 'قناة'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white flex items-center gap-1">
                        <span>{activeVideo?.channel || 'قناة YouTube'}</span>
                        {activeVideo?.verified && (
                          <span className="w-3.5 h-3.5 rounded-full bg-slate-500 text-slate-950 flex items-center justify-center text-[9px] font-bold">
                            ✓
                          </span>
                        )}
                      </h2>
                      <p className="text-[11px] text-[#aaaaaa]">1.4M مشترك</p>
                    </div>

                    <button
                      onClick={() => setIsSubscribed(!isSubscribed)}
                      className={`ms-3 px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                        isSubscribed
                          ? 'bg-[#272727] text-white hover:bg-[#383838]'
                          : 'bg-white text-black hover:bg-slate-200'
                      }`}
                    >
                      {isSubscribed ? 'تم الاشتراك' : 'اشتراك'}
                    </button>
                  </div>

                  {/* Action Buttons: Like, Share, Download, Theater */}
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {/* Like/Dislike Pill */}
                    <div className="flex items-center rounded-full bg-[#272727] overflow-hidden">
                      <button
                        onClick={handleLike}
                        className={`flex items-center gap-1.5 px-3.5 py-2 hover:bg-[#383838] transition-colors ${
                          hasLiked ? 'text-white font-bold' : 'text-slate-200'
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>{likesCount.toLocaleString('ar-EG')}</span>
                      </button>
                      <div className="w-[1px] h-4 bg-[#383838]" />
                      <button
                        onClick={handleDislike}
                        className={`px-3 py-2 hover:bg-[#383838] transition-colors ${
                          hasDisliked ? 'text-white' : 'text-slate-300'
                        }`}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={() => onNavigate(`https://www.youtube.com/watch?v=${currentVideoId}`)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#272727] hover:bg-[#383838] text-white transition-colors"
                      title="فتح صفحة الفيديو الأصلية على YouTube"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>فتح على YouTube</span>
                    </button>

                    {/* Share button */}
                    <button
                      onClick={handleShare}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#272727] hover:bg-[#383838] text-white transition-colors"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'تم النسخ!' : 'مشاركة'}</span>
                    </button>

                    {/* Theater mode button */}
                    <button
                      onClick={() => setIsTheaterMode(!isTheaterMode)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#272727] hover:bg-[#383838] text-slate-300 transition-colors"
                      title={isTheaterMode ? 'العرض العادي' : 'نمط المسرح'}
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{isTheaterMode ? 'العرض العادي' : 'نمط المسرح'}</span>
                    </button>

                    {/* Download button */}
                    <button
                      onClick={() => alert('تمت إضافة الفيديو إلى قائمة التنزيلات')}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#272727] hover:bg-[#383838] text-white transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تنزيل</span>
                    </button>
                  </div>
                </div>

                {/* Description Card */}
                <div className="p-3.5 rounded-xl bg-[#222222] text-xs text-[#f1f1f1] space-y-2">
                  <div className="flex items-center gap-2 font-bold text-[11px] text-[#aaaaaa]">
                    <span>{activeVideo?.views || '1.2M مشاهدة'}</span>
                    <span>•</span>
                    <span>{activeVideo?.time || 'قبل 4 أيام'}</span>
                  </div>
                  <p className="leading-relaxed text-slate-200">
                    استمتع بمشاهدة هذا المقطع بجودة عالية وصوت استريو نقي، مع إمكانية التفاعل في التعليقات ومتابعة الفيديوهات المقترحة المرفقة.
                  </p>
                  <div className="flex items-center gap-2 text-sky-400 text-[11px] pt-1">
                    <span>#YouTube</span>
                    <span>#موسيقى</span>
                    <span>#فيديو</span>
                  </div>
                </div>

                {/* Real Comments Section (Located directly under the video in the main column!) */}
                <div className="pt-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-white" />
                      <span>{comments.length + 142} تعليق</span>
                    </h3>
                    <span className="text-xs text-[#aaaaaa] cursor-pointer hover:text-white">ترتيب حسب: الأبرز</span>
                  </div>

                  {/* Add Comment Box */}
                  <form onSubmit={handleAddComment} className="flex gap-3 items-start">
                    <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-slate-950 font-bold text-xs shrink-0">
                      A
                    </div>
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={newCommentText}
                        onChange={(e) => setNewCommentText(e.target.value)}
                        placeholder="إضافة تعليق علني..."
                        className="w-full pb-1 bg-transparent border-b border-[#383838] focus:border-white outline-none text-xs text-white placeholder-[#888888] transition-colors"
                      />
                      {newCommentText.trim() && (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setNewCommentText('')}
                            className="px-3 py-1.5 rounded-full text-xs text-slate-300 hover:bg-[#272727]"
                          >
                            إلغاء
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-1.5 rounded-full text-xs font-bold bg-white text-black hover:bg-slate-200"
                          >
                            تعليق
                          </button>
                        </div>
                      )}
                    </div>
                  </form>

                  {/* Comments List */}
                  <div className="space-y-4 pt-2">
                    {comments.map((comment) => (
                      <div key={comment.id} className="flex gap-3 text-xs">
                        <img
                          src={comment.avatar}
                          alt={comment.author}
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-[11px]">{comment.author}</span>
                            <span className="text-[#888888] text-[10px]">{comment.time}</span>
                          </div>
                          <p className="text-slate-200 leading-relaxed text-[12px]">{comment.text}</p>
                          <div className="flex items-center gap-3 pt-1 text-[11px] text-[#aaaaaa]">
                            <button className="flex items-center gap-1 hover:text-white">
                              <ThumbsUp className="w-3 h-3" />
                              <span>{comment.likes}</span>
                            </button>
                            <button className="hover:text-white">
                              <ThumbsDown className="w-3 h-3" />
                            </button>
                            <button className="hover:text-white font-semibold">رد</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Secondary Column: Recommended Videos (Right beside the player & comments!) */}
              <aside className="w-full lg:w-[380px] xl:w-[420px] shrink-0 space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <h3 className="text-sm font-bold text-white">فيديوهات مقترحة</h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#aaaaaa]">
                    <span>التشغيل التلقائي</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  </div>
                </div>

                {/* List of Recommended Video Cards beside the comments */}
                <div className="space-y-3">
                  {relatedVideos.map((video) => (
                    <div
                      key={video.id}
                      onClick={() => handleSelectVideo(video)}
                      className={`flex gap-3 p-1.5 rounded-xl cursor-pointer hover:bg-[#222222] transition-colors group ${
                        currentVideoId === video.id ? 'bg-[#272727]' : ''
                      }`}
                    >
                      {/* Mini Thumbnail */}
                      <div className="relative w-40 aspect-video rounded-lg overflow-hidden bg-[#222222] shrink-0">
                        <img
                          src={video.thumbnail}
                          alt={video.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/85 text-[9px] font-mono text-white">
                          {video.duration}
                        </span>
                      </div>

                      {/* Mini Info */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <h4 className="text-xs font-semibold text-white line-clamp-2 leading-snug group-hover:text-sky-400 transition-colors">
                          {video.title}
                        </h4>
                        <p className="text-[11px] text-[#aaaaaa] truncate flex items-center gap-1">
                          <span>{video.channel}</span>
                          {video.verified && <span className="text-[9px]">✓</span>}
                        </p>
                        <p className="text-[10px] text-[#888888]">{video.views}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </div>
        ) : (
          /* HOME FEED: Real YouTube Video Cards Grid */
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#272727]">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-500" />
                <h2 className="text-sm font-bold text-white">
                  {searchQuery ? `نتائج البحث عن: ${searchQuery}` : 'أحدث الفيديوهات الرائجة والمقترحة'}
                </h2>
              </div>
            </div>

            {isLoading ? (
              <div className="py-24 text-center space-y-3">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-[#888888]">جاري استرجاع فيديوهات YouTube المباشرة...</p>
              </div>
            ) : videos.length === 0 ? (
              <div className="py-20 text-center space-y-4">
                <p className="text-sm text-[#aaaaaa]">{feedError || 'لا توجد نتائج لعرضها حالياً.'}</p>
                <button
                  type="button"
                  onClick={() => void loadVideos(activeCategory, searchQuery.trim() || undefined)}
                  className="px-4 py-2 rounded-full bg-[#272727] hover:bg-[#383838] text-white text-xs"
                >
                  إعادة المحاولة
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {videos.map((video) => (
                  <div
                    key={video.id}
                    onClick={() => handleSelectVideo(video)}
                    className="group cursor-pointer space-y-2.5"
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-[#222222]">
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/85 text-[10px] font-mono text-white">
                        {video.duration}
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="flex gap-2.5 items-start">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-[#222222] shrink-0 border border-[#303030]">
                        <img
                          src={video.channelAvatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${video.channel}`}
                          alt={video.channel}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <h3 className="text-xs font-bold text-white group-hover:text-sky-400 line-clamp-2 leading-snug">
                          {video.title}
                        </h3>
                        <p className="text-[11px] text-[#aaaaaa] truncate flex items-center gap-1">
                          <span>{video.channel}</span>
                          {video.verified && <span className="text-[10px]">✓</span>}
                        </p>
                        <p className="text-[10px] text-[#888888]">
                          {video.views} {video.time ? `• ${video.time}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
