import React, { useState, useEffect, useRef } from 'react';
import { LibiBrowserAction, isLibiBrowserAction, LibiSearchResult, parseLibiSearchResults } from '../../types/libi';
import { fetchWithAegisCsrf } from '../../utils/sessionSecurity';
import { 
  Sparkles, Send, X, Shield, Lock, RefreshCw, MessageSquare, 
  ExternalLink, CheckCircle2, ChevronDown, Minimize2, Maximize2 
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  results?: LibiSearchResult[];
}

interface LibiAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  currentPageContext?: {
    title: string;
    url: string;
    tabId?: string;
    text?: string;
  };
  initialQuery?: string;
  onNavigate?: (url: string) => void;
  onExecuteBrowserAction?: (action: LibiBrowserAction) => void;
}

export const LibiAssistant: React.FC<LibiAssistantProps> = ({
  isOpen,
  onClose,
  currentPageContext,
  initialQuery,
  onNavigate,
  onExecuteBrowserAction,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'مرحباً بك! 🇵🇸 أنا أكرم، مساعدك في متصفح Akram. أستطيع الإجابة عن أسئلتك ومساعدتك في بعض أوامر المتصفح. لن أنفذ أي أمر تحكّم قبل تأكيدك.',
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([
    'ما هي أفضل مواقع الأنمي الموثوقة؟',
    'لخّص لي الصفحة الحالية',
    'ابحث عن أدوات حماية الخصوصية',
    'كيف يحميني متصفح Aegis من التتبع؟',
  ]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [pendingAction, setPendingAction] = useState<LibiBrowserAction | null>(null);
  const [sharePageContext, setSharePageContext] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) setSharePageContext(false);
  }, [isOpen]);

  useEffect(() => {
    setSharePageContext(false);
  }, [currentPageContext?.url, currentPageContext?.tabId]);

  useEffect(() => {
    if (isOpen && initialQuery) {
      handleSendMessage(`أخبرني المزيد عن نتائج البحث لـ: ${initialQuery}`);
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputText).trim();
    if (!textToSend || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: textToSend,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setPendingAction(null);
    if (!customText) setInputText('');
    setIsLoading(true);

    try {
      // Build history payload for server API
      const historyPayload = messages.map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const res = await fetchWithAegisCsrf('/api/akram-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend.slice(0, 4000),
          history: historyPayload.slice(-8),
          pageContext: currentPageContext ? {
            title: currentPageContext.title,
            url: currentPageContext.url,
            ...(sharePageContext && currentPageContext.text ? { text: currentPageContext.text.slice(0, 12000) } : {}),
          } : undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to get Akram reply');
      const data = await res.json();

      const botMessage: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'model',
        text: data.reply || 'أنا في خدمتك دائماً لحماية أمنك الرقمي!',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, botMessage]);
      if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setSuggestions(data.suggestions.filter((item: unknown) => typeof item === 'string').slice(0, 4));
      }
      if (isLibiBrowserAction(data.action)) setPendingAction(data.action);
    } catch (err: any) {
      setPendingAction(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          role: 'model',
          text: 'تعذر الاتصال بخدمة أكرم حالياً. لم يتم تنفيذ أي أمر؛ حاول مرة أخرى لاحقاً.',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className={`fixed bottom-4 left-4 z-50 flex flex-col bg-slate-900/95 backdrop-blur-xl border border-indigo-500/40 rounded-3xl shadow-2xl overflow-hidden transition-all duration-300 font-sans ${
        isMinimized ? 'w-80 h-16' : 'w-[92vw] max-w-md h-[580px] max-h-[85vh]'
      }`}
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-950/80 via-slate-900 to-slate-900 border-b border-indigo-500/30">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-indigo-400/60 bg-purple-950/80 shrink-0 shadow-md">
            <img 
              src="/assets/libi.png" 
              alt="أكرم بالكوفية الفلسطينية" 
              className="w-full h-full object-cover"
            />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-white flex items-center gap-1">
                <span>أكرم (Akram)</span>
                <span className="text-xs">🇵🇸</span>
              </h3>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                مساعد الذكاء الاصطناعي
              </span>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-400 inline" />
              <span>قد تُرسل الرسائل إلى Google Gemini عند تفعيل الخدمة؛ لا تُرسل كلمات المرور أو الكوكيز.</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-slate-400">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors"
            title={isMinimized ? 'تكبير' : 'تصغير'}
          >
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Privacy Guarantee Ribbon */}
          <div className="px-4 py-1.5 bg-emerald-950/40 border-b border-emerald-500/20 flex items-center justify-between text-[11px] text-emerald-300">
            <div className="flex items-center gap-2 min-w-0">
              <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>أكرم لا يقرأ كلمات المرور أو كوكيز المواقع أو ملفات الجهاز.</span>
            </div>
            {currentPageContext?.url && /^https?:\/\//i.test(currentPageContext.url) && (
              <label className={`flex items-center gap-1.5 text-[10px] shrink-0 ${currentPageContext.text?.trim() ? 'text-emerald-200 cursor-pointer' : 'text-slate-400'}`}>
                <input
                  type="checkbox"
                  checked={sharePageContext}
                  disabled={!currentPageContext.text?.trim()}
                  onChange={(e) => setSharePageContext(e.target.checked)}
                  className="accent-emerald-500 disabled:opacity-40"
                />
                <span>{currentPageContext.text?.trim() ? 'السماح بمشاركة نص الصفحة مع Gemini' : 'نص الصفحة غير متاح بعد — تحقق من إعدادات السكربتات وأعد التحميل'}</span>
              </label>
            )}
            {currentPageContext?.url && !currentPageContext.url.startsWith('chrome://') && (
              <span className="text-slate-400 text-[10px] truncate max-w-[140px]" title={currentPageContext.title}>
                {currentPageContext.title || currentPageContext.url}
              </span>
            )}
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div 
                  key={m.id} 
                  className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {!isUser && (
                    <div className="w-7 h-7 rounded-full overflow-hidden border border-indigo-400/40 shrink-0 self-end mb-1">
                      <img src="/assets/libi.png" alt="أكرم" className="w-full h-full object-cover" />
                    </div>
                  )}

                  <div className={`max-w-[82%] min-w-0 rounded-2xl px-3.5 py-2.5 leading-relaxed break-words whitespace-pre-wrap shadow-sm ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-slate-800/90 text-slate-100 border border-slate-700/60 rounded-bl-none'
                  }`}>
                    {m.text}
                    {m.results && m.results.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {m.results.map((result, index) => (
                          <button
                            key={result.url + index}
                            type="button"
                            onClick={() => onNavigate?.(result.url)}
                            className="w-full text-right rounded-xl border border-slate-700 bg-slate-900/80 hover:border-indigo-400/60 p-2.5 transition-colors whitespace-normal"
                          >
                            <span className="block text-indigo-300 font-semibold leading-snug">{result.title}</span>
                            <span className="block text-[10px] text-emerald-300/80 mt-1 break-all">{new URL(result.url).hostname}</span>
                            <span className="block text-[11px] text-slate-400 mt-1 leading-relaxed">{result.snippet}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-2.5 items-end">
                <div className="w-7 h-7 rounded-full overflow-hidden border border-indigo-400/40 shrink-0">
                  <img src="/assets/libi.png" alt="أكرم" className="w-full h-full object-cover" />
                </div>
                <div className="bg-slate-800/90 border border-slate-700/60 rounded-2xl rounded-bl-none px-3.5 py-2.5 text-slate-300 flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="text-[11px] text-slate-400 mr-2">أكرم يفكّر بذكاء...</span>
                </div>
              </div>
            )}

            {pendingAction && (
              <div className="rounded-2xl border border-indigo-500/40 bg-indigo-950/40 p-3 space-y-2" role="group" aria-label="تأكيد أمر المتصفح">
                <p className="text-xs text-indigo-100">أكرم يقترح تنفيذ أمر في المتصفح. لن يحدث شيء قبل موافقتك.</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onExecuteBrowserAction?.(pendingAction);
                      setPendingAction(null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                  >
                    تأكيد التنفيذ
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingAction(null)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Suggestions */}
          {suggestions.length > 0 && !isLoading && (
            <div className="px-3 py-2 bg-slate-950/40 border-t border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-1" />
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(s)}
                  className="shrink-0 px-2.5 py-1 rounded-full bg-slate-800 hover:bg-indigo-950 hover:text-indigo-200 text-slate-300 text-[11px] border border-slate-700/80 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input Bar */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="تحدث مع أكرم بأي سؤال أو اطلب مساعدة..."
              className="flex-1 bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-400 outline-none transition-colors"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white transition-all shadow-md shrink-0"
              title="إرسال"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </>
      )}
    </div>
  );
};
