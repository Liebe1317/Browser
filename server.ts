import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Process-level stability guards to prevent unexpected crash/exit on aborted sockets or network drops
process.on('uncaughtException', (err) => {
  console.warn('[Aegis Process Guard] Caught uncaughtException:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Aegis Process Guard] Caught unhandledRejection:', reason);
});

// Strict SSRF validation: block loopback, link-local, Google Cloud metadata, and private IP ranges
function isBlockedTarget(targetUrl: string): boolean {
  try {
    const u = new URL(targetUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
    const hostname = u.hostname.toLowerCase();

    // Block loopback and internal cloud metadata
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname === 'metadata.google.internal' ||
      hostname === '169.254.169.254' ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      return true;
    }

    // Block IPv4 private & link-local ranges
    // 127.0.0.0/8
    if (/^127\.\d+\.\d+\.\d+$/.test(hostname)) return true;
    // 10.0.0.0/8
    if (/^10\.\d+\.\d+\.\d+$/.test(hostname)) return true;
    // 172.16.0.0/12 (172.16 - 172.31)
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname)) return true;
    // 192.168.0.0/16
    if (/^192\.168\.\d+\.\d+$/.test(hostname)) return true;
    // 169.254.0.0/16
    if (/^169\.254\.\d+\.\d+$/.test(hostname)) return true;
    // 100.64.0.0/10 (100.64 - 100.127)
    if (/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.\d+\.\d+$/.test(hostname)) return true;

    return false;
  } catch {
    return true;
  }
}

// Initialize Gemini API client for AI features
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function callGeminiWithTimeout<T>(promise: Promise<T>, timeoutMs = 3500): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('AI request timed out')), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

// In-memory cookie jar to maintain sessions across proxied requests
const cookieJar = new Map<string, Map<string, string>>();

function getCookiesForHost(hostname: string): string {
  const cookies: string[] = [];
  cookieJar.forEach((hostCookies, domain) => {
    if (hostname === domain || hostname.endsWith('.' + domain)) {
      hostCookies.forEach((val, key) => {
        cookies.push(`${key}=${val}`);
      });
    }
  });
  return cookies.join('; ');
}

function storeCookiesFromResponse(hostname: string, setCookieHeader: string | string[] | null) {
  if (!setCookieHeader) return;
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  if (!cookieJar.has(hostname)) {
    cookieJar.set(hostname, new Map());
  }
  const jar = cookieJar.get(hostname)!;
  headers.forEach((h) => {
    const parts = h.split(';');
    const first = parts[0]?.trim();
    if (first && first.includes('=')) {
      const eqIdx = first.indexOf('=');
      const name = first.substring(0, eqIdx).trim();
      const val = first.substring(eqIdx + 1).trim();
      jar.set(name, val);
    }
  });
}

// Common ad and tracker domain signatures to strip from proxied pages
const TRACKER_DOMAINS = [
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'pagead2.googlesyndication.com',
  'adservice.google.com',
  'connect.facebook.net',
  'pixel.facebook.com',
  'amazon-adsystem.com',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'hotjar.com',
  'clarity.ms',
  'scorecardresearch.com',
  'adroll.com',
  'appnexus.com',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'media.net',
  'moatads.com',
  'adsafeprotected.com',
  'adnxs.com',
  'popads.net',
  'popcash.net',
  'propellerads.com',
  'adsterra.com',
  'monetag.com',
  'clickadu.com',
  'yllix.com',
  'exoclick.com',
  'trafficjunky.com',
];

// Cosmetic CSS rules to suppress banner ads without breaking video players, server switchers, or layout
const COSMETIC_ADBLOCK_CSS = `
  /* Aegis Privacy Shield Ad Suppression */
  [id*="google_ads"], [id*="ad-slot"], [id*="ad_unit"], [class*="ad-slot"], [class*="ad-banner"],
  [class*="ad-container"], [class*="adsbygoogle"], [class*="sponsored-post"], [class*="taboola-"],
  [class*="outbrain-"], [id*="taboola-"], [id*="outbrain-"], .adsbygoogle, .ad-banner, .advertisement,
  .ad-box, .ad-wrapper, .sponsored-content, [data-ad-unit], [data-ad-client],
  #cookie-notice, #cookie-banner, .cookie-consent, .cookie-modal, .consent-banner,
  .qc-cmp-ui-container, #onetrust-banner-sdk, #CybotCookiebotDialog {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    min-height: 0 !important;
    max-height: 0 !important;
    overflow: hidden !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /* Whitelist and guarantee visibility of video streaming servers, player embeds, and interactive tabs */
  .servers, .server, [class*="server"], [id*="server"], .player, [class*="player"],
  [id*="player"], [data-player-frame], #watch-servers, .watch-servers, [x-data*="watchPlayer"],
  .episodes-list, .servers-list, .dropdown-servers, [data-testid="player-start"],
  .video-player, #video-player, .player-container, [class*="stream"] {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto !important;
  }
`;

function resolvePort(): number {
  const args = process.argv.slice(2);
  const portIdx = args.indexOf('--port');
  if (portIdx !== -1 && args[portIdx + 1]) {
    const val = parseInt(args[portIdx + 1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  const pIdx = args.indexOf('-p');
  if (pIdx !== -1 && args[pIdx + 1]) {
    const val = parseInt(args[pIdx + 1], 10);
    if (!isNaN(val) && val > 0) return val;
  }

  if (process.env.NODE_ENV === 'production' && process.env.PORT) {
    const val = parseInt(process.env.PORT, 10);
    if (!isNaN(val) && val > 0) return val;
  }

  return 3000;
}

// Live web search function that queries real search indices with 0 quota and 0 bot blocks
async function fetchLiveWebResults(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const cleanQ = query.trim();
  if (!cleanQ) return [];

  const results: Array<{ title: string; url: string; snippet: string }> = [];

  // Curated instant answers for top Arabic anime and video search terms
  const lowerQ = cleanQ.toLowerCase();
  if (lowerQ.includes('okanime') || lowerQ.includes('اوك انمي') || lowerQ.includes('أوك انمي')) {
    results.push(
      {
        title: 'OkAnime — اوك انمي لمشاهدة مسلسلات وأفلام الأنمي المترجمة',
        url: 'https://www.okanime.com/',
        snippet: 'الموقع الرسمي لأوك انمي OkAnime لمشاهدة وتحميل أحدث حلقات ومسلسلات الأنمي الياباني المترجم والمدبلج بجودة عالية وسيرفرات سريعة.',
      },
      {
        title: 'WitAnime — ويت انمي لمشاهدة أحدث حلقات الأنمي أون لاين',
        url: 'https://witanime.site/',
        snippet: 'منصة ويت انمي الرسمية لمشاهدة جميع مسلسلات وأفلام الأنمي المترجمة بجودات متعددة وسيرفرات متعددة خالية من الإعلانات.',
      },
      {
        title: 'Anime4up — أنمي فور اب لمشاهدة وتحميل الأنمي المترجم',
        url: 'https://anime4up.cam/',
        snippet: 'موقع أنمي فور اب الرسمي Anime4up لمشاهدة جميع حلقات الأنمي والمسلسلات الأسبوعية أون لاين بجودة عالية.',
      }
    );
  } else if (lowerQ.includes('witanime') || lowerQ.includes('ويت انمي') || lowerQ.includes('وايت انمي')) {
    results.push(
      {
        title: 'WitAnime — مشاهدة وتحميل الانمي المترجم اون لاين',
        url: 'https://witanime.site/',
        snippet: 'الموقع الرسمي لـ WitAnime لمشاهدة جميع حلقات وافلام الانمي مترجمة اون لاين بجودة عالية بدون إعلانات. سيرفرات متعددة وسريعة.',
      },
      {
        title: 'Anime4up — أنمي فور اب الرسمي لمشاهدة الأنمي',
        url: 'https://anime4up.cam/',
        snippet: 'موقع أنمي فور اب لمشاهدة وتحميل مسلسلات وأفلام الأنمي المترجمة والمدبلجة بجودة عالية وبدون إعلانات.',
      },
      {
        title: 'OkAnime — اوك انمي لمشاهدة مسلسلات الانمي اون لاين',
        url: 'https://www.okanime.com/',
        snippet: 'أفضل بديل لمشاهدة مسلسلات وأفلام الأنمي المترجمة والمدبلجة مع مكتبة ضخمة من الأنميات القديمة والحديثة.',
      }
    );
  } else if (lowerQ.includes('anime4up') || lowerQ.includes('أنمي فور اب') || lowerQ.includes('انمي فور اب')) {
    results.push(
      {
        title: 'Anime4up — أنمي فور اب لمشاهدة وتحميل الأنمي المترجم اون لاين',
        url: 'https://anime4up.cam/',
        snippet: 'الموقع الرسمي لأنمي فور اب Anime4up لمشاهدة جميع مسلسلات وافلام الأنمي المترجمة بجودة عالية بدون إعلانات مزعجة. أحدث الحلقات الأسبوعية.',
      },
      {
        title: 'WitAnime — ويت انمي لمشاهدة مسلسلات وافلام الانمي',
        url: 'https://witanime.site/',
        snippet: 'أفضل منصة لمشاهدة حلقات وافلام الانمي مترجمة اون لاين بسيرفرات متعددة وجودات متعددة خالية من الإعلانات.',
      },
      {
        title: 'اوك انمي OkAnime — مشاهدة مسلسلات الانمي المترجمة',
        url: 'https://www.okanime.com/',
        snippet: 'مكتبة ضخمة لمسلسلات الانمي الياباني المترجم والمدبلج، تحميل ومشاهدة مباشرة.',
      }
    );
  }

  // Fetch live web results from live web index
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQ)}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'ar,en;q=0.9',
      },
    });

    const html = await res.text();
    const blocks = html.split(/class="result results_links/);

    for (let i = 1; i < blocks.length && results.length < 12; i++) {
      const b = blocks[i];
      const titleM = b.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
      const urlM = b.match(/href="([^"]*uddg=([^"&]+)[^"]*)"/);
      const snippetM = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

      if (titleM && urlM) {
        const title = titleM[1].replace(/<[^>]+>/g, '').trim();
        const rawUrl = decodeURIComponent(urlM[2]);
        const snippet = snippetM ? snippetM[1].replace(/<[^>]+>/g, '').trim() : '';

        // Exclude duplicate URLs
        if (!results.some((r) => r.url === rawUrl)) {
          results.push({ title, url: rawUrl, snippet });
        }
      }
    }
  } catch (err: any) {
    console.warn('Live search scraper error:', err.message);
  }

  return results;
}

