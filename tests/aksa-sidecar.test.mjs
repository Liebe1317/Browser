import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
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
import { AksaSidecar } from '../electron/aksa-sidecar.cjs';
import { extractExecutableFromTarGz, safeTarName } from '../electron/aksa-installer.cjs';

const privateKey = Buffer.alloc(32, 1).toString('base64');
const publicKey = Buffer.alloc(32, 2).toString('base64');
const wgConfig = `[Interface]
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
assert.equal(getReleaseAsset('win32', 'arm64'), null, 'unsupported binary platforms fail explicitly');

assert.equal(
  getAegisUserDataPath('win32', { APPDATA: 'C:\\Users\\test\\AppData\\Roaming' }, 'C:\\Users\\test'),
  path.join('C:\\Users\\test\\AppData\\Roaming', 'AegisBrowser')
);
assert.equal(
  getAegisUserDataPath('linux', { XDG_CONFIG_HOME: '/tmp/aegis-test' }, '/home/test').replace(/\\\\/g, '/'),
  '/tmp/aegis-test/aegis-browser'
);

const parsed = parseSections(wgConfig);
assert.equal(parsed.filter((section) => section.name === 'peer').length, 1);
const generated = buildWireproxyConfig(wgConfig);
assert.match(generated, /CheckAlive = 1\.1\.1\.1, 9\.9\.9\.9/);
assert.match(generated, /CheckAliveInterval = 4/);
assert.match(generated, /\[http\]\nBindAddress = 127\.0\.0\.1:19090/);
assert.doesNotMatch(generated, /CheckAliveInterval = 99/);

assert.throws(() => buildWireproxyConfig(wgConfig.replace('AllowedIPs = 0.0.0.0/0, ::/0', 'AllowedIPs = 0.0.0.0/0')), /IPv4\/IPv6/);
assert.throws(() => buildWireproxyConfig(wgConfig.replace('198.51.100.2:51820', 'vpn.example:51820')), /IP:Port/);
assert.throws(() => buildWireproxyConfig(wgConfig.replace('DNS = 10.66.0.1, fd00::1', 'DNS = resolver.example')), /DNS/);
assert.throws(() => buildWireproxyConfig(wgConfig.replace('PrivateKey = ' + privateKey, 'PrivateKey = invalid')), /PrivateKey/);
assert.throws(() => buildWireproxyConfig(wgConfig.replace('[Peer]', '[PreUp]')), /قسماً غير مسموح/);
assert.throws(() => buildWireproxyConfig(wgConfig + '[Peer]\nPublicKey = ' + publicKey), /Endpoint/);

assert.equal(parseWireproxyReadyPayload({ '1.1.1.1': 996, '9.9.9.9': 999 }, 1000), true);
assert.equal(parseWireproxyReadyPayload({ '1.1.1.1': 980 }, 1000), false, 'stale tunnel heartbeats are rejected');
assert.equal(parseWireproxyReadyPayload({}, 1000), false, 'an empty ready response is not a connected tunnel');
assert.equal(parseWireproxyReadyPayload({ '1.1.1.1': 1005 }, 1000), false, 'future timestamps are rejected');
assert.equal(isConnectedHealthPayload({ status: 'ok', tunnel: 'connected' }), true);

assert.equal(safeTarName('wireproxy'), true);
assert.equal(safeTarName('bin/wireproxy'), true);
assert.equal(safeTarName('../wireproxy'), false);
assert.equal(safeTarName('/tmp/wireproxy'), false);
assert.equal(safeTarName('bin/../../wireproxy'), false);

// Construct a small valid ustar archive containing a single regular executable member.
function createTarGz(name, payload) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000700\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(payload.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  const paddedPayload = Buffer.alloc(Math.ceil(payload.length / 512) * 512);
  payload.copy(paddedPayload);
  return require('node:zlib').gzipSync(Buffer.concat([header, paddedPayload, Buffer.alloc(1024)]));
}
const executableBytes = Buffer.alloc(120 * 1024, 0x5a);
const archive = createTarGz('wireproxy', executableBytes);
assert.deepEqual(extractExecutableFromTarGz(archive, 'wireproxy'), executableBytes);
assert.throws(() => extractExecutableFromTarGz(archive, 'wireproxy.exe'), /not found/);

const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'aegis-aksa-test-'));
try {
  const source = path.join(tempRoot, 'provider.conf');
  writeFileSync(source, wgConfig, { mode: 0o600 });
  const paths = getAksaPaths(tempRoot, 'linux');
  mkdirSync(paths.binDir, { recursive: true });
  writeFileSync(paths.executable, 'mock-wireproxy');
  let spawnCalls = 0;
  let child;
  const sidecar = new AksaSidecar(tempRoot, {
    platform: 'linux',
    arch: 'x64',
    probe: async () => true,
    spawnProcess: () => {
      spawnCalls += 1;
      child = new EventEmitter();
      child.exitCode = null;
      child.killed = false;
      child.kill = () => {
        child.killed = true;
        child.exitCode = 0;
        child.emit('exit', 0, null);
        return true;
      };
      return child;
    },
  });
  assert.deepEqual(sidecar.configureProfile(source), { configured: true });
  const mode = statSync(paths.generatedConfig).mode & 0o777;
  if (process.platform !== 'win32') assert.equal(mode, 0o600, 'WireGuard keys are stored with owner-only permissions');
  const start = await sidecar.start();
  assert.equal(start.ok, true);
  assert.equal(spawnCalls, 1);
  assert.equal(sidecar.getStatus().profileConfigured, true);
  await sidecar.stop();
  assert.equal(sidecar.getStatus().running, false);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log('PASS - Aksa validates WireGuard profiles, verifies tunnel heartbeats and manages its local sidecar');
