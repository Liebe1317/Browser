import assert from 'node:assert/strict';
import { detectAkramAIAction, describeAkramAIAction, parseAkramAISearchQuery } from '../server/akram-ai.ts';
import { parseLibiSearchResults } from '../src/types/libi.ts';

assert.deepEqual(detectAkramAIAction('ليبي، افتح الإعدادات'), { type: 'open_settings' }, 'legacy assistant invocation remains supported');
assert.deepEqual(detectAkramAIAction('أكرم، افتح الإعدادات'), { type: 'open_settings' }, 'Akram is the current assistant invocation');
assert.deepEqual(detectAkramAIAction('افتح الإعدادات'), { type: 'open_settings' }, 'hamza variants in Arabic commands are normalized');
assert.deepEqual(detectAkramAIAction('افتح تبويب جديد'), { type: 'new_tab' });
assert.deepEqual(detectAkramAIAction('ارجع'), { type: 'back' });
assert.deepEqual(detectAkramAIAction('أعد تحميل الصفحة'), { type: 'reload' });
assert.deepEqual(detectAkramAIAction('احفظ الصفحة'), { type: 'bookmark_page' });
assert.deepEqual(detectAkramAIAction('افتح وضع القراءة'), { type: 'toggle_reader' });
assert.deepEqual(detectAkramAIAction('كبر الصفحة'), { type: 'zoom_in' });
assert.deepEqual(detectAkramAIAction('اذهب لنهاية الصفحة'), { type: 'scroll_bottom' });
assert.deepEqual(detectAkramAIAction('افتح example.com'), { type: 'navigate', url: 'https://example.com/' });
assert.deepEqual(detectAkramAIAction('افتح https://example.com/path'), { type: 'navigate', url: 'https://example.com/path' });

assert.equal(detectAkramAIAction('افتح javascript:alert(1)'), null, 'script URLs are never navigation actions');
assert.equal(detectAkramAIAction('افتح data:text/html,hello'), null, 'data URLs are never navigation actions');
assert.equal(detectAkramAIAction('افتح http://127.0.0.1/'), null, 'loopback navigation is denied');
assert.equal(detectAkramAIAction('افتح http://192.168.1.1/'), null, 'private LAN navigation is denied');
assert.equal(detectAkramAIAction('افتح https://user:pass@example.com/'), null, 'credential-bearing URLs are denied');
assert.equal(detectAkramAIAction('احذف كل ملفات الجهاز'), null, 'unknown/high-impact actions are not in the allowlist');
assert.match(describeAkramAIAction({ type: 'open_settings' }), /إعدادات/);
assert.equal(parseAkramAISearchQuery('ابحث عن Hunter x Hunter'), 'hunter x hunter', 'search commands are normalized to lowercase');
assert.equal(parseAkramAISearchQuery('أكرم، ابحث لي عن أفضل متصفح'), 'افضل متصفح', 'Arabic hamza variants are normalized in the query');
assert.equal(parseAkramAISearchQuery('search for Electron 45'), 'electron 45', 'English search queries are normalized to lowercase');
assert.equal(parseAkramAISearchQuery('مرحبا يا ليبي'), null);
assert.equal(parseAkramAISearchQuery('ابحث عن'), null);

const results = parseLibiSearchResults([
  { title: 'Safe result', url: 'https://example.com/article', snippet: 'A useful snippet' },
  { title: 'Script link', url: 'javascript:alert(1)', snippet: 'bad' },
  { title: 'Credential link', url: 'https://user:pass@example.com/', snippet: 'bad' },
  { title: '<img onerror=alert(1)>', url: 'https://example.org/', snippet: '<script>bad</script>' },
  { title: 'Invalid', url: 'not a url', snippet: 'bad' },
]);
assert.equal(results.length, 2, 'only ordinary HTTP(S) links survive validation');
assert.equal(results[0].url, 'https://example.com/article');
assert.equal(results[1].title.length > 0, true, 'untrusted result labels remain text data');

console.log('PASS - Libi action allowlist, navigation safety, and search-result validation');
