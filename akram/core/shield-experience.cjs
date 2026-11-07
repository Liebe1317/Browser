'use strict';

const crypto = require('node:crypto');

const DEFAULT_LIMITS = Object.freeze({ maxEntries: 5000, maxHostLength: 253, maxSelectorLength: 256 });

function safeHost(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  if (!raw || raw.length > 253) return '';
  try {
    const parsed = new URL(raw.includes('://') ? raw : 'https://' + raw);
    if (parsed.username || parsed.password) return '';
    return parsed.hostname.toLowerCase().replace(/\.$/, '');
  } catch { return ''; }
}

function safeToken(value, max = 80) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function normalizeObservation(input = {}) {
  const host = safeHost(input.host || input.url);
  const pageHost = safeHost(input.pageHost || input.documentUrl || input.initiator);
  const surface = ['network', 'cosmetic', 'player'].includes(input.surface) ? input.surface : 'network';
  const placement = ['network', 'page', 'player-overlay', 'player-inline'].includes(input.placement)
    ? input.placement : (surface === 'network' ? 'network' : 'page');
  const resourceType = safeToken(input.resourceType || 'other', 32).toLowerCase() || 'other';
  const ruleId = safeToken(input.ruleId, 100);
  const source = safeToken(input.source, 80);
  // Keep selectors only as bounded CSS metadata; never retain page text, HTML, or full URLs.
  const selector = safeToken(input.selector, DEFAULT_LIMITS.maxSelectorLength);
  const identity = [host, pageHost, surface, placement, resourceType, ruleId, source, selector].join('|');
  const fingerprint = crypto.createHash('sha256').update(identity).digest('hex');
  return { host, pageHost, surface, placement, resourceType, ruleId, source, selector, fingerprint };
}

class AkramShieldExperience {
  #entries = new Map();
  #limits;

  constructor(options = {}) {
    this.#limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
    for (const [key, value] of Object.entries(this.#limits)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('Experience limits must be positive safe integers.');
    }
    if (options.snapshot) this.importSnapshot(options.snapshot);
  }

  recordObservation(input = {}) {
    const normalized = normalizeObservation(input);
    if (!normalized.host) return null;
    const now = Number.isFinite(input.timestamp) ? input.timestamp : Date.now();
    const current = this.#entries.get(normalized.fingerprint);
    if (current) {
      current.observations += 1;
      current.lastSeenAt = now;
      if (input.decision === 'block') current.blockedCount += 1;
      if (input.decision === 'allow') current.allowedCount += 1;
      return Object.freeze({ ...current });
    }
    if (this.#entries.size >= this.#limits.maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest) this.#entries.delete(oldest);
    }
    const entry = {
      ...normalized,
      observations: 1,
      blockedCount: input.decision === 'block' ? 1 : 0,
      allowedCount: input.decision === 'allow' ? 1 : 0,
      outcome: 'unverified',
      firstSeenAt: now,
      lastSeenAt: now,
      verifiedAt: null,
    };
    this.#entries.set(entry.fingerprint, entry);
    return Object.freeze({ ...entry });
  }

  setOutcome(fingerprint, outcome) {
    if (!['confirmed-ad', 'false-positive', 'unknown'].includes(outcome)) {
      throw new TypeError('Experience outcome must be confirmed-ad, false-positive, or unknown.');
    }
    const entry = this.#entries.get(String(fingerprint || ''));
    if (!entry) return false;
    entry.outcome = outcome;
    entry.verifiedAt = Date.now();
    return Object.freeze({ ...entry });
  }

  getCandidates(options = {}) {
    const limit = Math.min(this.#limits.maxEntries, Math.max(1, Number.isSafeInteger(options.limit) ? options.limit : 100));
    return Array.from(this.#entries.values())
      .filter((entry) => options.includeUnverified === true || entry.outcome === 'confirmed-ad')
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .slice(0, limit)
      .map((entry) => Object.freeze({ ...entry }));
  }

  getStats() {
    let confirmed = 0, falsePositives = 0, unverified = 0;
    for (const entry of this.#entries.values()) {
      if (entry.outcome === 'confirmed-ad') confirmed += 1;
      else if (entry.outcome === 'false-positive') falsePositives += 1;
      else unverified += 1;
    }
    return Object.freeze({
      entries: this.#entries.size,
      confirmed,
      falsePositives,
      unverified,
      observations: Array.from(this.#entries.values()).reduce((sum, entry) => sum + entry.observations, 0),
    });
  }

  exportSnapshot() {
    return Object.freeze({
      schemaVersion: 1,
      entries: Array.from(this.#entries.values()).map((entry) => ({ ...entry })),
    });
  }

  importSnapshot(snapshot) {
    if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.entries)) {
      throw new TypeError('Unsupported Akram Shield experience snapshot.');
    }
    const next = new Map();
    for (const item of snapshot.entries.slice(-this.#limits.maxEntries)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const normalized = normalizeObservation(item);
      if (!normalized.host || normalized.fingerprint !== item.fingerprint) continue;
      const outcome = ['confirmed-ad', 'false-positive', 'unknown'].includes(item.outcome) ? item.outcome : 'unverified';
      const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
      next.set(normalized.fingerprint, {
        ...normalized,
        observations: Math.max(1, count(item.observations)),
        blockedCount: count(item.blockedCount),
        allowedCount: count(item.allowedCount),
        outcome,
        firstSeenAt: count(item.firstSeenAt),
        lastSeenAt: count(item.lastSeenAt),
        verifiedAt: item.verifiedAt === null ? null : count(item.verifiedAt),
      });
    }
    this.#entries = next;
    return this.getStats();
  }
}

module.exports = { AkramShieldExperience, normalizeObservation };
