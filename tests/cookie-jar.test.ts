import { CookieJar } from '../server/cookieJar.ts';

const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS' : 'FAIL') + ' - ' + m);
  if (!c) process.exitCode = 1;
};
const u = (s: string) => new URL(s);

const j = new CookieJar();
j.setFromResponse(u('https://a.example.com/x/y'), ['sid=1; Path=/; HttpOnly', 'theme=dark; Domain=example.com; Path=/']);
ok(j.headerFor(u('https://a.example.com/z')).includes('sid=1') && j.headerFor(u('https://a.example.com/z')).includes('theme=dark'), 'several Set-Cookie headers are all stored');
ok(!j.headerFor(u('https://b.example.com/')).includes('sid='), 'host-only cookie is not sent to a sibling host');
ok(j.headerFor(u('https://b.example.com/')).includes('theme=dark'), 'Domain cookie is sent to a sibling host');
ok(j.headerFor(u('https://evil.com/')) === '', 'nothing is sent to other sites');
j.setFromResponse(u('https://a.example.com/'), ['sid=; Max-Age=0; Path=/']);
ok(!j.headerFor(u('https://a.example.com/')).includes('sid='), 'Max-Age=0 deletes the cookie (logout works)');
j.setFromResponse(u('https://evil.com/'), ['x=1; Domain=example.com']);
ok(!j.headerFor(u('https://a.example.com/')).includes('x=1'), 'a Domain that does not cover the host is rejected');
j.setFromResponse(u('https://evil.com/'), ['y=1; Domain=com']);
ok(j.headerFor(u('https://evil.com/')) === '', 'a bare TLD Domain is rejected');
j.setFromResponse(u('https://a.example.com/'), ['p=1; Path=/admin']);
ok(!j.headerFor(u('https://a.example.com/administrator')).includes('p=1') && j.headerFor(u('https://a.example.com/admin/x')).includes('p=1'), 'path matching respects boundaries');
j.setFromResponse(u('https://a.example.com/'), ['__Host-t=1; Domain=example.com; Path=/']);
ok(!j.headerFor(u('https://a.example.com/')).includes('__Host-t'), '__Host- cookie with Domain is rejected');
const now = Date.now();
j.setFromResponse(u('https://a.example.com/'), ['e=1; Max-Age=10'], now);
ok(j.headerFor(u('https://a.example.com/'), now + 5000).includes('e=1') && !j.headerFor(u('https://a.example.com/'), now + 20000).includes('e=1'), 'expiry is honoured');
const big = new CookieJar();
for (let i = 0; i < 700; i++) big.setFromResponse(u('https://s.com/'), [`c${i}=1`]);
ok(big.size <= 500, 'jar size is capped');
