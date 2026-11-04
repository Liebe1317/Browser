import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const clientRoot = path.join(root, 'src');
const sourceFiles = [];

function walk(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name);
    if (item.isDirectory()) walk(full);
    else if (/\.(?:ts|tsx|js|jsx)$/.test(item.name)) sourceFiles.push(full);
  }
}

walk(clientRoot);
const violations = [];
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (/GEMINI_API_KEY|GoogleGenAI|@google\/genai/.test(text)) violations.push(path.relative(root, file));
}
assert.deepEqual(violations, [], 'AI provider SDK and server API key identifiers must never enter client source');
console.log('PASS - AI provider SDK/API key remain outside the React client source');
