// Regression: page capabilities slide while the page is active, but never outlive the absolute cap,
// and an idle capability still expires after its normal TTL.
import type { Request, Response } from 'express';
import { authorizeProxyRequest, type ProxyAuth, type ProxyAuthError } from '../server/sessions.ts';

const ok = (condition: boolean, message: string) => {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + message);
  if (!condition) process.exitCode = 1;
};

const HOUR = 60 * 60 * 1000;
const realNow = Date.now;
let clock = realNow.call(Date);
Date.now = () => clock;

const res = { append: () => res, setHeader: () => res } as unknown as Response;
const navReq = (cookie = ''): Request => ({
  headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe', cookie },
  query: { ctx: 'regular' },
  secure: false,
}) as unknown as Request;
const tokenReq = (t: string): Request => ({ headers: {}, query: { t }, secure: false }) as unknown as Request;
const target = new URL('https://site.example/page');

try {
  const first = authorizeProxyRequest(navReq(), res, target);
  const page = first as ProxyAuth;
  ok(!('error' in first) && /^[a-f0-9]{48}$/.test(page.token), 'the app navigation mints a page capability');
  const token = page.token;

  // Active page: every request inside the TTL keeps the capability alive.
  for (let i = 0; i < 6; i++) {
    clock += 50 * 60 * 1000;
    const r = authorizeProxyRequest(tokenReq(token), res, target);
    if ('error' in r) { ok(false, `active page keeps its capability (step ${i + 1})`); break; }
    if (i === 5) ok(true, 'activity slides the expiry (valid after 5 hours of use)');
  }

  // Keep using it up to the absolute cap: it must be refused once 8 hours have passed since issue.
  let refused: ProxyAuth | ProxyAuthError | null = null;
  for (let i = 0; i < 6 && !refused; i++) {
    clock += 50 * 60 * 1000;
    const r = authorizeProxyRequest(tokenReq(token), res, target);
    if ('error' in r) refused = r;
  }
  ok(refused !== null && 'error' in refused && refused.status === 403 && refused.code === 'capability-expired', 'an always-active capability is still refused after the 8 hour absolute cap');

  // Idle capability: a fresh token that is not used expires after the normal TTL.
  const fresh = authorizeProxyRequest(navReq(), res, target) as ProxyAuth;
  clock += HOUR + 1000;
  const idle = authorizeProxyRequest(tokenReq(fresh.token), res, target);
  ok('error' in idle && idle.code === 'capability-expired', 'an idle capability expires after one hour');
} finally {
  Date.now = realNow;
}
