'use strict';

const { LebeShields } = require('./shields.cjs');
const { LebeCosmeticFilters } = require('./cosmetic-filters.cjs');
const { DEFAULT_SHIELD_RULES } = require('./default-rules.cjs');

const DEFAULT_LIMITS = Object.freeze({
  maxListBytes: 5 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  maxLinesPerList: 100000,
  maxFilterLists: 64,
});

function validateListInput(input, limits) {
  if (!input || typeof input !== 'object') throw new TypeError('A filter-list descriptor is required.');
  const id = String(input.id || '').trim();
  const source = String(input.source || id).trim();
  const content = input.content;
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id)) throw new TypeError('Filter-list id must be 1-64 safe characters.');
  if (!source || source.length > 160) throw new TypeError('Filter-list source must be 1-160 characters.');
  if (typeof content !== 'string' || !content.trim()) throw new TypeError('Filter-list content must be a non-empty string.');
  const byteLength = new TextEncoder().encode(content).length;
  if (byteLength > limits.maxListBytes) throw new RangeError('Filter list exceeds the configured byte limit.');
  const lines = content.split(/\r?\n/);
  if (lines.length > limits.maxLinesPerList) throw new RangeError('Filter list exceeds the configured line limit.');
  return { id, source, content, lineCount: lines.length, byteLength };
}

function countCandidateLines(content) {
  return content.split(/\r?\n/).filter((line) => {
    const value = line.trim();
    return value && !value.startsWith('!') && !value.startsWith('[');
  }).length;
}

/**
 * Central, engine-neutral authority for deterministic Lebe Shield decisions.
 * Engine adapters should consume this API rather than maintain their own rules.
 */
class LebeShieldManager {
  #legacyRules;
  #limits;
  #lists = new Map();
  #network;
  #cosmetic;
  #metadata = new Map();
  #modules = { network: true, cosmetic: true };

  constructor(options = {}) {
    this.#legacyRules = Array.isArray(options.legacyRules) ? options.legacyRules : DEFAULT_SHIELD_RULES;
    this.#limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
    for (const key of Object.keys(DEFAULT_LIMITS)) {
      if (!Number.isSafeInteger(this.#limits[key]) || this.#limits[key] < 1) {
        throw new RangeError('Shield manager limits must be positive safe integers.');
      }
    }
    const engines = this.#buildEngines(this.#lists);
    this.#network = engines.network;
    this.#cosmetic = engines.cosmetic;
    this.#metadata = engines.metadata;
  }

  #buildEngines(lists) {
    const network = new LebeShields(this.#legacyRules);
    const cosmetic = new LebeCosmeticFilters();
    const metadata = new Map();

    for (const list of lists.values()) {
      const networkRuleCount = network.addFilterList(list.content, list.source);
      const cosmeticRuleCount = cosmetic.addFilterList(list.content, list.source);
      const candidateLineCount = countCandidateLines(list.content);
      metadata.set(list.id, Object.freeze({
        id: list.id,
        source: list.source,
        lineCount: list.lineCount,
        networkRuleCount,
        cosmeticRuleCount,
        unsupportedLineCount: Math.max(0, candidateLineCount - networkRuleCount - cosmeticRuleCount),
        enabled: true,
      }));
    }
    return { network, cosmetic, metadata };
  }

  #assertCollectionLimits(nextLists) {
    if (nextLists.size > this.#limits.maxFilterLists) throw new RangeError('Too many filter lists are registered.');
    const totalBytes = Array.from(nextLists.values()).reduce((sum, list) => sum + list.byteLength, 0);
    if (totalBytes > this.#limits.maxTotalBytes) throw new RangeError('Combined filter lists exceed the configured byte limit.');
  }

  #commitLists(nextLists) {
    // Build and validate the complete replacement before swapping live engines.
    const candidate = this.#buildEngines(nextLists);
    this.#lists = nextLists;
    this.#network = candidate.network;
    this.#cosmetic = candidate.cosmetic;
    this.#metadata = candidate.metadata;
    return candidate.metadata;
  }

  addFilterList(input) {
    const list = validateListInput(input, this.#limits);
    if (this.#lists.has(list.id)) throw new Error('Filter list already exists; use updateFilterList to replace it.');
    const next = new Map(this.#lists);
    next.set(list.id, list);
    this.#assertCollectionLimits(next);
    const metadata = this.#commitLists(next).get(list.id);
    return metadata;
  }

  updateFilterList(input) {
    const list = validateListInput(input, this.#limits);
    if (!this.#lists.has(list.id)) throw new Error('Cannot update a filter list that is not registered.');
    const next = new Map(this.#lists);
    next.set(list.id, list);
    this.#assertCollectionLimits(next);
    return this.#commitLists(next).get(list.id);
  }

  removeFilterList(id) {
    const key = String(id || '').trim();
    if (!this.#lists.has(key)) return false;
    const next = new Map(this.#lists);
    next.delete(key);
    this.#commitLists(next);
    return true;
  }

  listFilterLists() {
    return Array.from(this.#metadata.values());
  }

  evaluateRequest(request = {}) {
    if (!this.#modules.network) {
      return Object.freeze({ action: 'allow', reason: 'module-disabled', category: 'network' });
    }
    const decision = this.#network.evaluate(request);
    return Object.freeze({
      ...decision,
      category: 'network',
      profile: 'lebe-default',
    });
  }

  evaluate(request = {}) {
    return this.evaluateRequest(request);
  }

  getCosmeticCss(rawUrl) {
    return this.#modules.cosmetic ? this.#cosmetic.getCss(rawUrl) : '';
  }

  setModuleEnabled(module, enabled) {
    if (!Object.prototype.hasOwnProperty.call(this.#modules, module)) {
      throw new RangeError('Unknown or not-yet-implemented Shield module.');
    }
    if (typeof enabled !== 'boolean') throw new TypeError('Module state must be boolean.');
    this.#modules[module] = enabled;
    return this.getModuleStates();
  }

  getModuleStates() {
    return Object.freeze({ ...this.#modules });
  }

  getStats() {
    const lists = Array.from(this.#metadata.values());
    return Object.freeze({
      profile: 'lebe-default',
      modules: this.getModuleStates(),
      filterListCount: lists.length,
      networkRuleCount: this.#network.networkRuleCount,
      legacyRuleCount: this.#network.ruleCount - this.#network.networkRuleCount,
      cosmeticRuleCount: this.#cosmetic.ruleCount,
      unsupportedLineCount: lists.reduce((sum, item) => sum + item.unsupportedLineCount, 0),
    });
  }
}

module.exports = { LebeShieldManager };
