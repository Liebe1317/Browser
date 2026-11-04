import { isBlockedUrl } from './ssrf.ts';

export type LibiAction =
  | { type: 'navigate'; url: string }
  | { type: 'new_tab' }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'reload' }
  | { type: 'open_settings' }
  | { type: 'open_history' }
  | { type: 'open_bookmarks' }
  | { type: 'open_downloads' }
  | { type: 'open_security' }
  | { type: 'open_shields' }
  | { type: 'toggle_theme' };

const INTERNAL_COMMANDS: Array<[RegExp, LibiAction]> = [
  [/^(?:افتح|اعرض|اذهب الى|انتقل الى)\s+(?:الاعدادات|اعدادات المتصفح|settings)$/, { type: 'open_settings' }],
  [/^(?:افتح|اعرض|اذهب الى|انتقل الى)\s+(?:السجل|التاريخ|history)$/, { type: 'open_history' }],
  [/^(?:افتح|اعرض|اذهب الى|انتقل الى)\s+(?:الاشارات|المفضلة|bookmarks)$/, { type: 'open_bookmarks' }],
  [/^(?:افتح|اعرض|اذهب الى|انتقل الى)\s+(?:التنزيلات|التحميلات|downloads)$/, { type: 'open_downloads' }],
  [/^(?:افتح|اعرض|اذهب الى|انتقل الى)\s+(?:الخزنة|الامان|مركز الامان|security)$/, { type: 'open_security' }],
  [/^(?:افتح|اعرض|اذهب الى|انتقل الى)\s+(?:الدرع|الحماية|shields)$/, { type: 'open_shields' }],
];

function cleanCommand(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ar')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/^\s*ليبي[،,:؛-]?\s*/, '')
    .trim()
    .replace(/[.!؟،؛]+$/g, '')
    .trim();
}

function safeNavigationUrl(raw: string): string | null {
  const candidate = raw.trim().replace(/[)>،؛.!؟]+$/g, '');
  if (!candidate || candidate.length > 2048) return null;
  const withScheme = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password || isBlockedUrl(url)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Explicit, narrow command parser. It proposes an action; the UI must ask the user to confirm it. */
export function detectLibiAction(input: string): LibiAction | null {
  const command = cleanCommand(input);
  if (/^(ارجع|رجوع|للخلف|الصفحة السابقة|ارجع صفحة)$/.test(command)) return { type: 'back' };
  if (/^(تقدم|للأمام|الى الامام|الصفحة التالية)$/.test(command)) return { type: 'forward' };
  if (/^(اعادة تحميل|اعد تحميل الصفحة|حدث الصفحة|ريفريش|refresh)$/.test(command)) return { type: 'reload' };
  if (/^(افتح تبويب جديد|علامة تبويب جديدة|تبويب جديد|new tab)$/.test(command)) return { type: 'new_tab' };
  if (/^(غير الثيم|بدل الثيم|غير المظهر|بدل المظهر|toggle theme)$/.test(command)) return { type: 'toggle_theme' };

  for (const [pattern, action] of INTERNAL_COMMANDS) {
    if (pattern.test(command)) return action;
  }

  const match = command.match(/^(?:افتح|انتقل الى|اذهب الى|روح الى|اذهب ل)\s+(.+)$/);
  if (match) {
    const url = safeNavigationUrl(match[1]);
    if (url) return { type: 'navigate', url };
  }
  return null;
}

export function describeLibiAction(action: LibiAction): string {
  switch (action.type) {
    case 'navigate': return `فتح ${action.url}`;
    case 'new_tab': return 'فتح علامة تبويب جديدة';
    case 'back': return 'الرجوع إلى الصفحة السابقة';
    case 'forward': return 'الانتقال إلى الصفحة التالية';
    case 'reload': return 'إعادة تحميل الصفحة الحالية';
    case 'open_settings': return 'فتح إعدادات المتصفح';
    case 'open_history': return 'فتح سجل التصفح';
    case 'open_bookmarks': return 'فتح الإشارات المرجعية';
    case 'open_downloads': return 'فتح التنزيلات';
    case 'open_security': return 'فتح الخزنة ومركز الأمان';
    case 'open_shields': return 'فتح لوحة درع الحماية';
    case 'toggle_theme': return 'تبديل مظهر المتصفح';
  }
}
