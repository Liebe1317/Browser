import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(import.meta.dirname, '../dist');
const assets = path.join(dist, 'assets');
assert.ok(fs.existsSync(assets), 'production assets must exist before the client secret scan');

const jsFiles = fs.readdirSync(assets).filter((name) => name.endsWith('.js'));
assert.ok(jsFiles.length > 0, 'the production build must contain JavaScript assets');

const forbidden = [
  /GEMINI_API_KEY/,
  /GoogleGenAI/,
  /@google\/genai/,
  /AIza[0-9A-Za-z_-]{30,}/,
];

const violations = [];
for (const name of jsFiles) {
  const file = path.join(assets, name);
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(content)) violations.push(`${name}: ${pattern}`);
  }
}

assert.deepEqual(violations, [], 'the built browser bundle must not contain AI provider SDKs or server credentials');
console.log('PASS - production bundle contains no Gemini SDK or API key identifiers');
