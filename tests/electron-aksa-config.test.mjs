import assert from 'node:assert/strict';
import electronAksa from '../electron/aksa-config.cjs';

const { parseAksaLocalProxy, isConnectedHealthPayload } = electronAksa;

assert.equal(parseAksaLocalProxy(undefined), null);
assert.equal(parseAksaLocalProxy('https://127.0.0.1:19090'), null, 'the local proxy health endpoint must be HTTP on loopback');
assert.equal(parseAksaLocalProxy('http://vpn.example:19090'), null, 'remote proxy endpoints are never trusted');
assert.equal(parseAksaLocalProxy('http://192.168.1.2:19090'), null, 'LAN gateways are not accepted as local loopback gateways');
assert.equal(parseAksaLocalProxy('http://127.0.0.1:80'), null, 'privileged ports are rejected');
assert.equal(parseAksaLocalProxy('http://user:secret@127.0.0.1:19090'), null, 'credential-bearing endpoints are rejected');
assert.equal(parseAksaLocalProxy('http://127.0.0.1:19090/other'), null, 'custom paths are rejected');

const local = parseAksaLocalProxy('http://127.0.0.1:19090');
assert.equal(local.origin, 'http://127.0.0.1:19090');
assert.equal(local.healthUrl, 'http://127.0.0.1:19090/health');
assert.equal(local.proxyRules, 'http=127.0.0.1:19090;https=127.0.0.1:19090');
assert.equal(local.proxyRules.includes('direct://'), false, 'no direct failover rule is added');
assert.equal(isConnectedHealthPayload({ status: 'ok', tunnel: 'connected' }), true);
assert.equal(isConnectedHealthPayload({ status: 'ok', tunnel: 'disconnected' }), false);
assert.equal(isConnectedHealthPayload({ status: 'ok' }), false);
assert.equal(isConnectedHealthPayload(null), false);

console.log('PASS - Electron Aksa accepts only loopback gateway and verified tunnel state');
