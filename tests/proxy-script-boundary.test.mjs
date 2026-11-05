import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(import.meta.dirname, '../server.ts'), 'utf8');
const start = source.indexOf('const aegisProtectionHead = `');
const end = source.indexOf('const storageShim', start);
assert.ok(start >= 0 && end > start, 'the proxy-injected protection script exists');
const injected = source.slice(start, end);

assert.match(source, /const jsTargetHref = jsStringLiteral\\(parsedTarget\\.href\\)/);
assert.match(source, /const jsProxyToken = jsStringLiteral\\(auth\\.token\\)/);
assert.doesNotMatch(injected, /['"]\\$\\{parsedTarget\\.(?:origin|href|hostname)\\}['"]/, 'raw URL values must never be interpolated into injected JavaScript');
assert.match(injected, /new URL\\(String\\(raw \\|\\| ''\\), AEGIS_BASE_URL\\)/, 'relative page requests resolve against the real upstream page URL');
assert.match(injected, /aegisProxyUrl\\(absoluteUrl\\)/, 'fetch requests receive the page-scoped proxy capability');
assert.match(injected, /aegisProxyUrl\\(resolved\\)/, 'XHR and dynamically created frames use the page-scoped proxy capability');
assert.doesNotMatch(injected, /healVideoServers|aegis-srv-btn|dQw4w9WgXcQ/, 'the proxy must not fabricate player servers or replace site players');

console.log('PASS - proxy page scripts never interpolate raw target URLs');
