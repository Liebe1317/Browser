import assert from "node:assert/strict";
import { AkramShields, hostMatchesDomain } from "../akram/core/shields.ts";

const rules = [
  { id: "test-ad-network", domain: "ads.example.test" },
  { id: "tracker", domain: "tracker.example.test" },
];
const shields = new AkramShields([
  ...rules,
  { id: 'youtube-ad-path', domains: ['youtube.com'], pathIncludes: ['/pagead/'], resourceTypes: ['script', 'xmlhttprequest'] },
  { id: 'youtube-ad-media', domains: ['googlevideo.com'], pathIncludes: ['/videoplayback'], queryKeysAny: ['oad', 'adformat'], resourceTypes: ['media'] },
]);

const request = (url) => ({
  url,
  method: "GET",
  resourceType: "script",
  isMainFrame: false,
});

assert.equal(shields.ruleCount, 4);
assert.equal(hostMatchesDomain("ads.example.test", "ads.example.test"), true);
assert.equal(hostMatchesDomain("cdn.ads.example.test", "ads.example.test"), true);
assert.equal(hostMatchesDomain("ads.example.test.attacker.test", "example.test"), false);
assert.equal(hostMatchesDomain("ADS.EXAMPLE.TEST.", "ads.example.test"), true);

assert.deepEqual(shields.evaluate(request("https://ads.example.test/banner.js")), {
  action: "block",
  reason: "ad-or-tracker",
  ruleId: "test-ad-network",
});
assert.deepEqual(shields.evaluate(request("https://cdn.tracker.example.test/pixel")), {
  action: "block",
  reason: "ad-or-tracker",
  ruleId: "tracker",
});
assert.deepEqual(shields.evaluate(request("https://content.example.test/video.mp4")), {
  action: "allow",
});
assert.deepEqual(shields.evaluate({ ...request("https://www.youtube.com/pagead/interaction/"), resourceType: "script" }), {
  action: "block", reason: "ad-or-tracker", ruleId: "youtube-ad-path",
});
assert.deepEqual(shields.evaluate({ ...request("https://rr.googlevideo.com/videoplayback?oad=123"), resourceType: "media" }), {
  action: "block", reason: "ad-or-tracker", ruleId: "youtube-ad-media",
});
assert.deepEqual(shields.evaluate({ ...request("https://rr.googlevideo.com/videoplayback?id=content"), resourceType: "media" }), {
  action: "allow",
});
assert.deepEqual(shields.evaluate({ ...request("https://rr.googlevideo.com/videoplayback?oad=123"), resourceType: "script" }), {
  action: "allow",
});
assert.deepEqual(shields.evaluate(request("https://example.test.attacker.test/script.js")), {
  action: "allow",
});
assert.deepEqual(shields.evaluate(request("file:///etc/passwd")), {
  action: "allow",
});
assert.deepEqual(shields.evaluate(request("not a url")), {
  action: "allow",
});

console.log("Lebe core contract and Shields tests passed");
