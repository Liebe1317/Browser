'use strict';

function parseAksaLocalProxy(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    const port = Number(url.port);
    if (
      url.protocol !== 'http:' ||
      !localHosts.has(host) ||
      !Number.isInteger(port) ||
      port < 1024 ||
      port > 65535 ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) return null;

    const endpoint = `${host.includes(':') ? `[${host.replace(/^\[|\]$/g, '')}]` : host}:${port}`;
    return Object.freeze({
      origin: url.origin,
      endpoint,
      healthUrl: `${url.origin}/health`,
      proxyRules: `http=${endpoint};https=${endpoint}`,
      proxyBypassRules: 'localhost;127.0.0.1;[::1]',
    });
  } catch {
    return null;
  }
}

function isConnectedHealthPayload(value) {
  return !!value && typeof value === 'object' && value.status === 'ok' && value.tunnel === 'connected';
}

module.exports = { parseAksaLocalProxy, isConnectedHealthPayload };
