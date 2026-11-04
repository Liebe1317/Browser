import { CookieJar } from '../server/cookieJar.ts';

const ok = (condition: boolean, message: string) => {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + message);
  if (!condition) process.exitCode = 1;
};
const url = (value: string) => new URL(value);

const jar = new CookieJar();
jar.setFromResponse(url('https://a.example.com/x/y'), [
  'sid=1; Path=/; HttpOnly; Secure; SameSite=Strict',
  'theme=dark; Domain=a.example.com; Path=/; Secure; SameSite=Lax',
  'cross=ok; Domain=a.example.com; Path=/; Secure; SameSite=None',
]);
ok(
  jar.headerFor(url('https://a.example.com/z')).includes('sid=1') &&
    jar.headerFor(url('https://a.example.com/z')).includes('theme=dark'),
  'multiple first-party cookies are stored and sent'
);
ok(
  !jar.headerFor(url('https://b.example.com/'), Date.now(), { topLevelHost: 'a.example.com' }).includes('sid='),
  'host-only cookies are not sent to sibling hosts'
);
ok(
  !jar.headerFor(url('https://b.example.com/'), Date.now(), { topLevelHost: 'a.example.com' }).includes('theme='),
  'SameSite=Lax cookies are not sent to sibling hosts through a different top-level host'
);
ok(
  !jar.headerFor(url('https://b.example.com/'), Date.now(), { topLevelHost: 'a.example.com' }).includes('cross='),
  'even SameSite=None cookies remain isolated from sibling hosts by Aegis exact-host partitions'
);
ok(
  !jar.headerFor(url('http://a.example.com/')).includes('sid=') &&
    !jar.headerFor(url('http://a.example.com/')).includes('cross='),
  'Secure cookies are never sent over HTTP'
);
ok(jar.headerFor(url('https://evil.com/')) === '', 'cookies are not sent to unrelated hosts');

jar.setFromResponse(url('https://a.example.com/'), ['sid=; Max-Age=0; Path=/; Secure']);
ok(!jar.headerFor(url('https://a.example.com/')).includes('sid='), 'Max-Age=0 deletes a cookie');
jar.setFromResponse(url('https://evil.com/'), ['x=1; Domain=example.com']);
ok(!jar.headerFor(url('https://a.example.com/')).includes('x=1'), 'a Domain attribute that does not cover the response host is rejected');
jar.setFromResponse(url('https://a.example.com/'), ['sibling=1; Domain=example.com; Secure; SameSite=None']);
ok(!jar.headerFor(url('https://a.example.com/')).includes('sibling=1'), 'parent Domain cookies cannot widen an exact-host cookie partition');
jar.setFromResponse(url('https://evil.co.uk/'), ['bad=1; Domain=co.uk']);
ok(!jar.headerFor(url('https://evil.co.uk/')).includes('bad=1'), 'public-suffix Domain attributes are rejected');
jar.setFromResponse(url('http://a.example.com/'), ['insecure=1; Secure']);
ok(!jar.headerFor(url('https://a.example.com/')).includes('insecure=1'), 'Secure cookies cannot be set over an insecure transport');
jar.setFromResponse(url('https://a.example.com/'), ['none=1; SameSite=None']);
ok(!jar.headerFor(url('https://a.example.com/')).includes('none=1'), 'SameSite=None without Secure is rejected');

jar.setFromResponse(url('https://a.example.com/'), ['__Host-bad=1; Secure; Domain=example.com; Path=/']);
ok(!jar.headerFor(url('https://a.example.com/')).includes('__Host-bad'), '__Host- cookies with Domain are rejected');
jar.setFromResponse(url('https://a.example.com/'), ['__Host-good=1; Secure; Path=/']);
ok(jar.headerFor(url('https://a.example.com/')).includes('__Host-good=1'), 'valid __Host- cookies are accepted');
jar.setFromResponse(url('https://a.example.com/'), ['__Secure-bad=1; Path=/']);
ok(!jar.headerFor(url('https://a.example.com/')).includes('__Secure-bad'), '__Secure- cookies without Secure are rejected');

jar.setFromResponse(url('https://a.example.com/'), ['p=1; Path=/admin']);
ok(
  !jar.headerFor(url('https://a.example.com/administrator')).includes('p=1') &&
    jar.headerFor(url('https://a.example.com/admin/x')).includes('p=1'),
  'path matching respects boundaries'
);

const now = Date.now();
jar.setFromResponse(url('https://a.example.com/'), ['e=1; Max-Age=10; Secure'], now);
ok(
  jar.headerFor(url('https://a.example.com/'), now + 5000).includes('e=1') &&
    !jar.headerFor(url('https://a.example.com/'), now + 20000).includes('e=1'),
  'expiry is honoured'
);

const bounded = new CookieJar();
for (let i = 0; i < 700; i++) bounded.setFromResponse(url('https://s.example/'), [`c${i}=1`]);
ok(bounded.size <= 500, 'jar size is capped');
