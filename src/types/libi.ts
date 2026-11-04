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
