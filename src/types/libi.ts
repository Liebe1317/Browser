export type LibiBrowserAction =
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
  | { type: 'toggle_theme' }
  | { type: 'toggle_reader' }
  | { type: 'bookmark_page' }
  | { type: 'zoom_in' }
  | { type: 'zoom_out' }
  | { type: 'zoom_reset' }
  | { type: 'scroll_top' }
  | { type: 'scroll_bottom' };

export function isLibiBrowserAction(value: unknown): value is LibiBrowserAction {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const simple = new Set([
    'new_tab', 'back', 'forward', 'reload', 'open_settings', 'open_history',
    'open_bookmarks', 'open_downloads', 'open_security', 'open_shields', 'toggle_theme',
    'toggle_reader', 'bookmark_page', 'zoom_in', 'zoom_out', 'zoom_reset', 'scroll_top', 'scroll_bottom',
  ]);
  if (simple.has(String(candidate.type))) return true;
  if (candidate.type !== 'navigate' || typeof candidate.url !== 'string' || candidate.url.length > 2048) return false;
  try {
    const url = new URL(candidate.url);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

export interface LibiSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export function parseLibiSearchResults(value: unknown): LibiSearchResult[] {
  if (!Array.isArray(value)) return [];
  const results: LibiSearchResult[] = [];
  for (const item of value.slice(0, 6)) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.title !== 'string' ||
      typeof candidate.url !== 'string' ||
      typeof candidate.snippet !== 'string'
    ) continue;
    try {
      const url = new URL(candidate.url);
      if (
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        !url.hostname ||
        url.username ||
        url.password
      ) continue;
      results.push({
        title: candidate.title.slice(0, 300),
        url: url.toString(),
        snippet: candidate.snippet.slice(0, 700),
      });
    } catch {}
  }
  return results;
}
