import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(import.meta.dirname, '../server.ts'), 'utf8');
const start = source.indexOf('const aegisProtectionHead = `');
const end = source.indexOf('const storageShim', start);
assert.ok(start >= 0 && end > start, 'the proxy-injected protection script exists');
const injected = source.slice(start, end);

assert.ok(source.includes('const jsTargetHref = jsStringLiteral(parsedTarget.href);'));
assert.ok(source.includes('const jsProxyToken = jsStringLiteral(auth.token);'));
assert.ok(!injected.includes('${parsedTarget.origin}') && !injected.includes('${parsedTarget.href}') && !injected.includes('${parsedTarget.hostname}'), 'raw URL values must never be interpolated into injected JavaScript');
assert.ok(injected.includes("new URL(String(raw || ''), AEGIS_BASE_URL)"), 'relative page requests resolve against the real upstream page URL');
assert.ok(injected.includes('aegisProxyUrl(absoluteUrl)'), 'fetch requests receive the page-scoped proxy capability');
assert.ok(injected.includes('aegisProxyUrl(resolved)'), 'XHR and dynamically created frames use the page-scoped proxy capability');
assert.ok(injected.includes('patchSrcProperty(HTMLMediaElement.prototype)'), 'dynamically assigned video and audio sources use the scoped proxy');
assert.ok(injected.includes('patchSrcProperty(HTMLSourceElement.prototype)'), 'dynamically assigned source elements use the scoped proxy');
assert.ok(injected.includes('patchSrcProperty(HTMLImageElement.prototype)'), 'dynamically assigned image sources use the scoped proxy');
assert.ok(injected.includes('patchSrcProperty(HTMLScriptElement.prototype)'), 'dynamically assigned scripts use the scoped proxy');
assert.ok(injected.includes("response.headers.get('X-Aegis-Proxy-Error') === 'capability-expired'"), 'fetch exposes only a bounded capability-expiry signal');
assert.ok(injected.includes("xhr.getResponseHeader('X-Aegis-Proxy-Error') === 'capability-expired'"), 'XHR exposes the same bounded capability-expiry signal');
assert.ok(injected.includes("withCredentialsDescriptor.set.call(this, false)"), 'browser credentials stay out of proxy requests while upstream cookies remain server-managed');
assert.ok(injected.includes("window.parent.postMessage({ type: 'AEGIS_PROXY_ERROR', code: 'capability-expired' }, '*')"), 'nested frames can relay the bounded expiry signal');
const relativeApiUrl = new URL('sources', 'https://witanime.site/watch/black-clover-2nd-season/5/').href;
assert.equal(relativeApiUrl, 'https://witanime.site/watch/black-clover-2nd-season/5/sources', 'relative player API endpoints resolve against the upstream page URL');
assert.doesNotMatch(injected, /healVideoServers|aegis-srv-btn|dQw4w9WgXcQ/, 'the proxy must not fabricate player servers or replace site players');

console.log('PASS - proxy page scripts preserve relative URLs, scoped capabilities, and real player markup');
