import assert from 'node:assert/strict';
import { createAksaVpnController } from '../server/aksaVpn.ts';

const assigned: unknown[] = [];
const proxy = { name: 'mock-vpn-proxy' } as any;

const missing = createAksaVpnController(undefined, (dispatcher) => assigned.push(dispatcher), () => proxy);
assert.deepEqual(missing.status(), { configured: false, enabled: false, gateway: 'not-configured' });
const refused = missing.setEnabled(true);
assert.equal(refused.ok, false, 'Aksa refuses to enable without a local VPN gateway');
assert.equal(missing.dispatcher(), undefined, 'no direct or fake dispatcher is substituted');

const invalidRemote = createAksaVpnController('http://vpn.example:3128', (dispatcher) => assigned.push(dispatcher), () => proxy);
assert.equal(invalidRemote.status().configured, false, 'remote proxy URLs are not accepted as trusted local gateways');

const controller = createAksaVpnController('http://127.0.0.1:19090', (dispatcher) => assigned.push(dispatcher), () => proxy);
assert.equal(controller.status().configured, true);
assert.equal(controller.setEnabled(true).ok, true);
assert.equal(controller.status().enabled, true);
assert.equal(controller.dispatcher(), proxy, 'browser requests receive the VPN proxy dispatcher');
assert.equal(assigned.at(-1), proxy, 'global browser-server fetches are routed through the VPN gateway');
assert.equal(controller.setEnabled(false).ok, true);
assert.equal(controller.status().enabled, false);
assert.equal(controller.dispatcher(), undefined, 'disabling Aksa restores direct browser networking');
assert.notEqual(assigned.at(-1), proxy, 'the proxy dispatcher is removed when disabled');

console.log('PASS - Aksa VPN fails closed and switches the browser network dispatcher');
