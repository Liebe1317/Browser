// End-to-end: the REAL server.ts against fake HTTPS upstream sites.
// Needs the openssl CLI (for a throw-away certificate). Skipped when it is missing.
import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { ok, freePort, makeCert } from './helpers/util.mjs';

try {
  execFileSync('openssl', ['version'], { stdio: 'ignore' });
} catch {
  console.log('SKIP - openssl not found');
  process.exit(0);
}

const root = path.resolve(import.meta.dirname, '..');
const UP = await freePort();
const APP = await freePort();
const tls = makeCert();

const seen = [];
const upstream = https.createServer(tls, (req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  seen.push({ host, url: req.url, cookie: req.headers.cookie || '', range: req.headers.range || '', origin: req.headers.origin || '', userAgent: req.headers['user-agent'] || '', clientHints: req.headers['sec-ch-ua'] || '' });
  if (host === 'evil.example.test' && req.url === '/?mode=private') {
    res.setHeader('Set-Cookie', 'login=PRIVATE; Path=/; HttpOnly; Secure; SameSite=Lax');
    res.setHeader('Content-Type', 'text/html');
    return res.end('<html><head><link rel="stylesheet" href="/style.css"></head><body>private A</body></html>');
  }
  if (host === 'evil.example.test' && req.url === '/') {
    res.setHeader('Set-Cookie', ['login=A; Path=/; HttpOnly', 'pref=dark; Path=/']);
    res.setHeader('Content-Type', 'text/html');
    return res.end(`<html><head><title>A</title><link rel="stylesheet" href="/style.css"><link rel="preconnect" href="https://direct.test"></head><body><img src="https://bank.example.test:${UP}/pixel.png"><script src="https://bank.example.test:${UP}/lib.js"></script></body></html>`);
  }
  if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end('body{background:url(/bg.png)}'); }
  if (req.url === '/pixel.png') { res.setHeader('Set-Cookie', 'track=B; Path=/'); res.setHeader('Content-Type', 'image/png'); return res.end('PNG'); }
  if (req.url === '/lib.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end('window.lib=1'); }
  if (host === 'bank.example.test' && req.url === '/') { res.setHeader('Set-Cookie', 'loginB=1; Path=/'); res.setHeader('Content-Type', 'text/html'); return res.end('<html><head></head><body>B home</body></html>'); }
  if (host === 'evil.example.test' && req.url === '/same-origin-context') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ origin: req.headers.origin || '', userAgent: req.headers['user-agent'] || '', clientHints: req.headers['sec-ch-ua'] || '' }));
  }
  if (host === 'evil.example.test' && req.url === '/redirect-to-bank') {
    res.statusCode = 302;
    res.setHeader('Location', `https://bank.example.test:${UP}/origin-check`);
    return res.end();
  }
  if (host === 'bank.example.test' && req.url === '/origin-check') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ origin: req.headers.origin || '' }));
  }
  if (host === 'evil.example.test' && req.url === '/media-range') {
    if (req.headers.range === 'bytes=2-4') {
      res.statusCode = 206;
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Range', 'bytes 2-4/10');
      res.setHeader('Accept-Ranges', 'bytes');
      return res.end('234');
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'video/mp4');
    return res.end('0123456789');
  }
  if (req.url === '/whoami') { res.setHeader('Content-Type', 'text/plain'); return res.end('cookie=' + (req.headers.cookie || '')); }
  res.statusCode = 404;
  res.end('nf');
});
await new Promise((r) => upstream.listen(UP, '127.0.0.1', r));

const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
  cwd: root,
  stdio: 'ignore',
  env: { ...process.env, NODE_ENV: 'production', PORT: String(APP), NODE_OPTIONS: `--import ${pathToFileURL(path.join(root, 'tests/helpers/preload.mjs')).href}`, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
});

const req = (p, { method = 'GET', headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: APP, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    r.on('error', reject);
    r.end(body);
  });
