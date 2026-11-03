import http from 'node:http';
import { isBlockedUrl, isBlockedIp, guardedLookup, createSafeFetcher, readBodyCapped, SsrfBlockedError, BodyTooLargeError } from '../server/ssrf.ts';

const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS' : 'FAIL') + ' - ' + m);
  if (!c) process.exitCode = 1;
};

// 1. Every known way to point the proxy at an internal address
const mustBlock = ['http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.1/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:7f00:1]/', 'http://[fd00::1]/', 'http://[fe80::1]/', 'http://169.254.169.254/', 'http://0/', 'http://192.0.0.1/', 'http://198.18.0.1/', 'http://[64:ff9b::7f00:1]/', 'http://[2002:7f00:1::]/', 'http://[::127.0.0.1]/', 'http://localhost./', 'http://foo.localhost/', 'http://router/', 'http://printer.local/', 'http://x.internal/', 'http://metadata.google.internal/', 'http://user:pw@example.com/', 'http://example.com:22/', 'http://example.com:6379/', 'ftp://example.com/', 'file:///etc/passwd', 'http://[::]/', 'http://224.0.0.1/', 'http://255.255.255.255/', 'http://100.64.0.1/', 'http://172.31.255.255/', 'http://[::ffff:10.0.0.1]/', 'http://[::ffff:169.254.169.254]/'];
for (const u of mustBlock) ok(isBlockedUrl(u), 'blocks ' + u);
const mustAllow = ['https://example.com/', 'https://sub.example.co.uk:8443/x', 'http://8.8.8.8/', 'http://[2606:4700:4700::1111]/', 'https://172.32.0.1/', 'https://100.128.0.1/', 'http://[::ffff:8.8.8.8]/', 'https://example.com:443/'];
for (const u of mustAllow) ok(!isBlockedUrl(u), 'allows ' + u);
ok(!isBlockedIp('1.1.1.1') && isBlockedIp('not-an-ip'), 'isBlockedIp basics');

// 2. A name that resolves to a private address is refused at connect time
await new Promise<void>((resolve) =>
  guardedLookup('localhost', { all: true }, (err) => {
    ok(err instanceof SsrfBlockedError, 'a hostname resolving to loopback is refused (DNS-level guard)');
    resolve();
  })
);

// 3. Redirect handling, using local servers (only 10.x counts as "private" in this test fetcher)
const hits: string[] = [];
const srv = http.createServer((req, res) => {
  hits.push(req.method + ' ' + req.url);
  if (req.url === '/r1') { res.statusCode = 302; res.setHeader('Location', '/final'); res.setHeader('Set-Cookie', 'hop=1'); return res.end(); }
  if (req.url === '/to-private') { res.statusCode = 302; res.setHeader('Location', 'http://10.0.0.5/secret'); return res.end(); }
  if (req.url === '/post303') { res.statusCode = 303; res.setHeader('Location', '/final'); return res.end(); }
  if (req.url === '/post307') { res.statusCode = 307; res.setHeader('Location', '/final'); return res.end(); }
  if (req.url === '/loop') { res.statusCode = 302; res.setHeader('Location', '/loop'); return res.end(); }
  if (req.url === '/big') return res.end('x'.repeat(5000));
  if (req.url === '/chunked-big') { res.write('y'.repeat(3000)); setTimeout(() => res.end('y'.repeat(3000)), 20); return; }
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => res.end('final method=' + req.method + ' body=' + body));
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(srv.address() as any).port}`;
const f = createSafeFetcher({
  lookup: ((_h: string, o: any, cb: any) => cb(null, o.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1', 4)) as any,
  isBlockedUrl: (u) => u.hostname.startsWith('10.') || (u.protocol !== 'http:' && u.protocol !== 'https:'),
});

const seen: string[] = [];
let r = await f(base + '/r1', {}, { onResponse: (u, res) => void seen.push(u.pathname + ':' + res.status + ':' + res.headers.getSetCookie().join(',')) });
ok((await r.response.text()).startsWith('final method=GET') && r.finalUrl.pathname === '/final', 'follows a redirect and reports the final URL');
ok(seen.join('|') === '/r1:302:hop=1|/final:200:', 'onResponse sees every hop (cookies from intermediate hops)');
let blocked = false;
try { await f(base + '/to-private'); } catch (e) { blocked = e instanceof SsrfBlockedError; }
ok(blocked, 'a redirect to a private address is blocked');
ok(!hits.some((h) => h.includes('/secret')), 'the private target was never contacted');
let loop = '';
try { await f(base + '/loop', {}, { maxRedirects: 3 }); } catch (e: any) { loop = e.message; }
ok(/Too many redirects/.test(loop), 'redirect loops are cut off');
r = await f(base + '/post303', { method: 'POST', body: 'a=1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
ok((await r.response.text()) === 'final method=GET body=', '303 after POST becomes GET without a body');
r = await f(base + '/post307', { method: 'POST', body: 'a=1' });
ok((await r.response.text()) === 'final method=POST body=a=1', '307 keeps method and body');
r = await f(base + '/big');
let tooBig = false;
try { await readBodyCapped(r.response, 1000); } catch (e) { tooBig = e instanceof BodyTooLargeError; }
ok(tooBig, 'an oversized body is rejected');
r = await f(base + '/chunked-big');
tooBig = false;
try { await readBodyCapped(r.response, 4000); } catch (e) { tooBig = e instanceof BodyTooLargeError; }
ok(tooBig, 'an oversized streamed body is aborted mid-download');
r = await f(base + '/big');
ok((await readBodyCapped(r.response, 10000)).length === 5000, 'a body under the cap is read completely');

// 4. The default fetcher refuses the loopback server outright
let strictBlocked = false;
try { await createSafeFetcher()(base + '/r1'); } catch (e) { strictBlocked = e instanceof SsrfBlockedError; }
ok(strictBlocked, 'the default fetcher refuses http://127.0.0.1');
srv.close();
process.exit(process.exitCode ?? 0);
