'use strict';

const { createHash } = require('node:crypto');
const { AkramShields } = require('../core/shields.cjs');
const { AkramCosmeticFilters } = require('../core/cosmetic-filters.cjs');

const DEFAULT_LIMITS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxLines: 100000,
  maxRedirects: 3,
  timeoutMs: 20000,
});

function normalizeHeaders(headers) {
  const get = (name) => {
    if (headers && typeof headers.get === 'function') return headers.get(name);
    if (!headers || typeof headers !== 'object') return null;
    const key = Object.keys(headers).find((entry) => entry.toLowerCase() === name.toLowerCase());
    return key ? String(headers[key]) : null;
  };
  return { get };
}

function assertHttpsUrl(raw, allowedHosts) {
  let url;
  try { url = new URL(raw); } catch { throw new TypeError('Filter source URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new TypeError('Filter sources must use HTTPS without credentials or non-standard ports.');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!allowedHosts.has(host)) throw new TypeError('Filter source host is not allowlisted.');
  return url;
}

async function readBodyLimited(body, maxBytes) {
  if (body == null) throw new Error('Filter source returned an empty response body.');
  const chunks = [];
  let total = 0;
  const add = (chunk) => {
    const value = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    total += value.byteLength;
    if (total > maxBytes) throw new RangeError('Filter response exceeds the configured byte limit.');
    chunks.push(Buffer.from(value));
  };
  if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
    add(body);
    return Buffer.concat(chunks, total);
  }
  if (typeof body === 'string') {
    add(Buffer.from(body, 'utf8'));
    return Buffer.concat(chunks, total);
  }
  if (typeof body.getReader === 'function') {
    const reader = body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        add(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    }
    return Buffer.concat(chunks, total);
  }
  if (typeof body[Symbol.asyncIterator] === 'function') {
    try {
      for await (const chunk of body) add(chunk);
    } catch (error) {
      if (typeof body.destroy === 'function') body.destroy();
      throw error;
    }
    return Buffer.concat(chunks, total);
  }
  throw new TypeError('Filter transport returned an unsupported response body.');
}

function validateFilterText(text, limits) {
  if (!text.trim()) throw new Error('Filter list is empty.');
  const lines = text.split(/\r?\n/);
  if (lines.length > limits.maxLines) throw new RangeError('Filter list exceeds the configured line limit.');

  // Plain network filters cannot contain whitespace; allowing arbitrary prose here would
  // turn a downloaded HTML/error page into a syntactically accepted catch-all pattern.
  const candidate = lines.filter((raw) => {
    const line = raw.trim();
    return line && !line.startsWith('!') && !line.startsWith('[') &&
      (line.includes('##') || line.includes('#@#') || !/\s/.test(line));
  }).join('\n');
  // Comments and whitespace alone must not qualify as a valid downloaded list.
  if (!candidate.trim()) throw new Error('Filter list contains no rules.');
  const network = new AkramShields([]);
  const cosmetic = new AkramCosmeticFilters();
  const networkRuleCount = network.addFilterList(candidate, 'validation');
  const cosmeticRuleCount = cosmetic.addFilterList(candidate, 'validation');
  if (networkRuleCount + cosmeticRuleCount === 0) {
    throw new Error('Filter list contains no supported network or cosmetic rules.');
  }
  return { lineCount: lines.length, networkRuleCount, cosmeticRuleCount };
}

/**
 * Fetches and validates remote lists, then asks the Shield Manager to atomically activate them.
 * The injected fetcher MUST validate DNS/IPs and every redirect hop (for example via server/ssrf.ts).
 * No network-capable default is provided deliberately.
 */
class AkramFilterListUpdater {
  #manager;
  #fetcher;
  #allowedHosts;
  #limits;
  #sources = new Map();
  #metadata = new Map();
  #inFlight = new Set();

  constructor({ manager, fetcher, allowedHosts, limits = {} } = {}) {
    if (!manager || typeof manager.addFilterList !== 'function' || typeof manager.updateFilterList !== 'function') {
      throw new TypeError('A compatible AkramShieldManager is required.');
    }
    if (typeof fetcher !== 'function') throw new TypeError('A security-reviewed fetcher must be injected.');
    if (!Array.isArray(allowedHosts) || allowedHosts.length === 0) {
      throw new TypeError('At least one trusted filter-source hostname must be allowlisted.');
    }
    this.#manager = manager;
    this.#fetcher = fetcher;
    this.#allowedHosts = new Set(allowedHosts.map((host) => String(host).toLowerCase().replace(/\.$/, '')));
    this.#limits = { ...DEFAULT_LIMITS, ...limits };
    for (const [key, value] of Object.entries(this.#limits)) {
      const minimum = key === 'maxRedirects' ? 0 : 1;
      if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError(`Invalid updater limit: ${key}`);
    }
  }

  registerSource({ id, url, enabled = true } = {}) {
    const key = String(id || '').trim();
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(key)) throw new TypeError('Source id must be 1-64 safe characters.');
    if (typeof enabled !== 'boolean') throw new TypeError('Source enabled state must be boolean.');
    const parsed = assertHttpsUrl(url, this.#allowedHosts);
    if (this.#sources.has(key)) throw new Error('Filter source is already registered.');
    this.#sources.set(key, Object.freeze({ id: key, url: parsed.href, enabled }));
    return this.getSource(key);
  }

  getSource(id) {
    const source = this.#sources.get(String(id || '').trim());
    if (!source) return null;
    const metadata = this.#metadata.get(source.id) || null;
    return Object.freeze({ ...source, metadata });
  }

  listSources() {
    return [...this.#sources.keys()].map((id) => this.getSource(id));
  }

  async update(id, { signal } = {}) {
    const key = String(id || '').trim();
    const source = this.#sources.get(key);
    if (!source) throw new Error('Unknown filter source.');
    if (this.#inFlight.has(key)) throw new Error('An update for this filter source is already running.');
    this.#inFlight.add(key);
    try {
      const requestUrl = assertHttpsUrl(source.url, this.#allowedHosts);
      const previous = this.#metadata.get(key);
      const headers = { Accept: 'text/plain, text/*;q=0.9, application/octet-stream;q=0.8' };
      if (previous?.etag) headers['If-None-Match'] = previous.etag;
      if (previous?.lastModified) headers['If-Modified-Since'] = previous.lastModified;

      const result = await this.#fetcher(requestUrl.href, {
        method: 'GET', headers, signal,
        timeoutMs: this.#limits.timeoutMs,
        maxRedirects: this.#limits.maxRedirects,
        maxBytes: this.#limits.maxBytes,
      });
      if (!result || !result.response || !result.finalUrl) throw new Error('Secure transport returned an invalid result.');
      const finalUrl = assertHttpsUrl(String(result.finalUrl), this.#allowedHosts);
      if (finalUrl.href !== requestUrl.href) throw new Error('Filter source redirects are not permitted.');

      const response = result.response;
      const status = Number(response.status);
      const responseHeaders = normalizeHeaders(response.headers);
      if (status === 304) {
        if (!previous) throw new Error('Received 304 without a previously validated filter list.');
        return Object.freeze({ status: 'not-modified', id: key, metadata: previous });
      }
      if (status !== 200) throw new Error(`Filter source returned HTTP ${status}.`);
      const contentType = (responseHeaders.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!(contentType.startsWith('text/') || contentType === 'application/octet-stream')) {
        throw new Error('Filter source returned an unsupported content type.');
      }
      const declaredLength = Number(responseHeaders.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > this.#limits.maxBytes) {
        throw new RangeError('Filter response exceeds the configured byte limit.');
      }

      const bytes = await readBodyLimited(response.body, this.#limits.maxBytes);
      if (bytes.length === 0) throw new Error('Filter source returned an empty response body.');
      let content;
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); }
      catch { throw new Error('Filter list is not valid UTF-8.'); }
      const validation = validateFilterText(content, this.#limits);
      const digest = createHash('sha256').update(bytes).digest('hex');
      const descriptor = { id: key, source: requestUrl.href, content };
      const existing = this.#manager.listFilterLists().some((item) => item.id === key);
      const managerMetadata = existing
        ? this.#manager.updateFilterList(descriptor)
        : this.#manager.addFilterList({ ...descriptor, enabled: source.enabled });

      const metadata = Object.freeze({
        id: key, url: requestUrl.href, sha256: digest, byteLength: bytes.length,
        lineCount: validation.lineCount,
        networkRuleCount: managerMetadata.networkRuleCount,
        cosmeticRuleCount: managerMetadata.cosmeticRuleCount,
        unsupportedLineCount: managerMetadata.unsupportedLineCount,
        enabled: managerMetadata.enabled,
        etag: responseHeaders.get('etag'),
        lastModified: responseHeaders.get('last-modified'),
        updatedAt: new Date().toISOString(),
      });
      this.#metadata.set(key, metadata);
      return Object.freeze({ status: 'updated', id: key, metadata });
    } finally {
      this.#inFlight.delete(key);
    }
  }
}

module.exports = { AkramFilterListUpdater, validateFilterText, readBodyLimited, assertHttpsUrl };
