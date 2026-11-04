/** Serialize untrusted text as a JavaScript string literal safe to embed in an HTML script block. */
export function jsStringLiteral(value: unknown): string {
  return JSON.stringify(String(value ?? ''))
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Safe rendering helpers for HTML generated from untrusted search/provider data. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return char;
    }
  });
}

/** Accept only ordinary web links. Never render javascript:, data:, file:, or credential URLs. */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8192) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export interface SearchResultCardData {
  title?: unknown;
  url?: unknown;
  snippet?: unknown;
}

/** Render one result card with all untrusted data encoded for its exact HTML context. */
export function renderSearchResultCard(result: SearchResultCardData, index: number, fallbackSnippet: string): string {
  const safeUrl = safeHttpUrl(result.url);
  let domain = 'رابط غير صالح';
  let pathPart = '';
  let faviconUrl = '';

  if (safeUrl) {
    const parsed = new URL(safeUrl);
    domain = parsed.hostname;
    const rawPath = parsed.pathname.length > 1 ? parsed.pathname.replace(/^\//, '').replace(/\/$/, '') : '';
    try {
      pathPart = decodeURIComponent(rawPath);
    } catch {
      pathPart = rawPath;
    }
    faviconUrl = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=32';
  }

  const title = escapeHtml(result.title);
  const snippet = escapeHtml(result.snippet || fallbackSnippet);
  const safeDomain = escapeHtml(domain);
  const safePath = escapeHtml(pathPart);
  const titleMarkup = safeUrl
    ? '<a href="' + escapeHtml(safeUrl) + '" class="g-title-link" rel="noopener noreferrer">' + title + '</a>'
    : '<span class="g-title-link">' + title + '</span>';
  const faviconMarkup = faviconUrl
    ? '<img src="' + escapeHtml(faviconUrl) + '" alt="" class="g-favicon" />'
    : '';

  return [
    '<div class="g-result-card" data-idx="' + String(Math.max(0, Math.trunc(index))) + '">',
    '  <div class="g-result-header">',
    '    <div class="g-favicon-box">' + faviconMarkup + '</div>',
    '    <div class="g-url-meta">',
    '      <span class="g-site-name">' + safeDomain + '</span>',
    '      <span class="g-display-url">' + safeDomain + (safePath ? ' › ' + safePath : '') + '</span>',
    '    </div>',
    '  </div>',
    '  <h3 class="g-title">' + titleMarkup + '</h3>',
    '  <p class="g-snippet">' + snippet + '</p>',
    '</div>'
  ].join('\n');
}
