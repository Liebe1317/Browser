import assert from 'node:assert/strict';
import path from 'node:path';
import {
  WIREPROXY_VERSION,
  HTTP_PROXY_ADDRESS,
  INFO_ADDRESS,
  getReleaseAsset,
  getAegisUserDataPath,
  getAksaPaths,
  parseSections,
  buildWireproxyConfig,
  parseWireproxyReadyPayload,
  isConnectedHealthPayload,
} from '../electron/aksa-config.cjs';

const privateKey = Buffer.alloc(32, 1).toString('base64');
const publicKey = Buffer.alloc(32, 2).toString('base64');
const config = `[Interface]
PrivateKey = ${privateKey}
Address = 10.66.0.2/32, fd00::2/128
DNS = 10.66.0.1, fd00::1

[Peer]
PublicKey = ${publicKey}
Endpoint = 198.51.100.2:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
`;

assert.equal(WIREPROXY_VERSION, 'v1.1.3');
assert.equal(HTTP_PROXY_ADDRESS, '127.0.0.1:19090');
assert.equal(INFO_ADDRESS, '127.0.0.1:19091');
assert.equal(getReleaseAsset('win32', 'x64').file, 'wireproxy_windows_amd64.tar.gz');
assert.equal(getReleaseAsset('linux', 'x64').sha256.length, 64);
assert.equal(getReleaseAsset('darwin', 'arm64').executable, 'wireproxy');
assert.equal(getReleaseAsset('win32', 'arm64'), null);
assert.equal(
  path.win32.normalize(getAegisUserDataPath('win32', { APPDATA: 'C:\\Users\\test\\AppData\\Roaming' }, 'C:\\Users\\test')),
  path.win32.join('C:\\Users\\test\\AppData\\Roaming', 'AegisBrowser')
);
const paths = getAksaPaths('/tmp/aegis-test', 'linux');
assert.ok(paths.executable.endsWith('/aksa/bin/wireproxy'));
assert.ok(paths.generatedConfig.endsWith('/aksa/wireproxy.conf'));

const parsed = parseSections(config);
assert.equal(parsed.filter((section) => section.name === 'peer').length, 1);
const generated = buildWireproxyConfig(config);
assert.match(generated, /CheckAlive = 1\.1\.1\.1, 9\.9\.9\.9/);
assert.match(generated, /CheckAliveInterval = 4/);
assert.match(generated, /\[http\]\nBindAddress = 127\.0\.0\.1:19090/);

assert.throws(() => buildWireproxyConfig(config.replace('AllowedIPs = 0.0.0.0/0, ::/0', 'AllowedIPs = 0.0.0.0/0')), /IPv4\/IPv6/);
assert.throws(() => buildWireproxyConfig(config.replace('198.51.100.2:51820', 'vpn.example:51820')), /IP:Port/);
assert.throws(() => buildWireproxyConfig(config.replace('DNS = 10.66.0.1, fd00::1', 'DNS = resolver.example')), /DNS/);
assert.throws(() => buildWireproxyConfig(config.replace('PrivateKey = ' + privateKey, 'PrivateKey = invalid')), /PrivateKey/);
assert.throws(() => buildWireproxyConfig(config.replace('[Peer]', '[PreUp]')), /قسماً غير مسموح/);
assert.throws(() => buildWireproxyConfig(config + '[Peer]\nPublicKey = ' + publicKey), /Endpoint/);
assert.throws(() => buildWireproxyConfig(config.replace('AllowedIPs = 0.0.0.0/0, ::/0', 'AllowedIPs = 10.0.0.0/8')), /IPv4\/IPv6/);

assert.equal(parseWireproxyReadyPayload({ '1.1.1.1': 996, '9.9.9.9': 999 }, 1000), true);
assert.equal(parseWireproxyReadyPayload({ '1.1.1.1': 980 }, 1000), false);
assert.equal(parseWireproxyReadyPayload({}, 1000), false);
assert.equal(parseWireproxyReadyPayload({ '1.1.1.1': 1005 }, 1000), false);
assert.equal(isConnectedHealthPayload({ status: 'ok', tunnel: 'connected' }), true);
assert.equal(isConnectedHealthPayload({ status: 'ok', tunnel: 'disconnected' }), false);
assert.equal(isConnectedHealthPayload({ '1.1.1.1': 996, '9.9.9.9': 999 }), true);

console.log('PASS - Wireproxy config validation and fresh tunnel health parsing');