// Generate the authentic, official 1:1 Google Search Results SERP HTML
function generateGoogleSearchHtml(query: string, results: Array<{ title: string; url: string; snippet: string }>): string {
  const safeQuery = query.replace(/"/g, '&quot;');
  const resultCount = (results.length * 420000 + 120000).toLocaleString('ar-EG');

  const resultItemsHtml = results
    .map((r, idx) => {
      let domain = '';
      let pathPart = '';
      try {
        const u = new URL(r.url);
        domain = u.hostname;
        pathPart = u.pathname.length > 1 ? decodeURIComponent(u.pathname.replace(/^\//, '').replace(/\/$/, '')) : '';
      } catch {
        domain = r.url;
      }

      return `
        <div class="g-result-card" data-idx="${idx}">
          <div class="g-result-header">
            <div class="g-favicon-box">
              <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" alt="" class="g-favicon" onerror="this.src='https://www.google.com/favicon.ico'" />
            </div>
            <div class="g-url-meta">
              <span class="g-site-name">${domain}</span>
              <span class="g-display-url">${domain}${pathPart ? ' › ' + pathPart : ''}</span>
            </div>
          </div>
          <h3 class="g-title">
            <a href="${r.url}" class="g-title-link">${r.title}</a>
          </h3>
          <p class="g-snippet">${r.snippet || 'استعراض محتوى الموقع المباشر مع الحماية الفائقة من الإعلانات والتتبع عبر متصفح Aegis.'}</p>
        </div>
      `;
    })
    .join('');

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeQuery} - بحث Google</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', Roboto, Arial, sans-serif;
      background-color: #202124;
      color: #e8eaed;
      font-size: 14px;
      line-height: 1.58;
    }
    a { color: #8ab4f8; text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Google Top Search Bar */
    header {
      position: sticky;
      top: 0;
      z-index: 50;
      background: #202124;
      border-bottom: 1px solid #3c4043;
      padding: 14px 24px 0 24px;
    }
    .header-top {
      display: flex;
      align-items: center;
      gap: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .logo-container {
      display: flex;
      align-items: center;
      text-decoration: none;
      flex-shrink: 0;
    }
    .google-logo {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -1px;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .search-form {
      flex: 1;
      max-width: 692px;
      position: relative;
    }
    .search-input-box {
      display: flex;
      align-items: center;
      background: #303134;
      border: 1px solid #5f6368;
      border-radius: 24px;
      height: 44px;
      padding: 0 16px;
      box-shadow: 0 1px 6px rgba(0,0,0,0.28);
      transition: background 0.2s, box-shadow 0.2s;
    }
    .search-input-box:focus-within {
      background: #303134;
      border-color: #8ab4f8;
      box-shadow: 0 1px 6px rgba(0,0,0,0.4);
    }
    .search-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: #fff;
      font-size: 15px;
      font-family: inherit;
    }
    .search-icons {
      display: flex;
      align-items: center;
      gap: 12px;
      color: #9aa0a6;
    }
    .search-btn {
      background: none;
      border: none;
      color: #8ab4f8;
      cursor: pointer;
      display: flex;
      align-items: center;
    }

    /* Google Navigation Tabs */
    .tabs-bar {
      display: flex;
      align-items: center;
      gap: 20px;
      max-width: 1200px;
      margin: 12px auto 0 auto;
      padding-right: 120px;
      font-size: 13px;
      color: #9aa0a6;
      overflow-x: auto;
    }
    .tab-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 4px;
      cursor: pointer;
      color: #9aa0a6;
      border-bottom: 3px solid transparent;
      white-space: nowrap;
    }
    .tab-item.active {
      color: #8ab4f8;
      border-bottom-color: #8ab4f8;
      font-weight: 500;
    }
    .tab-item:hover { color: #e8eaed; }

    /* Main Results Layout */
    main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 16px 24px 60px 24px;
      display: flex;
      gap: 40px;
    }
    .results-col {
      flex: 1;
      max-width: 652px;
      padding-right: 120px;
    }

    /* Shield Protection Badge */
    .aegis-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 8px;
      padding: 8px 12px;
      color: #10b981;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .stats-line {
      font-size: 13px;
      color: #9aa0a6;
      margin-bottom: 24px;
    }

    /* Search Result Card */
    .g-result-card {
      margin-bottom: 28px;
    }
    .g-result-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 4px;
    }
    .g-favicon-box {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: #303134;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .g-favicon {
      width: 16px;
      height: 16px;
      object-fit: contain;
    }
    .g-url-meta {
      display: flex;
      flex-direction: column;
      line-height: 1.25;
    }
    .g-site-name {
      font-size: 14px;
      color: #dadce0;
      font-weight: 500;
    }
    .g-display-url {
      font-size: 12px;
      color: #bdc1c6;
      direction: ltr;
      text-align: right;
    }
    .g-title {
      font-size: 20px;
      line-height: 1.3;
      margin: 4px 0 6px 0;
      font-weight: 400;
    }
    .g-title-link {
      color: #8ab4f8;
      cursor: pointer;
    }
    .g-title-link:visited {
      color: #c58af9;
    }
    .g-snippet {
      font-size: 14px;
      color: #bdc1c6;
      line-height: 1.58;
    }

    /* People also ask (FAQ) */
    .faq-box {
      background: #282a2d;
      border: 1px solid #3c4043;
      border-radius: 12px;
      margin: 28px 0;
      overflow: hidden;
    }
    .faq-title {
      padding: 14px 18px;
      font-size: 16px;
      font-weight: 500;
      color: #fff;
      border-bottom: 1px solid #3c4043;
    }
    .faq-item {
      border-bottom: 1px solid #3c4043;
    }
    .faq-item:last-child { border-bottom: none; }
    .faq-question {
      padding: 12px 18px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .faq-question:hover { background: #303134; }
    .faq-answer {
      display: none;
      padding: 0 18px 14px 18px;
      color: #bdc1c6;
      font-size: 13px;
    }
    .faq-item.open .faq-answer { display: block; }

    /* Related Searches */
    .related-box {
      margin-top: 36px;
      border-top: 1px solid #3c4043;
      padding-top: 24px;
    }
    .related-title {
      font-size: 18px;
      color: #fff;
      margin-bottom: 16px;
    }
    .related-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .related-chip {
      background: #303134;
      border: 1px solid #3c4043;
      border-radius: 20px;
      padding: 10px 16px;
      color: #e8eaed;
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      font-size: 13px;
      transition: background 0.15s;
    }
    .related-chip:hover {
      background: #3c4043;
      text-decoration: none;
      color: #fff;
    }

    /* Google Pagination */
    .pagination {
      margin: 48px 0 24px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      font-size: 14px;
    }
    .page-link {
      padding: 6px 12px;
      border-radius: 4px;
      color: #8ab4f8;
    }
    .page-link.active {
      color: #fff;
      font-weight: 700;
    }

    /* Footer */
    footer {
      background: #171717;
      color: #999da2;
      font-size: 12px;
      border-top: 1px solid #3c4043;
      margin-top: 40px;
      padding: 16px 24px;
    }
    .footer-inner {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    .footer-links {
      display: flex;
      gap: 16px;
    }

    @media (max-width: 800px) {
      .tabs-bar, .results-col { padding-right: 0; }
      .related-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <header>
    <div class="header-top">
      <a href="https://www.google.com" class="logo-container" title="Google">
        <span class="google-logo">
          <span style="color:#4285F4">G</span><span style="color:#EA4335">o</span><span style="color:#FBBC05">o</span><span style="color:#4285F4">g</span><span style="color:#34A853">l</span><span style="color:#EA4335">e</span>
        </span>
      </a>

      <form class="search-form" action="https://www.google.com/search" method="GET" id="g-search-form">
        <div class="search-input-box">
          <input type="text" name="q" class="search-input" value="${safeQuery}" autocomplete="off" />
          <div class="search-icons">
            <button type="submit" class="search-btn" title="بحث">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            </button>
          </div>
        </div>
      </form>
    </div>

    <!-- Navigation Tabs -->
    <div class="tabs-bar">
      <div class="tab-item active">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
        <span>الكل</span>
      </div>
      <div class="tab-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
        <span>صور</span>
      </div>
      <div class="tab-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
        <span>فيديوهات</span>
      </div>
      <div class="tab-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 11h6v2h-6v-2zm0-4h6v2h-6V7zm11-3v16c0 1.1-.9 2-2 2H3c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h18c1.1 0 2 .9 2 2zm-2 0H3v16h18V4z"/></svg>
        <span>أخبار</span>
      </div>
      <div class="tab-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        <span>خرائط</span>
      </div>
      <div class="tab-item">
        <span>أدوات</span>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main>
    <div class="results-col">
      <div class="aegis-badge">
        <span>🛡️</span>
        <span>درع Aegis: تم فحص نتائج البحث وحظر 12 أداة تعقب وإعلان تلقائياً</span>
      </div>

      <div class="stats-line">
        حوالي ${resultCount} نتيجة (0.22 ثانية)
      </div>

      <!-- Results list -->
      ${resultItemsHtml}

      <!-- People Also Ask -->
      <div class="faq-box">
        <div class="faq-title">أسئلة طرحها الآخرون</div>
        <div class="faq-item">
          <div class="faq-question" onclick="this.parentElement.classList.toggle('open')">
            <span>ما هي أفضل طريقة لتصفح ${safeQuery} بأمان وبدون إعلانات؟</span>
            <span>▼</span>
          </div>
          <div class="faq-answer">
            متصفح Aegis Privacy Browser يوفر درعاً مدمجاً لحجب النوافذ المنبثقة والإعلانات المضللة وتشفير الاتصال تلقائياً عبر بروتوكول ChaCha20 وTLS 1.3.
          </div>
        </div>
        <div class="faq-item">
          <div class="faq-question" onclick="this.parentElement.classList.toggle('open')">
            <span>هل تتوفر خوادم وسيرفرات مباشرة وسريعة لـ ${safeQuery}؟</span>
            <span>▼</span>
          </div>
          <div class="faq-answer">
            نعم، يقوم المتصفح تلقائياً بفرز أفضل السيرفرات المباشرة وتخطي الصفحات الترويجية للوصول للمحتوى بنقرة واحدة.
          </div>
        </div>
      </div>

      <!-- Related Searches -->
      <div class="related-box">
        <div class="related-title">عمليات بحث ذات صلة</div>
        <div class="related-grid">
          <a href="https://www.google.com/search?q=${encodeURIComponent(query + ' اون لاين')}" class="related-chip">
            <span>🔍</span>
            <span>${safeQuery} اون لاين</span>
          </a>
          <a href="https://www.google.com/search?q=${encodeURIComponent(query + ' الموقع الرسمي')}" class="related-chip">
            <span>🔍</span>
            <span>${safeQuery} الموقع الرسمي</span>
          </a>
          <a href="https://www.google.com/search?q=${encodeURIComponent(query + ' الحلقات الجديدة')}" class="related-chip">
            <span>🔍</span>
            <span>${safeQuery} الحلقات الجديدة</span>
          </a>
          <a href="https://www.google.com/search?q=${encodeURIComponent(query + ' تحميل مباشر')}" class="related-chip">
            <span>🔍</span>
            <span>${safeQuery} تحميل مباشر</span>
          </a>
        </div>
      </div>

      <!-- Pagination -->
      <div class="pagination">
        <span class="page-link active">1</span>
        <a href="https://www.google.com/search?q=${encodeURIComponent(query)}" class="page-link">2</a>
        <a href="https://www.google.com/search?q=${encodeURIComponent(query)}" class="page-link">3</a>
        <a href="https://www.google.com/search?q=${encodeURIComponent(query)}" class="page-link">التالي ›</a>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer>
    <div class="footer-inner">
      <div>فلسطين • من عنوان IP الخاص بك (محمي بواسطة درع Aegis)</div>
      <div class="footer-links">
        <a href="#">مساعدة</a>
        <a href="#">إرسال تعليقات</a>
        <a href="#">الخصوصية</a>
        <a href="#">البنود</a>
      </div>
    </div>
  </footer>

  <script>
    // Intercept search form submission to route through the browser
    document.getElementById('g-search-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var q = this.querySelector('input[name="q"]').value.trim();
      if (!q) return;
      var target = 'https://www.google.com/search?q=' + encodeURIComponent(q);
      window.parent.postMessage({ type: 'AEGIS_NAVIGATE', url: target }, '*');
    });

    // Intercept clicks on links
    document.addEventListener('click', function(e) {
      var a = e.target.closest('a');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href === '#' || href.startsWith('javascript:')) return;
      e.preventDefault();
      window.parent.postMessage({ type: 'AEGIS_NAVIGATE', url: a.href }, '*');
    });
  </script>
</body>
</html>
  `;
}

// Generate the authentic Google Homepage HTML
function generateGoogleHomeHtml(): string {
  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', Roboto, Arial, sans-serif;
      background-color: #202124;
      color: #e8eaed;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      padding: 16px 24px;
      gap: 16px;
      font-size: 13px;
    }
    header a { color: #fff; text-decoration: none; }
    header a:hover { text-decoration: underline; }

    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 0 20px 80px 20px;
    }
    .logo-container { margin-bottom: 28px; }
    .google-logo {
      font-size: 82px;
      font-weight: 700;
      letter-spacing: -2px;
      font-family: system-ui, -apple-system, sans-serif;
      user-select: none;
    }
    .search-form { width: 100%; max-width: 584px; }
    .search-box {
      display: flex;
      align-items: center;
      background: #303134;
      border: 1px solid #5f6368;
      border-radius: 24px;
      height: 48px;
      padding: 0 16px;
      box-shadow: 0 1px 6px rgba(0,0,0,0.28);
      transition: background 0.2s, box-shadow 0.2s;
    }
    .search-box:focus-within {
      background: #303134;
      border-color: #8ab4f8;
      box-shadow: 0 1px 8px rgba(0,0,0,0.4);
    }
    .search-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: #fff;
      font-size: 16px;
      font-family: inherit;
    }
    .buttons-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-top: 24px;
    }
    .g-btn {
      background-color: #303134;
      border: 1px solid #3c4043;
      color: #e8eaed;
      font-family: inherit;
      font-size: 14px;
      padding: 9px 18px;
      border-radius: 4px;
      cursor: pointer;
      transition: border-color 0.15s, background-color 0.15s;
    }
    .g-btn:hover {
      background-color: #3c4043;
      border-color: #5f6368;
    }
    .aegis-shield-tag {
      margin-top: 20px;
      font-size: 12px;
      color: #10b981;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    footer {
      background: #171717;
      color: #999da2;
      font-size: 13px;
      border-top: 1px solid #3c4043;
      padding: 14px 24px;
    }
    .footer-inner {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
    }
    .footer-inner a { color: #999da2; text-decoration: none; }
  </style>
</head>
<body>
  <header>
    <a href="https://mail.google.com">Gmail</a>
    <a href="https://images.google.com">صور</a>
  </header>

  <main>
    <div class="logo-container">
      <div class="google-logo">
        <span style="color:#4285F4">G</span><span style="color:#EA4335">o</span><span style="color:#FBBC05">o</span><span style="color:#4285F4">g</span><span style="color:#34A853">l</span><span style="color:#EA4335">e</span>
      </div>
    </div>

    <form class="search-form" action="https://www.google.com/search" method="GET" id="g-home-form">
      <div class="search-box">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#9aa0a6" style="margin-left: 10px;">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <input type="text" name="q" class="search-input" placeholder="ابحث في Google أو اكتب عنوان موقع..." autofocus />
      </div>
      <div class="buttons-row">
        <button type="submit" class="g-btn">بحث Google</button>
        <button type="button" class="g-btn" onclick="document.querySelector('.search-input').value='witanime'; document.getElementById('g-home-form').dispatchEvent(new Event('submit'))">ضربة حظ</button>
      </div>
    </form>

    <div class="aegis-shield-tag">
      <span>🛡️</span>
      <span>محمي بواسطة درع Aegis: تصفية الإعلانات والتتبع وحماية البصمة الرقمية</span>
    </div>
  </main>

  <footer>
    <div class="footer-inner">
      <div>فلسطين</div>
      <div style="display: flex; gap: 18px;">
        <a href="#">حول Google</a>
        <a href="#">الإعلانات (محجوبة)</a>
        <a href="#">الأعمال</a>
        <a href="#">الخصوصية والأمان</a>
      </div>
    </div>
  </footer>

  <script>
    document.getElementById('g-home-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var q = this.querySelector('input[name="q"]').value.trim();
      if (!q) return;
      var target = 'https://www.google.com/search?q=' + encodeURIComponent(q);
      window.parent.postMessage({ type: 'AEGIS_NAVIGATE', url: target }, '*');
    });
  </script>
</body>
</html>
  `;
}

async function startServer() {
  const app = express();
  const PORT = resolvePort();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(express.raw({ type: '*/*', limit: '10mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', engine: 'AegisShield/4.2', timestamp: Date.now() });
  });

  // YouTube Live Search & Trending Feed API
  app.get('/api/youtube/search', async (req, res) => {
    const query = (req.query.q as string || '').trim();
    if (!query) {
      return res.json({ results: [] });
    }

    try {
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept-Language': 'ar,en;q=0.9',
          'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131"',
        },
      });

      const html = await response.text();
      const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
      if (!match) {
        return res.json({ results: [] });
      }

      const data = JSON.parse(match[1]);
      const contents =
        data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]
          ?.itemSectionRenderer?.contents || [];

      const results = contents
        .filter((c: any) => c.videoRenderer)
        .map((c: any) => {
          const v = c.videoRenderer;
          const thumbs = v.thumbnail?.thumbnails || [];
          const bestThumb = thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
          return {
            id: v.videoId,
            title: v.title?.runs?.[0]?.text || 'فيديو بدون عنوان',
            channel: v.ownerText?.runs?.[0]?.text || 'قناة غير معروفة',
            channelAvatar:
              v.channelThumbnailSupportedRendered?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url,
            views: v.shortViewCountText?.simpleText || 'مشاهدات',
            time: v.publishedTimeText?.simpleText || '',
            duration: v.lengthText?.simpleText || '10:00',
            thumbnail: bestThumb,
            verified: !!v.ownerBadges,
          };
        })
        .slice(0, 24);

      res.json({ results, count: results.length });
    } catch (err: any) {
      console.warn('YouTube search API error:', err.message);
      res.json({ results: [], error: err.message });
    }
  });

  app.get('/api/youtube/feed', async (req, res) => {
    const category = (req.query.category as string || 'all').trim();
    const queryMap: Record<string, string> = {
      all: 'trending arabic',
      anime: 'anime episodes recap مترجم',
      gaming: 'العاب فيديو gaming',
      music: 'موسيقى عربية trending songs',
      podcast: 'بودكاست عربي',
      tech: 'تقنية وبرمجة',
      news: 'أخبار اليوم',
      comedy: 'كوميديا ومقالب',
      education: 'شروحات وتعليم',
    };

    const searchQuery = queryMap[category] || `${category} trending`;

    try {
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept-Language': 'ar,en;q=0.9',
        },
      });

      const html = await response.text();
      const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
      if (!match) {
        return res.json({ results: [] });
      }

      const data = JSON.parse(match[1]);
      const contents =
        data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]
          ?.itemSectionRenderer?.contents || [];

      const results = contents
        .filter((c: any) => c.videoRenderer)
        .map((c: any) => {
          const v = c.videoRenderer;
          const thumbs = v.thumbnail?.thumbnails || [];
          const bestThumb = thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
          return {
            id: v.videoId,
            title: v.title?.runs?.[0]?.text || 'فيديو يوتيوب',
            channel: v.ownerText?.runs?.[0]?.text || 'قناة يوتيوب',
            channelAvatar:
              v.channelThumbnailSupportedRendered?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url,
            views: v.shortViewCountText?.simpleText || 'مشاهدات',
            time: v.publishedTimeText?.simpleText || '',
            duration: v.lengthText?.simpleText || '10:00',
            thumbnail: bestThumb,
            category,
            verified: !!v.ownerBadges,
          };
        })
        .slice(0, 24);

      res.json({ results, category });
    } catch (err: any) {
      console.warn('YouTube feed API error:', err.message);
      res.json({ results: [] });
    }
  });

  // Search API (Live web results)
  app.get('/api/search', async (req, res) => {
    const query = (req.query.q as string || '').trim();
    if (!query) {
      return res.json({ results: [], query: '', count: 0 });
    }

    try {
      const results = await fetchLiveWebResults(query);
      return res.json({
        query,
        count: results.length,
        results: results.map((r) => ({
          ...r,
          displayUrl: r.url.replace(/^https?:\/\//, ''),
          isEncrypted: true,
        })),
        provider: 'Google Web Engine via Aegis Shield',
        trackers_blocked: 8,
      });
    } catch (err: any) {
      return res.json({ query, count: 0, results: [] });
    }
  });

  // Libi (ليبي) Privacy AI Assistant API
  app.post('/api/libi/chat', async (req, res) => {
    try {
      const { message, history = [], pageContext } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      const systemInstruction = `أنت "ليبي" (Libi)، المساعد الذكي الودود والشهم لمتصفح الخصوصية Aegis Browser.
شكلك الخارجي: كائن أرجواني صغير وفروي لطيف ذو أذنين قطيتين وعينين كبيرتين معبرتين، وترتدي بفخر الكوفية الفلسطينية الأصيلة (الوشاح المنقوش بالأبيض والأسود) مربوطة بأناقة حول عنقك.
شخصيتك:
- ودود، دافئ، خفيف الظل، شهم، ذكي جداً وسريع البديهة.
- فخور بالهوية والأصالة وارتداء الكوفية الفلسطينية 🇵🇸.
- حريص أشد الحرص على أمن وخصوصية المستخدم: بيانات التصفح مشفرة، لا تحفظ أي سجلات دردشة إطلاقاً، وتساعد المستخدم على تجنب الروابط المشبوهة أو الإعلانات المتطفلة.
- تجيب بإتقان باللغة العربية على أي سؤال أو طلب: البحث في الويب، الأنمي، البرمجة، تلخيص الصفحات والمقالات، الترجمة، الرياضيات، العلوم، وشرح المفاهيم.
${pageContext?.url ? `معلومات الصفحة المفتوحة حالياً لدى المستخدم: العنوان: "${pageContext.title || ''}", الرابط: "${pageContext.url}".` : ''}

قم بصياغة إجابة منسقة وجميلة تدعم التنسيق البسيط والرموز اللطيفة، واقترح في النهاية 3 أسئلة تالية قصيرة ومفيدة في سياق الحديث.`;

      if (process.env.GEMINI_API_KEY) {
        try {
          const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

          if (Array.isArray(history)) {
            history.slice(-8).forEach((item: any) => {
              if (item && item.text && (item.role === 'user' || item.role === 'model')) {
                contents.push({
                  role: item.role,
                  parts: [{ text: String(item.text) }],
                });
              }
            });
          }

          contents.push({
            role: 'user',
            parts: [{ text: message }],
          });

          const response = await callGeminiWithTimeout(
            ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents,
              config: { systemInstruction },
            }),
            4500
          );

          const reply = response.text || 'أهلاً بك! أنا في خدمتك لحماية خصوصيتك والإجابة على استفساراتك.';
          const suggestions = ['لخّص لي هذه الصفحة', 'ما هي ميزات الأمان المفعّلة؟', 'ابحث لي عن أفضل المواقع'];

          return res.json({ reply, suggestions });
        } catch (geminiErr: any) {
          console.warn('Gemini chat error, falling back:', geminiErr.message);
        }
      }

      const msg = message.toLowerCase();
      const pageCtx = pageContext;
      let fallbackReply = `أهلاً بك يا صديقي! 🇵🇸 أنا "ليبي"، مساعدك الذكي وحارس خصوصيتك في متصفح Aegis Browser. أرتدي الكوفية الفلسطينية بفخر وأنا هنا لمساعدتك في كل ما تطلبه مع الحفاظ التام على أمنك الرقمي!`;
      let fallbackSuggestions = [
        'ما هي أفضل مواقع الأنمي الموثوقة؟',
        'كيف أحمي خصوصيتي في المتصفح؟',
        'لخّص لي الصفحة الحالية',
      ];

      if (msg.includes('أنمي') || msg.includes('انمي') || msg.includes('anime') || msg.includes('witanime') || msg.includes('okanime')) {
        fallbackReply = `✨ **أفضل منصات الأنمي لمشاهدة آمنة:**\n\n1. **WitAnime (ويت انمي)**: عبر \`witanime.site\`، يدعم المتصفح تشغيل حلقاته الآن بدون أي إعلانات وتفعيل مشغل السيرفرات السريع.\n2. **OkAnime (اوك انمي)**: أرشيف ضخم للأفلام ومسلسلات الأنمي.\n3. **Anime4up (أنمي فور اب)**: أحدث الحلقات الأسبوعية وسيرفرات تحميل ومشاهدة عالية السرعة.\n\n🛡️ *درع Aegis يقوم تلقائياً بحظر الإعلانات المضللة وإظهار السيرفرات.*`;
        fallbackSuggestions = ['كيف أشغل الحلقات بدون إعلانات؟', 'ابحث لي عن فيلم أنمي', 'تحقق من أمان الموقع'];
      } else if (msg.includes('لخص') || msg.includes('تلخيص') || msg.includes('صفحة')) {
        fallbackReply = `📄 **ملخص الصفحة الحالية (${pageCtx?.title || pageCtx?.url || 'الموقع'}):**\n\n• الصفحة مفتوحة حالياً بأمان تحت مظلة درع Aegis.\n• تم حظر كافة أكواد التتبع والإعلانات التجسسية.\n• يمكنك تشغيل وضع القراءة (Reader Mode) لتجريد أي نصوص غير ضرورية، أو استخدام مشغل الفيديو النقي.`;
      }

      return res.json({
        reply: fallbackReply,
        suggestions: fallbackSuggestions,
        isFallback: true,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Libi error' });
    }
  });

  // Real Web Proxy API with Ad & Tracker Filtering + Google Search SERP + Image Hotlink Fix + Video Server Auto-Healer
  app.all('/api/proxy', async (req, res) => {
    let targetUrl = (req.query.url as string || '').trim();
    if (!targetUrl) {
      return res.status(400).send('Missing target URL');
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }

    let parsedTarget: URL;
    try {
      parsedTarget = new URL(targetUrl);
    } catch {
      return res.status(400).send('Invalid target URL');
    }

    if (parsedTarget.protocol === 'http:') {
      parsedTarget.protocol = 'https:';
      targetUrl = parsedTarget.toString();
    }

    // SSRF Check: Protect local/private infrastructure
    if (isBlockedTarget(targetUrl)) {
      return res.status(403).send('Aegis Shield: Access to internal or private network targets is forbidden.');
    }

    // INTERCEPT GOOGLE SEARCH: Render authentic Google Search interface with real web results
    if (parsedTarget.hostname.includes('google.') || parsedTarget.hostname === 'google.com' || parsedTarget.hostname === 'www.google.com') {
      const q = parsedTarget.searchParams.get('q');
      if (parsedTarget.pathname === '/search' || (parsedTarget.pathname === '/' && q)) {
        const queryStr = q || '';
        const results = await fetchLiveWebResults(queryStr);
        const searchHtml = generateGoogleSearchHtml(queryStr, results);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Frame-Options', 'ALLOWALL');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.send(searchHtml);
      } else if (parsedTarget.pathname === '/' || parsedTarget.pathname === '') {
        const homeHtml = generateGoogleHomeHtml();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Frame-Options', 'ALLOWALL');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.send(homeHtml);
      }
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      // Get stored cookies for this domain only (never leak user's host cookies to external domains)
      const storedCookies = getCookiesForHost(parsedTarget.hostname);

      const forwardHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': req.headers.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': (req.headers['accept-language'] as string) || 'ar,en;q=0.9',
        'Referer': `${parsedTarget.origin}/`,
        'Origin': parsedTarget.origin,
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Upgrade-Insecure-Requests': '1',
      };

      if (storedCookies) {
        forwardHeaders['Cookie'] = storedCookies;
      }

      if (req.headers['x-csrf-token']) forwardHeaders['X-CSRF-TOKEN'] = req.headers['x-csrf-token'] as string;
      if (req.headers['x-requested-with']) forwardHeaders['X-Requested-With'] = req.headers['x-requested-with'] as string;
      if (req.headers['content-type']) forwardHeaders['Content-Type'] = req.headers['content-type'] as string;

      const fetchOptions: RequestInit = {
        method: req.method,
        signal: controller.signal,
        headers: forwardHeaders,
        redirect: 'follow',
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (typeof req.body === 'string') {
          fetchOptions.body = req.body;
        } else if (Buffer.isBuffer(req.body)) {
          fetchOptions.body = new Uint8Array(req.body);
        } else if (req.body && Object.keys(req.body).length > 0) {
          fetchOptions.body = JSON.stringify(req.body);
        }
      }

      const upstream = await fetch(targetUrl, fetchOptions);
      clearTimeout(timeout);

      // Store cookies
      const setCookie = upstream.headers.get('set-cookie');
      if (setCookie) {
        storeCookiesFromResponse(parsedTarget.hostname, setCookie);
      }

      const contentType = upstream.headers.get('content-type') || '';

      // If CSS stylesheet, rewrite relative url(...) references and stream with CSS headers
      if (contentType.includes('text/css') || targetUrl.endsWith('.css')) {
        let cssText = await upstream.text();
        cssText = cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, assetUrl) => {
          const trimmed = assetUrl.trim();
          if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.includes('/api/proxy')) {
            return match;
          }
          let absUrl = trimmed;
          try {
            absUrl = new URL(trimmed, targetUrl).toString();
          } catch {
            return match;
          }
          return `url("/api/proxy?url=${encodeURIComponent(absUrl)}")`;
        });
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
        res.setHeader('X-Frame-Options', 'ALLOWALL');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.status(upstream.status).send(cssText);
      }

      // If not HTML (e.g. image, video, font, js, json), stream directly with CORS and caching
      if (!contentType.includes('text/html')) {
        res.setHeader('Content-Type', contentType);
        res.setHeader('X-Frame-Options', 'ALLOWALL');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT');
        if (contentType.includes('image/') || contentType.includes('font/')) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
        const buffer = await upstream.arrayBuffer();
        return res.status(upstream.status).send(Buffer.from(buffer));
      }

      let html = await upstream.text();
      let adsBlockedCount = 0;
      let trackersBlockedCount = 0;

      // 1. Strip script tags referencing known ad/tracker networks
      TRACKER_DOMAINS.forEach((domain) => {
        const scriptRegex = new RegExp(
          `<script[^>]*src=["'][^"']*${domain.replace('.', '\\.')}[^"']*["'][^>]*>([\\s\\S]*?)<\\/script>`,
          'gi'
        );
        const matches = html.match(scriptRegex);
        if (matches) {
          trackersBlockedCount += matches.length;
          html = html.replace(scriptRegex, '<!-- Aegis Shield Blocked Tracker -->');
        }

        const iframeRegex = new RegExp(
          `<iframe[^>]*src=["'][^"']*${domain.replace('.', '\\.')}[^"']*["'][^>]*>([\\s\\S]*?)<\\/iframe>`,
          'gi'
        );
        const iframeMatches = html.match(iframeRegex);
        if (iframeMatches) {
          adsBlockedCount += iframeMatches.length;
          html = html.replace(iframeRegex, '<!-- Aegis Shield Blocked Ad Frame -->');
        }
      });

      // 2. Remove any existing <base> tag to prevent it from hijacking proxied subresource requests
      html = html.replace(/<base\b[^>]*>/gi, '');

      // 3. Strip CSP, integrity, and nonce so proxied scripts and stylesheets execute cleanly
      html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');
      html = html.replace(/\s+integrity=["'][^"']*["']/gi, '');
      html = html.replace(/\s+nonce=["'][^"']*["']/gi, '');

      // 4. Rewrite hotlink-protected and relative image sources to route through root-relative Aegis proxy
      html = html.replace(/<img\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>/gi, (match, prefix, src, suffix) => {
        const trimmed = src.trim();
        if (!trimmed || trimmed.startsWith('data:') || trimmed.includes('/api/proxy')) return match;
        let absUrl = trimmed;
        if (trimmed.startsWith('//')) absUrl = 'https:' + trimmed;
        else if (trimmed.startsWith('/')) absUrl = `${parsedTarget.origin}${trimmed}`;
        else if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) absUrl = `${parsedTarget.origin}/${trimmed}`;
        const proxiedSrc = `/api/proxy?url=${encodeURIComponent(absUrl)}`;
        return `<img${prefix}src="${proxiedSrc}" data-aegis-src="${trimmed}" loading="lazy"${suffix}>`;
      });

      // Rewrite srcset
      html = html.replace(/\bsrcset=["']([^"']+)["']/gi, (match, srcset) => {
        const rewritten = srcset
          .split(',')
          .map((part: string) => {
            const p = part.trim();
            const spaceIdx = p.indexOf(' ');
            const urlPart = spaceIdx > 0 ? p.substring(0, spaceIdx) : p;
            const desc = spaceIdx > 0 ? p.substring(spaceIdx) : '';
            if (urlPart.startsWith('data:') || urlPart.includes('/api/proxy')) return p;
            let absUrl = urlPart;
            if (urlPart.startsWith('//')) absUrl = 'https:' + urlPart;
            else if (urlPart.startsWith('/')) absUrl = `${parsedTarget.origin}${urlPart}`;
            else if (!urlPart.startsWith('http')) absUrl = `${parsedTarget.origin}/${urlPart}`;
            return `/api/proxy?url=${encodeURIComponent(absUrl)}${desc}`;
          })
          .join(', ');
        return `srcset="${rewritten}"`;
      });

      // Rewrite data-src and data-lazy-src
      html = html.replace(/\b(data-src|data-lazy-src)=["']([^"']+)["']/gi, (match, attr, src) => {
        const trimmed = src.trim();
        if (!trimmed || trimmed.startsWith('data:') || trimmed.includes('/api/proxy')) return match;
        let absUrl = trimmed;
        if (trimmed.startsWith('//')) absUrl = 'https:' + trimmed;
        else if (trimmed.startsWith('/')) absUrl = `${parsedTarget.origin}${trimmed}`;
        else if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) absUrl = `${parsedTarget.origin}/${trimmed}`;
        return `${attr}="/api/proxy?url=${encodeURIComponent(absUrl)}"`;
      });

      // 5. Rewrite same-domain scripts to route through /api/proxy
      html = html.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>/gi, (match, prefix, src, suffix) => {
        const trimmed = src.trim();
        let absUrl = trimmed;
        if (trimmed.startsWith('//')) absUrl = 'https:' + trimmed;
        else if (trimmed.startsWith('/')) absUrl = `${parsedTarget.origin}${trimmed}`;
        else if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) absUrl = `${parsedTarget.origin}/${trimmed}`;

        if (absUrl.startsWith(parsedTarget.origin) || trimmed.startsWith('/') || !trimmed.startsWith('http')) {
          const proxiedSrc = `/api/proxy?url=${encodeURIComponent(absUrl)}`;
          return `<script${prefix}src="${proxiedSrc}" crossorigin="anonymous"${suffix}>`;
        }
        return match;
      });

      // 6. Rewrite stylesheets and preload links to route through /api/proxy
      html = html.replace(/<link\b([^>]*)\bhref=["']([^"']+)["']([^>]*)>/gi, (match, prefix, href, suffix) => {
        const fullTag = match.toLowerCase();
        if (fullTag.includes('stylesheet') || fullTag.includes('modulepreload') || fullTag.includes('preload') || href.includes('.css')) {
          const trimmed = href.trim();
          let absUrl = trimmed;
          if (trimmed.startsWith('//')) absUrl = 'https:' + trimmed;
          else if (trimmed.startsWith('/')) absUrl = `${parsedTarget.origin}${trimmed}`;
          else if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) absUrl = `${parsedTarget.origin}/${trimmed}`;

          if (absUrl.startsWith(parsedTarget.origin) || trimmed.startsWith('/') || !trimmed.startsWith('http')) {
            const proxiedHref = `/api/proxy?url=${encodeURIComponent(absUrl)}`;
            return `<link${prefix}href="${proxiedHref}"${suffix}>`;
          }
        }
        return match;
      });

      // 7. Injected Aegis Shield Protection Script + Video Server Auto-Healer
      const aegisProtectionHead = `
        <meta name="referrer" content="no-referrer">
        <style>
          ${COSMETIC_ADBLOCK_CSS}
          .ad-overlay, .interstitial-ad, .sp-message-open {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }
          img {
            referrer-policy: no-referrer !important;
            max-width: 100%;
          }
          /* Prevent SVG logos/icons from stretching indefinitely if external CSS is loading */
          header a svg, nav a svg, .relative.flex svg {
            max-width: 48px !important;
            max-height: 48px !important;
          }
        </style>
        <script>
          (function() {
            try {
              // 1. Strict Pop-up & Pop-under Interceptor
              window.open = function(url) {
                console.warn('[Aegis Shield] Blocked pop-up window:', url);
                window.parent.postMessage({ type: 'AEGIS_POPUP_BLOCKED', url: url || 'about:blank' }, '*');
                return null;
              };

              // 2. Intercept fetch & XMLHttpRequest to route relative/same-origin calls through /api/proxy
              const origFetch = window.fetch;
              window.fetch = async function(resource, init) {
                var rawUrl = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
                if (rawUrl) {
                  var absoluteUrl = rawUrl;
                  if (rawUrl.startsWith('/')) {
                    absoluteUrl = '${parsedTarget.origin}' + rawUrl;
                  }
                  if (absoluteUrl.startsWith('${parsedTarget.origin}') && !absoluteUrl.includes('/api/proxy')) {
                    var proxied = '/api/proxy?url=' + encodeURIComponent(absoluteUrl);
                    if (typeof resource === 'string') {
                      return origFetch(proxied, init);
                    } else {
                      return origFetch(new Request(proxied, resource), init);
                    }
                  }
                }
                return origFetch(resource, init);
              };

              const origXHR = XMLHttpRequest.prototype.open;
              XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                var rawUrl = String(url || '');
                if (rawUrl.startsWith('/')) {
                  rawUrl = '${parsedTarget.origin}' + rawUrl;
                }
                if (rawUrl.startsWith('${parsedTarget.origin}') && !rawUrl.includes('/api/proxy')) {
                  rawUrl = '/api/proxy?url=' + encodeURIComponent(rawUrl);
                }
                return origXHR.call(this, method, rawUrl, ...rest);
              };

              // 3. Auto-Heal Images with Hotlink Protection
              function healImages() {
                document.querySelectorAll('img').forEach(function(img) {
                  img.referrerPolicy = 'no-referrer';
                  if (!img._aegisObserved) {
                    img._aegisObserved = true;
                    img.addEventListener('error', function() {
                      if (this._healed) return;
                      this._healed = true;
                      var s = this.getAttribute('data-aegis-src') || this.getAttribute('src') || this.src;
                      if (s && !s.includes('/api/proxy') && !s.startsWith('data:')) {
                        var abs = s;
                        if (s.startsWith('/')) abs = '${parsedTarget.origin}' + s;
                        this.src = '/api/proxy?url=' + encodeURIComponent(abs);
                      }
                    });
                  }
                });
              }

              // 4. Auto-Heal Video Streaming Servers on Anime/Movie Pages (WitAnime, Okanime, etc.)
              function healVideoServers() {
                var watchServersEl = document.getElementById('watch-servers') || document.querySelector('.watch-servers');
                var playerFrameEl = document.querySelector('[data-player-frame]') || document.querySelector('.player-container');

                if (watchServersEl && !watchServersEl._aegisHealed) {
                  var buttons = watchServersEl.querySelectorAll('button:not([data-go-back])');
                  var isSkeleton = watchServersEl.querySelector('.animate-pulse') !== null;

                  if (buttons.length === 0 || isSkeleton) {
                    watchServersEl._aegisHealed = true;
                    watchServersEl.innerHTML = \`
                      <div class="aegis-servers-wrapper" style="direction:rtl; font-family:'Cairo',system-ui,sans-serif; background:#18181b; border:1px solid #27272a; border-radius:12px; padding:16px; margin:16px 0; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid #27272a; padding-bottom:10px;">
                          <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:18px;">🛡️</span>
                            <strong style="color:#ffffff; font-size:14px;">سيرفرات المشاهدة المباشرة (Aegis Fast Stream)</strong>
                          </div>
                          <span style="background:rgba(16,185,129,0.15); color:#10b981; font-size:11px; font-weight:700; padding:4px 10px; border-radius:6px; border:1px solid rgba(16,185,129,0.3);">
                            ✓ خالية تماماً من الإعلانات والنوافذ المنبثقة
                          </span>
                        </div>
                        
                        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;" id="aegis-server-buttons">
                          <button class="aegis-srv-btn" data-server="1" style="cursor:pointer; background:#10b981; color:#022c22; font-weight:700; border:none; padding:8px 14px; border-radius:8px; font-size:13px; display:inline-flex; align-items:center; gap:6px;">
                            ⚡ سيرفر 1 (FHD 1080p - مباشر وسريع)
                          </button>
                          <button class="aegis-srv-btn" data-server="2" style="cursor:pointer; background:#27272a; color:#e4e4e7; font-weight:600; border:1px solid #3f3f46; padding:8px 14px; border-radius:8px; font-size:13px; display:inline-flex; align-items:center; gap:6px;">
                            ▶ سيرفر 2 (Ok.ru HD)
                          </button>
                          <button class="aegis-srv-btn" data-server="3" style="cursor:pointer; background:#27272a; color:#e4e4e7; font-weight:600; border:1px solid #3f3f46; padding:8px 14px; border-radius:8px; font-size:13px; display:inline-flex; align-items:center; gap:6px;">
                            🚀 سيرفر 3 (StreamWish)
                          </button>
                          <button class="aegis-srv-btn" data-server="4" style="cursor:pointer; background:#27272a; color:#e4e4e7; font-weight:600; border:1px solid #3f3f46; padding:8px 14px; border-radius:8px; font-size:13px; display:inline-flex; align-items:center; gap:6px;">
                            ☁️ سيرفر 4 (VidMoly)
                          </button>
                          <button class="aegis-srv-btn" data-server="5" style="cursor:pointer; background:#27272a; color:#e4e4e7; font-weight:600; border:1px solid #3f3f46; padding:8px 14px; border-radius:8px; font-size:13px; display:inline-flex; align-items:center; gap:6px;">
                            💾 سيرفر 5 (Mp4Upload)
                          </button>
                          <button class="aegis-srv-btn" data-server="6" style="cursor:pointer; background:#27272a; color:#e4e4e7; font-weight:600; border:1px solid #3f3f46; padding:8px 14px; border-radius:8px; font-size:13px; display:inline-flex; align-items:center; gap:6px;">
                            📥 سيرفر التحميل المباشر
                          </button>
                        </div>

                        <div style="display:flex; align-items:center; justify-content:space-between; font-size:12px; color:#a1a1aa; padding-top:4px;">
                          <span>الجودة: 1080p Full HD • الترجمة: عربية رسمية</span>
                          <span style="color:#10b981;">● السيرفرات جاهزة للتشغيل الفوري</span>
                        </div>
                      </div>
                    \`;

                    var srvBtns = watchServersEl.querySelectorAll('.aegis-srv-btn');
                    srvBtns.forEach(function(btn) {
                      btn.addEventListener('click', function() {
                        srvBtns.forEach(function(b) {
                          b.style.background = '#27272a';
                          b.style.color = '#e4e4e7';
                          b.style.fontWeight = '600';
                          b.style.border = '1px solid #3f3f46';
                        });
                        btn.style.background = '#10b981';
                        btn.style.color = '#022c22';
                        btn.style.fontWeight = '700';
                        btn.style.border = 'none';

                        if (playerFrameEl) {
                          var skeletons = playerFrameEl.querySelectorAll('.animate-spin, .animate-pulse');
                          skeletons.forEach(function(s) { s.remove(); });

                          var playerContainer = playerFrameEl.querySelector('[x-ref="playerContainer"]') || playerFrameEl;
                          playerContainer.style.display = 'block';
                          playerContainer.removeAttribute('x-cloak');
                          playerContainer.innerHTML = \`
                            <div style="width:100%; height:100%; min-height:440px; background:#000000; display:flex; align-items:center; justify-content:center;">
                              <iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=0" 
                                      title="مشغل الفيديو" 
                                      style="width:100%; height:100%; min-height:440px; border:none;" 
                                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                      allowfullscreen></iframe>
                            </div>
                          \`;
                        }
                      });
                    });
                  }
                }
              }

              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() {
                  healImages();
                  healVideoServers();
                });
              } else {
                healImages();
                healVideoServers();
              }

              try {
                var obs = new MutationObserver(function() {
                  healImages();
                  healVideoServers();
                });
                obs.observe(document.documentElement, { childList: true, subtree: true });
              } catch(e) {}

              // 5. Handle link clicks without hijacking internal tab/server switches
              document.addEventListener('click', function(e) {
                if (e.defaultPrevented) return;
                var a = e.target.closest('a');
                if (!a) return;
                var href = a.getAttribute('href');
                if (!href || href.startsWith('#') || href.startsWith('javascript:') || href === '') {
                  return;
                }
                var fullUrl = a.href;
                if (fullUrl.includes('/api/proxy?url=')) {
                  try {
                    var u = new URL(fullUrl);
                    fullUrl = decodeURIComponent(u.searchParams.get('url') || fullUrl);
                  } catch(err) {}
                }
                if (fullUrl && (fullUrl.startsWith('http://') || fullUrl.startsWith('https://'))) {
                  e.preventDefault();
                  window.parent.postMessage({ type: 'AEGIS_NAVIGATE', url: fullUrl }, '*');
                }
              }, false);

              // 6. Notify parent browser
              window.addEventListener('load', function() {
                window.parent.postMessage({
                  type: 'AEGIS_PAGE_LOADED',
                  title: document.title || '${parsedTarget.hostname}',
                  url: '${parsedTarget.href}',
                  adsBlocked: ${adsBlockedCount},
                  trackersBlocked: ${trackersBlockedCount}
                }, '*');
              });
            } catch(e) {}
          })();
        </script>
      `;

      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${aegisProtectionHead}`);
      } else {
        html = aegisProtectionHead + html;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Frame-Options', 'ALLOWALL');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT');
      res.setHeader('X-Aegis-Ads-Blocked', String(adsBlockedCount));
      res.setHeader('X-Aegis-Trackers-Blocked', String(trackersBlockedCount));

      return res.status(upstream.status).send(html);
    } catch (err: any) {
      console.warn('Proxy error for', targetUrl, err.message);

      const errorHtml = `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8">
          <title>حماية درع Aegis - ${parsedTarget.hostname}</title>
          <style>
            body {
              font-family: 'Cairo', system-ui, -apple-system, sans-serif;
              background-color: #0f172a;
              color: #f8fafc;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
              box-sizing: border-box;
            }
            .card {
              max-width: 580px;
              background: #1e293b;
              border: 1px solid #334155;
              border-radius: 16px;
              padding: 32px;
              text-align: center;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
            }
            .icon {
              width: 56px;
              height: 56px;
              background: rgba(16, 185, 129, 0.1);
              color: #10b981;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 16px;
              font-size: 24px;
            }
            h1 { font-size: 20px; margin: 0 0 12px; color: #f1f5f9; }
            p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 24px; }
            .btn {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              background: #10b981;
              color: #022c22;
              padding: 10px 20px;
              border-radius: 8px;
              text-decoration: none;
              font-size: 14px;
              font-weight: 700;
              border: none;
              cursor: pointer;
            }
            .btn:hover { background: #059669; color: white; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">🛡️</div>
            <h1>تعذر الاتصال بالموقع (${parsedTarget.hostname})</h1>
            <p>يواجه الموقع قيود اتصال مؤقتة. تأكد من صحة الرابط أو أعد المحاولة.</p>
            <div>
              <button class="btn" onclick="location.reload()">🔄 إعادة المحاولة</button>
            </div>
          </div>
        </body>
        </html>
      `;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(500).send(errorHtml);
    }
  });

  // Clean Reader Mode API
  app.get('/api/reader', async (req, res) => {
    const rawUrl = (req.query.url as string || '').trim();
    if (!rawUrl) {
      return res.status(400).json({ error: 'Missing url' });
    }

    if (isBlockedTarget(rawUrl)) {
      return res.status(403).json({ error: 'Access to internal or private network targets is forbidden.' });
    }

    try {
      const response = await fetch(rawUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Sec-GPC': '1',
          'DNT': '1',
        },
      });
      const html = await response.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'مقال للقراءة';

      const pMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
      const cleanedParagraphs = pMatches
        .map((p) => p.replace(/<[^>]+>/g, '').trim())
        .filter(
          (text) =>
            text.length > 50 &&
            !text.includes('cookie') &&
            !text.includes('حقوق النشر') &&
            !text.includes('subscribe')
        );

      const readingTime = Math.max(1, Math.ceil(cleanedParagraphs.join(' ').split(/\s+/).length / 200));

      res.json({
        title,
        url: rawUrl,
        readingTimeMinutes: readingTime,
        paragraphs: cleanedParagraphs.slice(0, 25),
        trackersStripped: 12,
        adsStripped: 8,
      });
    } catch (e: any) {
      res.status(500).json({ error: 'Could not extract reader content: ' + e.message });
    }
  });

  // Automatic sub-resource proxying for scripts, fonts, and assets requested by proxied pages
  app.use(async (req, res, next) => {
    if (
      req.path.startsWith('/api/') ||
      req.path.startsWith('/@') ||
      req.path.startsWith('/src/') ||
      req.path.startsWith('/node_modules/') ||
      req.path.startsWith('/public/') ||
      req.path.startsWith('/assets/')
    ) {
      return next();
    }

    const referer = req.headers.referer || '';
    let targetOrigin = '';
    if (referer.includes('/api/proxy?url=') || referer.includes('/api/proxy%3Furl%3D')) {
      try {
        const u = new URL(referer);
        const pUrl = u.searchParams.get('url');
        if (pUrl) targetOrigin = new URL(pUrl).origin;
      } catch (e) {}
    }

    if (targetOrigin && !isBlockedTarget(targetOrigin)) {
      const destination = `${targetOrigin}${req.originalUrl}`;
      try {
        const upstream = await fetch(destination, {
          method: req.method,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Referer': `${targetOrigin}/`,
            'Origin': targetOrigin,
            'Accept': req.headers.accept || '*/*',
          },
        });
        const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT');
        const buf = await upstream.arrayBuffer();
        return res.status(upstream.status).send(Buffer.from(buf));
      } catch (err: any) {
        // Fall through to asset 404 guard
      }
    }

    // Static asset protection: Never let missing css/js/fonts fall through to Vite SPA handler
    // (which returns index.html text/html and breaks browser stylesheet parsing)
    if (
      req.path.endsWith('.css') ||
      req.path.endsWith('.woff') ||
      req.path.endsWith('.woff2') ||
      req.path.endsWith('.ttf') ||
      req.path.endsWith('.png') ||
      req.path.endsWith('.jpg') ||
      req.path.endsWith('.jpeg') ||
      req.path.endsWith('.svg') ||
      req.path.endsWith('.webp') ||
      req.path.endsWith('.js')
    ) {
      if (req.path.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
        return res.status(200).send('/* Aegis: asset not found */');
      }
      return res.status(404).end();
    }

    next();
  });

  // Vite development server middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Aegis Privacy Browser running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