const app = { 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'iframe' };
const appWrite = { ...app, Origin: `http://127.0.0.1:${APP}` };
const page = { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'no-cors' }; // opaque-origin page request
for (let i = 0; i < 60; i++) {
  try { const health = await req('/api/health', { headers: app }); if (health.status === 200) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const proxy = (url, q = '', context = 'regular') => `/api/proxy?${q}ctx=${encodeURIComponent(context)}&url=${encodeURIComponent(url)}`;
const A = `https://evil.example.test:${UP}`;
const B = `https://bank.example.test:${UP}`;
const sidOf = (r) => (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('aegis_sid='));

try {
  let r = await req(proxy(A + '/'), { headers: app });
  const sid1 = sidOf(r);
  ok(r.status === 200 && !!sid1, 'the app opens site A through the proxy and gets a session cookie');
  ok(/sandbox/.test(r.headers['content-security-policy'] || '') && !/allow-same-origin/.test(r.headers['content-security-policy']), 'response has a CSP sandbox WITHOUT allow-same-origin');
  ok(/connect-src 'self'/.test(r.headers['content-security-policy']), 'response forces all network access through the proxy (connect-src self)');
  ok(r.headers['x-content-type-options'] === 'nosniff' && r.headers['referrer-policy'] === 'no-referrer', 'nosniff and no-referrer are set');
  const tokA = (r.body.match(/\/api\/proxy\?t=([a-f0-9]{48})&url=/) || [])[1];
  ok(!!tokA, 'proxied URLs carry a page token');
  ok(!/\/api\/proxy\?url=/.test(r.body), 'no un-tokened proxy URLs remain');
  ok(!/preconnect/.test(r.body), 'preconnect hints are removed');
  ok(new RegExp('<script[^>]*src="/api/proxy\\?t=' + tokA + '&url=[^"]*lib\\.js').test(r.body), 'a third-party <script> is routed through the proxy');
  ok(r.body.includes('Object.defineProperty(window, name'), 'the storage stand-in for the opaque origin is injected');

  r = await req(proxy(A + '/style.css', `t=${tokA}&`), { headers: page });
  ok(r.status === 200 && r.body.includes('/api/proxy?t=' + tokA + '&url='), 'CSS loads via the token and its urls get the same token');
  r = await req(proxy(A + '/same-origin-context', `t=${tokA}&`), { method: 'POST', headers: { ...page, Origin: 'null', 'User-Agent': 'Mozilla/5.0 Chrome/134.0.0.0 Safari/537.36', 'Sec-CH-UA': '"Chromium";v="134", "Google Chrome";v="134"' } });
  const sameOriginContext = JSON.parse(r.body);
  ok(r.status === 200 && sameOriginContext.origin === A, 'same-origin POST receives the capability-bound upstream Origin');
  ok(sameOriginContext.userAgent.includes('Chrome/134') && sameOriginContext.clientHints.includes('134'), 'upstream receives consistent browser User-Agent and Client Hints');
  r = await req(proxy(A + '/redirect-to-bank', `t=${tokA}&`), { method: 'POST', headers: { ...page, Origin: 'null' } });
  const redirectedOrigin = JSON.parse(r.body);
  ok(r.status === 200 && redirectedOrigin.origin === '', 'same-origin Origin is stripped on cross-origin redirects');

  r = await req(proxy(A + '/media-range', `t=${tokA}&`), { headers: { ...page, Range: 'bytes=2-4' } });
  ok(r.status === 206 && r.body === '234', 'media byte-range response is preserved through the proxy');
  ok(r.headers['content-range'] === 'bytes 2-4/10' && r.headers['accept-ranges'] === 'bytes', 'media range metadata reaches Chromium');
  ok(seen.some((entry) => entry.url === '/media-range' && entry.range === 'bytes=2-4'), 'validated Range header reaches the upstream media host');

  r = await req(proxy(A + '/whoami', `t=${tokA}&`), { headers: page });
  ok(r.body.includes('login=A') && r.body.includes('pref=dark'), "the page's own cookies reach its own site");
  ok(r.headers['access-control-allow-origin'] === '*', 'CORS header present for opaque-origin fetches');

  await req(proxy(B + '/pixel.png', `t=${tokA}&`), { headers: page });
  r = await req(proxy(B + '/whoami', `t=${tokA}&`), { headers: page });
  ok(!r.body.includes('track=B') && !r.body.includes('login='), 'third-party cookies are blocked (default) and A\'s login is never sent to B');

  r = await req(proxy(B + '/'), { headers: { ...app, Cookie: sid1 } });
  const tokB = (r.body.match(/t=([a-f0-9]{48})&url=/) || [])[1];
  ok(tokB && tokB !== tokA, 'site B gets its own token (separate cookie partition)');
  r = await req(proxy(B + '/whoami', `t=${tokB}&`), { headers: page });
  ok(r.body.includes('loginB=1'), 'site B first-party cookies work in its own partition');
  r = await req(proxy(B + '/whoami', `t=${tokA}&`), { headers: page });
  ok(!r.body.includes('loginB=1'), "a page with A's token CANNOT use the user's login on a sibling subdomain");

  r = await req(proxy(A + '/?mode=private', '', 'private-tab-123'), { headers: { ...app, Cookie: sid1 } });
  const tokPrivate = (r.body.match(/t=([a-f0-9]{48})&url=/) || [])[1];
  ok(tokPrivate && tokPrivate !== tokA, 'private browsing context receives an independent capability token');
  r = await req(proxy(A + '/whoami', `t=${tokPrivate}&`), { headers: page });
  ok(r.body.includes('login=PRIVATE') && !r.body.includes('login=A'), 'private browsing cookies are isolated from the regular profile');
  r = await req(proxy(A + '/whoami', `t=${tokA}&`), { headers: page });
  ok(r.body.includes('login=A') && !r.body.includes('login=PRIVATE'), 'regular browsing cookies are unchanged by private context');

  r = await req('/api/session/bootstrap', { method: 'POST', headers: { ...appWrite, Cookie: sid1 } });
  const closeCsrf = (() => { try { return JSON.parse(r.body).csrfToken; } catch { return ''; } })();
  r = await req('/api/session/context/close', { method: 'POST', headers: { ...appWrite, Cookie: sid1, 'X-Aegis-CSRF': closeCsrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ contextId: 'private-tab-123' }) });
  ok(r.status === 200, 'closing a private context erases its stored session partition');
  r = await req(proxy(A + '/whoami', `t=${tokPrivate}&`), { headers: page });
  ok(r.status === 403, 'page capabilities from a closed private context are revoked');
  r = await req(proxy(A + '/whoami', `t=${tokA}&`), { headers: page });
  ok(r.status === 200 && r.body.includes('login=A'), 'closing a private context does not destroy the regular profile');

  r = await req(proxy(A + '/whoami'), { headers: app });
  ok(r.status === 200 && r.body === 'cookie=', 'another client gets an empty jar (no leakage between users)');

  r = await req(proxy('https://ad.doubleclick.net/p.gif', `t=${tokA}&`), { headers: page });
  ok(r.status === 204 && r.headers['x-aegis-blocked'] === 'ad', 'a sub-request to an ad network is blocked at the proxy (204)');
  r = await req(proxy('https://stats.google-analytics.com/collect', `t=${tokA}&`), { headers: page });
  ok(r.status === 204 && r.headers['x-aegis-blocked'] === 'tracker', 'a sub-request to a tracker is blocked at the proxy (204)');
  r = await req(proxy(A + '/whoami', `t=${tokA}&s=000000000&`), { headers: page });
  ok(r.status === 200, 'a token request carrying "s" flags is still served');
  r = await req(proxy('https://ad.doubleclick.net/p.gif', `t=${tokA}&`), { headers: page });
  ok(r.status === 204, 'a page cannot switch the privacy shield off (the "s" flags are ignored on token requests)');

  r = await req(proxy(A + '/whoami'), { headers: page });
  ok(r.status === 403 && !r.headers['x-aegis-proxy-error'], 'cross-site requests without a token are rejected without a recovery signal');
  r = await req(proxy(A + '/whoami'), { headers: { ...app, 'Sec-Fetch-Site': 'same-site' } }); ok(r.status === 403, 'same-site request without a token -> 403');
  r = await req(proxy(A + '/whoami', 't=' + 'f'.repeat(48) + '&'), { headers: page });
  ok(r.status === 403 && r.headers['x-aegis-proxy-error'] === 'capability-expired', 'invalid or expired page capabilities return a bounded recovery signal');
  ok(r.headers['access-control-allow-origin'] === '*' && /X-Aegis-Proxy-Error/i.test(r.headers['access-control-expose-headers'] || ''), 'the page can read only the proxy recovery header on capability errors');
  r = await req(proxy('http://127.0.0.1:1/', `t=${tokA}&`), { headers: page }); ok(r.status === 403, 'a valid token does not bypass the SSRF check');

  r = await req('/api/health', { headers: page }); ok(r.status === 403, 'other /api routes refuse cross-site callers');
  r = await req('/api/session/clear', { method: 'POST', headers: page }); ok(r.status === 403, 'session/clear refuses cross-site callers');
  r = await req('/api/health', { headers: app }); ok(r.status === 200, 'the app UI itself can use /api');
  r = await req('/api/health'); ok(r.status === 403, 'API requests without Fetch Metadata fail closed');
  r = await req('/api/health', { headers: { ...app, Origin: 'https://attacker.example' } }); ok(r.status === 403, 'API requests with a forged Origin are rejected');
  r = await req('/api/health', { headers: { ...app, Host: 'attacker.example' } }); ok(r.status === 421, 'DNS-rebinding Host headers are rejected');

  r = await req('/api/session/bootstrap', { method: 'POST', headers: { ...appWrite, Cookie: sid1 } });
  const csrf = (() => { try { return JSON.parse(r.body).csrfToken; } catch { return ''; } })();
  ok(r.status === 200 && /^[a-f0-9]{64}$/.test(csrf), 'same-origin bootstrap issues a session-bound CSRF token');
  r = await req('/api/session/clear', { method: 'POST', headers: { ...appWrite, Cookie: sid1 } });
  ok(r.status === 403, 'state-changing app APIs reject requests without a CSRF token');
  r = await req('/api/aksa/vpn/status', { headers: app });
  const aksaStatus = (() => { try { return JSON.parse(r.body); } catch { return {}; } })();
  ok(r.status === 200 && aksaStatus.enabled === false && aksaStatus.connected === false, 'Aksa reports disconnected until the local Wireproxy sidecar confirms a fresh tunnel heartbeat');
  r = await req('/api/aksa/vpn/toggle', { method: 'POST', headers: { ...appWrite, Cookie: sid1, 'X-Aegis-CSRF': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
  ok(r.status === 409, 'Aksa cannot be enabled without a configured local gateway');

  const before = seen.length;
  r = await req('/api/proxy', { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-csrf-token' } });
  ok(r.status === 204 && r.headers['access-control-allow-origin'] === '*', 'CORS preflight is answered by the proxy');
  ok(seen.length === before, 'the preflight was not forwarded upstream');

  r = await req('/api/health', { headers: app });
  ok(r.status === 200 && /frame-ancestors 'none'/.test(r.headers['content-security-policy'] || '') && r.headers['x-content-type-options'] === 'nosniff', 'same-origin app API responses carry CSP and security headers');

  await req('/api/session/clear', { method: 'POST', headers: { ...appWrite, Cookie: sid1, 'X-Aegis-CSRF': csrf } });
  r = await req(proxy(A + '/whoami', `t=${tokA}&`), { headers: page });
  ok(r.body === 'cookie=', 'session/clear empties every site partition');
} finally {
  server.kill('SIGKILL');
  upstream.close();
  setTimeout(() => process.exit(process.exitCode ?? 0), 200);
}
