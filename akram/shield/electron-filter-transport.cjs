'use strict';

const dns = require('node:dns');
const net = require('node:net');
const { Agent, fetch: undiciFetch } = require('undici');

const blockedV4 = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blockedV4.addSubnet(address, prefix, 'ipv4');

const blockedV6 = new net.BlockList();
for (const [address, prefix] of [
  ['::', 128], ['::1', 128], ['100::', 64], ['2001::', 23], ['2001:db8::', 32],
  ['2002::', 16], ['64:ff9b:1::', 48], ['fc00::', 7], ['fe80::', 10],
  ['fec0::', 10], ['ff00::', 8],
]) blockedV6.addSubnet(address, prefix, 'ipv6');

function blockedIp(value) {
  const address = String(value || '').replace(/^\[|\]$/g, '');
  if (net.isIPv4(address)) return blockedV4.check(address, 'ipv4');
  if (!net.isIPv6(address) || address.includes('%')) return true;
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice(7);
    if (net.isIPv4(mapped)) return blockedV4.check(mapped, 'ipv4');
    const words = mapped.split(':');
    if (words.length === 2 && words.every((part) => /^[0-9a-f]{1,4}$/.test(part))) {
      const high = parseInt(words[0], 16), low = parseInt(words[1], 16);
      return blockedV4.check([high >> 8, high & 255, low >> 8, low & 255].join('.'), 'ipv4');
    }
    return true;
  }
  return blockedV6.check(normalized, 'ipv6');
}

/**
 * Undici calls this lookup at socket connection time. Resolve all answers and reject the
 * entire hostname if any answer is non-public; the returned address is the address used
 * by the socket, preventing a second DNS resolution between validation and connection.
 */
function guardedLookup(hostname, options, callback) {
  const opts = options && typeof options === 'object' ? options : {};
  dns.lookup(hostname, {
    family: opts.family || 0,
    hints: opts.hints || 0,
    all: true,
    verbatim: true,
  }, (error, addresses) => {
    if (error) return callback(error);
    if (!Array.isArray(addresses) || addresses.length === 0) return callback(new Error('No DNS records for filter source.'));
    if (addresses.some((entry) => blockedIp(entry.address))) {
      return callback(new Error('Filter source DNS resolved to a non-public address.'));
    }
    if (opts.all) return callback(null, addresses);
    const selected = addresses.find((entry) => !opts.family || entry.family === opts.family) || addresses[0];
    callback(null, selected.address, selected.family);
  });
}

const ALLOWED_HEADERS = new Set(['accept', 'if-none-match', 'if-modified-since']);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_TIMEOUT_MS = 120_000;

function safeHeaders(input) {
  const headers = { accept: 'text/plain, text/*;q=0.9, application/octet-stream;q=0.8' };
  for (const [rawName, value] of Object.entries(input || {})) {
    const name = rawName.toLowerCase();
    if (!ALLOWED_HEADERS.has(name) || typeof value !== 'string') continue;
    if (value.length > 2048 || /[\r\n]/.test(value)) throw new TypeError('Invalid filter request header.');
    headers[name] = value;
  }
  return headers;
}

async function readCapped(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new RangeError('Filter response exceeds the configured byte limit.');
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new RangeError('Filter response exceeds the configured byte limit.');
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks, total);
}

function createElectronFilterListFetcher({
  vpnStatus,
  lookup = guardedLookup,
  fetchImpl = undiciFetch,
} = {}) {
  if (typeof vpnStatus !== 'function') throw new TypeError('Authoritative Electron VPN state is required.');
  const dispatcher = new Agent({
    connect: { lookup, timeout: 10_000 },
    headersTimeout: 20_000,
    bodyTimeout: 30_000,
  });
  let disposed = false;

  async function fetchFilterList(target, init = {}) {
    if (disposed) throw new Error('Filter transport is closed.');
    const url = new URL(target);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
      throw new TypeError('Filter transport accepts HTTPS URLs without credentials or non-standard ports only.');
    }
    if (init.method && init.method.toUpperCase() !== 'GET') throw new TypeError('Filter transport only permits GET requests.');
    if (vpnStatus().enabled) {
      throw new Error('Filter updates are paused while Aksa VPN is enabled; direct fallback is forbidden.');
    }
    const timeoutMs = init.timeoutMs ?? 20_000;
    const maxBytes = init.maxBytes ?? 5 * 1024 * 1024;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new RangeError('Filter transport timeout is outside the permitted range.');
    }
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES) {
      throw new RangeError('Filter transport byte limit is outside the permitted range.');
    }
    const signal = init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);

    // Re-check immediately before dispatch. The dispatcher is direct-only and must never
    // be used as a fallback for an enabled VPN, even when the tunnel reports connected.
    if (vpnStatus().enabled) {
      throw new Error('Filter updates are paused while Aksa VPN is enabled; direct fallback is forbidden.');
    }
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: safeHeaders(init.headers),
      signal,
      redirect: 'manual',
      dispatcher,
    });
    if (REDIRECTS.has(response.status) || response.headers.get('location')) {
      await response.body?.cancel().catch(() => {});
      throw new Error('Filter source redirects are not permitted.');
    }
    const body = response.status === 200 ? await readCapped(response, maxBytes) : null;
    if (response.status !== 200) await response.body?.cancel().catch(() => {});
    return { finalUrl: url.href, response: { status: response.status, headers: response.headers, body } };
  }

  fetchFilterList.close = async () => {
    if (disposed) return;
    disposed = true;
    await dispatcher.close();
  };
  return fetchFilterList;
}

module.exports = { createElectronFilterListFetcher, guardedLookup, blockedIp, readCapped };
