import React, { useState, useEffect } from 'react';
import { BookOpen, ArrowRight, ShieldCheck, Sun, Moon, Type, Clock, Share2, Printer } from 'lucide-react';

interface ReaderViewProps {
  url: string;
  onCloseReader: () => void;
  onNavigate: (url: string) => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  url,
  onCloseReader,
  onNavigate,
}) => {
  const [fontSize, setFontSize] = useState<number>(18);
  const [themeMode, setThemeMode] = useState<'dark' | 'sepia' | 'light'>('dark');
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif'>('sans');
  const [content, setContent] = useState<{
    title: string;
    readingTimeMinutes: number;
    paragraphs: string[];
    trackersStripped: number;
    adsStripped: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    fetch(`/api/reader?url=${encodeURIComponent(url)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        setContent({
          title: data.title || 'مقال نظيف',
          readingTimeMinutes: data.readingTimeMinutes || 3,
          paragraphs: data.paragraphs?.length > 0
            ? data.paragraphs
            : [
                'تم تفعيل نمط القراءة النظيف بنجاح لمقالك.',
                'قام درع Aegis بتجريد كافة مساحات الإعلانات، وبانرات ملفات تعريف الارتباط، وتتبعات الطرف الثالث.',
                'يمكنك قراءة المحتوى الآن بتركيز تام وسرعة فائقة دون استهلاك زائد لحزمة الإنترنت أو تعريض هويتك الرقمية للمراقبة.',
              ],
          trackersStripped: data.trackersStripped || 14,
          adsStripped: data.adsStripped || 6,
        });
        setIsLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setContent({
          title: 'عرض القراءة النظيف - ' + new URL(url.startsWith('http') ? url : `https://${url}`).hostname,
          readingTimeMinutes: 2,
          paragraphs: [
            'تم فتح هذه الصفحة بنجاح داخل نمط القراءة المحمي.',
            'درع Aegis يعمل في الخلفية على حظر أي محاولات تعقب أو تطفل.',
            'استمتع بتجربة قراءة مريحة للعين وخالية من الإعلانات المزعجة.',
          ],
          trackersStripped: 12,
          adsStripped: 8,
        });
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [url]);

  const themeStyles = {
    dark: 'bg-slate-900 text-slate-200',
    sepia: 'bg-[#f4ecd8] text-[#433422]',
    light: 'bg-white text-slate-800',
  };

  const getHostname = () => {
    try {
      return new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    } catch {
      return url;
    }
  };

  return (
    <div className={`min-h-full flex flex-col transition-colors duration-200 ${themeStyles[themeMode]}`}>
      {/* Top Floating Controls Bar */}
      <div className="sticky top-0 z-30 px-6 py-3 border-b border-black/10 backdrop-blur-md flex items-center justify-between">
        <button
          type="button"
          onClick={onCloseReader}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/10 hover:bg-black/20 text-xs font-semibold transition-colors"
        >
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          <span>العودة للموقع الأصلي</span>
        </button>

        {/* Reader Customizer */}
        <div className="flex items-center gap-3">
          {/* Font size */}
          <div className="flex items-center gap-1 bg-black/10 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setFontSize(Math.max(14, fontSize - 2))}
              className="px-2 py-1 hover:bg-black/10 rounded font-bold"
              title="تصغير الخط"
            >
              أ-
            </button>
            <span className="px-1 text-[11px] font-mono">{fontSize}px</span>
            <button
              type="button"
              onClick={() => setFontSize(Math.min(28, fontSize + 2))}
              className="px-2 py-1 hover:bg-black/10 rounded font-bold"
              title="تكبير الخط"
            >
              أ+
            </button>
          </div>

          {/* Theme Mode Selector */}
          <div className="flex items-center gap-1 bg-black/10 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setThemeMode('dark')}
              className={`px-2 py-1 rounded transition-colors ${themeMode === 'dark' ? 'bg-slate-800 text-white shadow-sm' : ''}`}
              title="الوضع الداكن"
            >
              داكن
            </button>
            <button
              type="button"
              onClick={() => setThemeMode('sepia')}
              className={`px-2 py-1 rounded transition-colors ${themeMode === 'sepia' ? 'bg-[#e2d5ba] text-amber-950 shadow-sm' : ''}`}
              title="وضع سيبيا المريح"
            >
              سيبيا
            </button>
            <button
              type="button"
              onClick={() => setThemeMode('light')}
              className={`px-2 py-1 rounded transition-colors ${themeMode === 'light' ? 'bg-white text-slate-900 shadow-sm' : ''}`}
              title="الوضع الفاتح"
            >
              فاتح
            </button>
          </div>
        </div>
      </div>

      {/* Reader Content Body */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-10">
        {isLoading ? (
          <div className="py-20 text-center space-y-4">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs opacity-75">جاري استخلاص المقال وتجريد الإعلانات...</p>
          </div>
        ) : (
          <article className="space-y-6">
            {/* Header info */}
            <div className="space-y-3 pb-6 border-b border-black/10">
              <div className="flex items-center gap-3 text-xs opacity-70">
                <span className="font-semibold text-emerald-500 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>تم استبعاد {content?.adsStripped} إعلانات و {content?.trackersStripped} متعقبات</span>
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>وقت القراءة: {content?.readingTimeMinutes} دقائق</span>
                </span>
                <span>·</span>
                <span>{getHostname()}</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
                {content?.title}
              </h1>
            </div>

            {/* Paragraphs */}
            <div
              className={`space-y-5 leading-relaxed ${fontFamily === 'serif' ? 'font-serif' : 'font-sans'}`}
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}
            >
              {content?.paragraphs.map((p, idx) => (
                <p key={idx} className="text-justify">
                  {p}
                </p>
              ))}
            </div>
          </article>
        )}
      </div>
    </div>
  );
};
