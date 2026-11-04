import assert from 'node:assert/strict';
import { createAksaVpnController } from '../server/aksaVpn.ts';

const assigned: unknown[] = [];
const proxy = { name: 'mock-vpn-proxy' } as any;

const missing = createAksaVpnController(undefined, (dispatcher) => assigned.push(dispatcher), () => proxy, async () => true);
assert.deepEqual(missing.status(), { configured: false, enabled: false, connected: false, gateway: 'not-configured', scope: 'server-egress-only' });
const refused = await missing.setEnabled(true);
assert.equal(refused.ok, false, 'Aksa refuses to enable without a local VPN gateway');
assert.equal(missing.dispatcher(), undefined, 'no direct or fake dispatcher is substituted');

const invalidRemote = createAksaVpnController('http://vpn.example:3128', (dispatcher) => assigned.push(dispatcher), () => proxy, async () => true);
assert.equal(invalidRemote.status().configured, false, 'remote proxy URLs are not accepted as trusted local gateways');

let createdProxy = false;
const unhealthy = createAksaVpnController(
  'http://127.0.0.1:19090',
  (dispatcher) => assigned.push(dispatcher),
  () => { createdProxy = true; return proxy; },
  async () => false
);
const unhealthyResult = await unhealthy.setEnabled(true);
assert.equal(unhealthyResult.ok, false, 'Aksa refuses an open port without a confirmed active tunnel');
assert.equal(createdProxy, false, 'no proxy is installed before a successful tunnel health check');
assert.equal(unhealthy.dispatcher(), undefined, 'unhealthy Aksa cannot silently route directly');

const controller = createAksaVpnController(
  'http://127.0.0.1:19090',
  (dispatcher) => assigned.push(dispatcher),
  () => proxy,
  async () => true
);
assert.equal(controller.status().configured, true);
assert.equal((await controller.setEnabled(true)).ok, true);
assert.equal(controller.status().enabled, true);
assert.equal(controller.status().connected, true);
assert.equal(controller.dispatcher(), proxy, 'browser server requests receive the VPN proxy dispatcher');
assert.equal(assigned.at(-1), proxy, 'server outbound requests are routed through the VPN gateway');
assert.equal((await controller.setEnabled(false)).ok, true);
assert.equal(controller.status().enabled, false);
assert.equal(controller.status().connected, false);
assert.equal(controller.dispatcher(), undefined, 'disabling Aksa restores normal server networking');
assert.notEqual(assigned.at(-1), proxy, 'the proxy dispatcher is removed when disabled');

console.log('PASS - Aksa requires a verified tunnel and never substitutes a direct fallback while enabled');
