import { encodeShieldFlags, decodeShieldFlags, SHIELD_FLAG_KEYS, DEFAULT_SHIELD_FLAGS } from '../src/utils/shieldFlags.ts';
import { hostMatches, buildProxyCsp, AD_DOMAINS, TRACKER_DOMAINS } from '../server/shield.ts';

const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS' : 'FAIL') + ' - ' + m);
  if (!c) process.exitCode = 1;
};

const settings = { shieldsEnabled: true, blockAggressiveAds: false, blockTrackers: true, blockThirdPartyCookies: false, fingerprintProtection: true, upgradeHttps: true, preventWebRTCLeak: false, blockScripts: true, blockPopups: false } as any;
const enc = encodeShieldFlags(settings, true);
ok(enc.length === SHIELD_FLAG_KEYS.length && /^[01]+$/.test(enc), 'flags encode to one 0/1 per setting (%s)'.replace('%s', enc));
const dec = decodeShieldFlags(enc)!;
ok(dec.blockTrackers && !dec.blockAggressiveAds && dec.blockScripts && dec.doNotTrack && !dec.blockPopups && !dec.preventWebRTCLeak, 'flags decode back to the same values');
ok(decodeShieldFlags('12') === null && decodeShieldFlags('1'.repeat(SHIELD_FLAG_KEYS.length + 1)) === null && decodeShieldFlags(undefined) === null && decodeShieldFlags(['1']) === null, 'malformed flag strings are rejected');
ok(DEFAULT_SHIELD_FLAGS.shieldsEnabled && !DEFAULT_SHIELD_FLAGS.blockScripts, 'defaults match the UI defaults');

ok(hostMatches(AD_DOMAINS, 'ad.doubleclick.net') && hostMatches(AD_DOMAINS, 'doubleclick.net'), 'subdomains and the domain itself match');
ok(!hostMatches(AD_DOMAINS, 'notdoubleclick.net') && !hostMatches(AD_DOMAINS, 'doubleclick.net.evil.com'), 'look-alike hosts do not match');
ok(hostMatches(TRACKER_DOMAINS, 'stats.google-analytics.com.') , 'trailing dot is ignored');

const all = buildProxyCsp({ ...DEFAULT_SHIELD_FLAGS, blockScripts: false, blockPopups: false });
ok(/sandbox [^;]*allow-scripts/.test(all) && /allow-popups/.test(all), 'scripts and popups allowed when the user allows them');
ok(!/allow-same-origin/.test(all), 'the page is NEVER given allow-same-origin');
ok(/connect-src 'self'/.test(all) && /img-src 'self'/.test(all) && /form-action 'self'/.test(all), 'all network access is limited to the proxy origin');
const strict = buildProxyCsp({ ...DEFAULT_SHIELD_FLAGS, blockScripts: true, blockPopups: true });
ok(!/allow-scripts/.test(strict) && !/allow-popups/.test(strict), 'blocking scripts/popups is enforced by the browser sandbox');
