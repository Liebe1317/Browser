import assert from 'node:assert/strict';
import { jsStringLiteral } from '../server/html.ts';

const payloads = [
  "'; window.__aegisPwned = true; //",
  "</script><script>window.__aegisPwned = true</script>",
  "<img src=x onerror=alert(1)>",
  String.fromCharCode(0x2028, 0x2029),
  "normal https://example.com/path?q=hello",
];

for (const value of payloads) {
  const literal = jsStringLiteral(value);
  assert.ok(literal.startsWith('"') && literal.endsWith('"'), 'a JSON string literal is emitted');
  assert.ok(!literal.includes('<'), 'script-breaking less-than characters are encoded');
  assert.ok(!literal.includes('>'), 'script-breaking greater-than characters are encoded');
  assert.ok(!literal.includes(String.fromCharCode(0x2028)) && !literal.includes(String.fromCharCode(0x2029)), 'JavaScript line separator characters are escaped');
  assert.equal(JSON.parse(literal), value, 'the literal round-trips to the original content');
}

console.log('PASS - URL and page-derived JavaScript values are safely serialized');
