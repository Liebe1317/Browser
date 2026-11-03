// End-to-end: the REAL server.ts against fake HTTPS upstream sites.
// Needs the openssl CLI (for a throw-away certificate). Skipped when it is missing.
import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
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
  seen.push({ host, url: req.url, cookie: req.headers.cookie || '' });
  if (host === 'site-a.test' && req.url === '/') {
    res.setHeader('Set-Cookie', ['login=A; Path=/; HttpOnly', 'pref=dark; Path=/']);
    res.setHeader('Content-Type', 'text/html');
    return res.end(`<html><head><title>A</title><link rel="stylesheet" href="/style.css"><link rel="preconnect" href="https://direct.test"></head><body><img src="https://site-b.test:${UP}/pixel.png"><script src="https://site-b.test:${UP}/lib.js"></script></body></html>`);
  }
  if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end('body{background:url(/bg.png)}'); }
  if (req.url === '/pixel.png') { res.setHeader('Set-Cookie', 'track=B; Path=/'); res.setHeader('Content-Type', 'image/png'); return res.end('PNG'); }
  if (req.url === '/lib.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end('window.lib=1'); }
  if (host === 'site-b.test' && req.url === '/') { res.setHeader('Set-Cookie', 'loginB=1; Path=/'); res.setHeader('Content-Type', 'text/html'); return res.end('<html><head></head><body>B home</body></html>'); }
  if (req.url === '/whoami') { res.setHeader('Content-Type', 'text/plain'); return res.end('cookie=' + (req.headers.cookie || '')); }
  res.statusCode = 404;
  res.end('nf');
});
await new Promise((r) => upstream.listen(UP, '127.0.0.1', r));

const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
  cwd: root,
  stdio: 'ignore',
  env: { ...process.env, NODE_ENV: 'production', PORT: String(APP), NODE_OPTIONS: `--import ${path.join(root, 'tests/helpers/preload.mjs')}`, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
});

const req = (p, { method = 'GET', headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: APP, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    r.on('error', reject);
    r.end();
  });
for (let i = 0; i < 60; i++) {
  try { await req('/api/health'); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
}

const proxy = (url, q = '') => `/api/proxy?${q}url=${encodeURIComponent(url)}`;
const A = `https://site-a.test:${UP}`;
const B = `https://site-b.test:${UP}`;
const sidOf = (r) => (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('aegis_sid='));
const app = { 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'iframe' };
const page = { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'no-cors' }; // what an opaque-origin page sends

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
  ok(!r.body.includes('loginB=1'), "a page with A's token CANNOT use the user's login on site B");

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

  r = await req(proxy(A + '/whoami'), { headers: page }); ok(r.status === 403, 'cross-site request without a token -> 403 (not an open proxy)');
  r = await req(proxy(A + '/whoami'), { headers: { ...app, 'Sec-Fetch-Site': 'same-site' } }); ok(r.status === 403, 'same-site request without a token -> 403');
  r = await req(proxy(A + '/whoami', 't=' + 'f'.repeat(48) + '&'), { headers: page }); ok(r.status === 403, 'forged token -> 403');
  r = await req(proxy('http://127.0.0.1:1/', `t=${tokA}&`), { headers: page }); ok(r.status === 403, 'a valid token does not bypass the SSRF check');

  r = await req('/api/health', { headers: page }); ok(r.status === 403, 'other /api routes refuse cross-site callers');
  r = await req('/api/session/clear', { method: 'POST', headers: page }); ok(r.status === 403, 'session/clear refuses cross-site callers');
  r = await req('/api/health', { headers: app }); ok(r.status === 200, 'the app UI itself can use /api');
  const before = seen.length;
  r = await req('/api/proxy', { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-csrf-token' } });
  ok(r.status === 204 && r.headers['access-control-allow-origin'] === '*', 'CORS preflight is answered by the proxy');
  ok(seen.length === before, 'the preflight was not forwarded upstream');

  r = await req('/', { headers: app });
  ok(/frame-ancestors 'none'/.test(r.headers['content-security-policy'] || '') && r.headers['x-content-type-options'] === 'nosniff', 'the app itself has a CSP and security headers');

  await req('/api/session/clear', { method: 'POST', headers: { ...app, Cookie: sid1 } });
  r = await req(proxy(A + '/whoami', `t=${tokA}&`), { headers: page });
  ok(r.body === 'cookie=', 'session/clear empties every site partition');
} finally {
  server.kill('SIGKILL');
  upstream.close();
  setTimeout(() => process.exit(process.exitCode ?? 0), 200);
}
