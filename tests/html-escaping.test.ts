import assert from 'node:assert/strict';
import { escapeHtml, renderSearchResultCard, safeHttpUrl } from '../server/html.ts';

assert.equal(escapeHtml('<script>alert("x")</script> & \'quoted\''), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;');
assert.equal(safeHttpUrl('javascript:alert(1)'), null);
assert.equal(safeHttpUrl('data:text/html,<script>alert(1)</script>'), null);
assert.equal(safeHttpUrl('file:///etc/passwd'), null);
assert.equal(safeHttpUrl('https://user:password@example.com/'), null);
assert.equal(safeHttpUrl('https://example.com/a'), 'https://example.com/a');

const payload = renderSearchResultCard({
  title: '\"><img src=x onerror=\"alert(1)\"><script>alert(2)</script>',
  url: 'javascript:alert(document.domain)',
  snippet: '</p><svg onload="alert(3)"></svg>',
}, 0, 'fallback');
assert.match(payload, /&lt;img/);
assert.match(payload, /&lt;script&gt;/);
assert.ok(payload.includes('&lt;/p&gt;&lt;svg'), 'closing tags and SVG markup are escaped');
assert.doesNotMatch(payload, /<img[^>]+onerror/i);
assert.doesNotMatch(payload, /<script/i);
assert.doesNotMatch(payload, /<svg[^>]+onload/i);
assert.doesNotMatch(payload, /href="javascript:/i);
assert.match(payload, /<span class="g-title-link">/);
assert.doesNotMatch(payload, /rel="noopener noreferrer"/);

const craftedUrl = renderSearchResultCard({
  title: 'Example',
  url: 'https://example.com/\"><img src=x onerror=alert(4)>',
  snippet: 'Plain text',
}, 1, 'fallback');
assert.doesNotMatch(craftedUrl, /href="[^"]*"\s+onmouseover/i);
assert.doesNotMatch(craftedUrl, /<img src=x onerror/i);

console.log('PASS - HTML escaping and safe search-result rendering');
