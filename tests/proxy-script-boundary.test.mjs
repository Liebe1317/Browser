import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(import.meta.dirname, '../server.ts'), 'utf8');
const start = source.indexOf('const aegisProtectionHead = `');
const end = source.indexOf('const storageShim', start);
assert.ok(start >= 0 && end > start, 'the proxy-injected protection script exists');
const injected = source.slice(start, end);

assert.match(source, /const jsTargetOrigin = jsStringLiteral\(parsedTarget\.origin\)/);
assert.match(source, /const jsTargetHostname = jsStringLiteral\(parsedTarget\.hostname\)/);
assert.doesNotMatch(injected, /['"]\$\{parsedTarget\.(?:origin|href|hostname)\}['"]/, 'raw URL values must never be interpolated into injected JavaScript');
assert.match(injected, /absoluteUrl = \$\{jsTargetOrigin\}/, 'fetch uses serialized origin');
assert.match(injected, /rawUrl = \$\{jsTargetOrigin\}/, 'XHR uses serialized origin');
assert.match(injected, /abs = \$\{jsTargetOrigin\}/, 'image repair uses serialized origin');

console.log('PASS - proxy page scripts never interpolate raw target URLs');
