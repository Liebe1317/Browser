import assert from 'node:assert/strict';
import { detectLibiAction, describeLibiAction } from '../server/libi.ts';
import { parseLibiSearchResults } from '../src/types/libi.ts';

assert.deepEqual(detectLibiAction('ليبي، افتح الإعدادات'), { type: 'open_settings' });
assert.deepEqual(detectLibiAction('افتح الإعدادات'), { type: 'open_settings' }, 'hamza variants in Arabic commands are normalized');
assert.deepEqual(detectLibiAction('افتح تبويب جديد'), { type: 'new_tab' });
assert.deepEqual(detectLibiAction('ارجع'), { type: 'back' });
assert.deepEqual(detectLibiAction('أعد تحميل الصفحة'), { type: 'reload' });
assert.deepEqual(detectLibiAction('احفظ الصفحة'), { type: 'bookmark_page' });
assert.deepEqual(detectLibiAction('افتح وضع القراءة'), { type: 'toggle_reader' });
assert.deepEqual(detectLibiAction('كبر الصفحة'), { type: 'zoom_in' });
assert.deepEqual(detectLibiAction('اذهب لنهاية الصفحة'), { type: 'scroll_bottom' });
assert.deepEqual(detectLibiAction('افتح example.com'), { type: 'navigate', url: 'https://example.com/' });
assert.deepEqual(detectLibiAction('افتح https://example.com/path'), { type: 'navigate', url: 'https://example.com/path' });

assert.equal(detectLibiAction('افتح javascript:alert(1)'), null, 'script URLs are never navigation actions');
assert.equal(detectLibiAction('افتح data:text/html,hello'), null, 'data URLs are never navigation actions');
assert.equal(detectLibiAction('افتح http://127.0.0.1/'), null, 'loopback navigation is denied');
assert.equal(detectLibiAction('افتح http://192.168.1.1/'), null, 'private LAN navigation is denied');
assert.equal(detectLibiAction('افتح https://user:pass@example.com/'), null, 'credential-bearing URLs are denied');
assert.equal(detectLibiAction('احذف كل ملفات الجهاز'), null, 'unknown/high-impact actions are not in the allowlist');
assert.match(describeLibiAction({ type: 'open_settings' }), /إعدادات/);

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
