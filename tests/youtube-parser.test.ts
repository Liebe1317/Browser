import assert from 'node:assert/strict';
import { extractYouTubeVideos, parseYouTubeInitialData } from '../server/youtube.ts';

const video = {
  videoRenderer: {
    videoId: 'abcdefghijk',
    title: { runs: [{ text: 'A title with } braces and "quotes"' }] },
    ownerText: { runs: [{ text: 'Example channel' }] },
    shortViewCountText: { simpleText: '12K views' },
    publishedTimeText: { simpleText: '2 days ago' },
    lengthText: { simpleText: '08:14' },
    thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg' }] },
    ownerBadges: [{}],
  },
};
const html = '<html><script>var ytInitialData = {\n' +
  '"contents":{"twoColumnSearchResultsRenderer":{"primaryContents":{"sectionListRenderer":{' +
  '"contents":[{"itemSectionRenderer":{"contents":[' + JSON.stringify(video) + ']}}]}}}}\n' +
  '};</script></html>';

const parsed = parseYouTubeInitialData(html);
assert.ok(parsed && typeof parsed === 'object', 'multiline ytInitialData JSON is parsed');
const results = extractYouTubeVideos(html);
assert.equal(results.length, 1);
assert.equal(results[0].id, 'abcdefghijk');
assert.equal(results[0].title, 'A title with } braces and "quotes"');
assert.equal(results[0].channel, 'Example channel');
assert.equal(results[0].duration, '08:14');
assert.equal(results[0].verified, true);
assert.equal(results[0].thumbnail, 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');

const feedHtml = '<script>ytInitialData = ' + JSON.stringify({
  contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { content: {
    richGridRenderer: { contents: [video, video] },
  } } }] } },
}) + ';</script>';
const feed = extractYouTubeVideos(feedHtml, 'anime');
assert.equal(feed.length, 1, 'alternate feed layouts are traversed and duplicate IDs are removed');
assert.equal(feed[0].category, 'anime');

assert.deepEqual(extractYouTubeVideos('<script>ytInitialData = { broken </script>'), []);
assert.deepEqual(extractYouTubeVideos('<script>ytInitialData = {"x":1};</script>'), []);
assert.deepEqual(extractYouTubeVideos('<script>window.ytInitialData = null;</script>'), []);
assert.equal(parseYouTubeInitialData('<script>window.ytInitialData = {"ok":true};</script>') && true, true);

console.log('PASS - YouTube initial data parser handles multiline JSON, nested feed layouts, and malformed input');
