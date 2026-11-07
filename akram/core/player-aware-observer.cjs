'use strict';

const crypto = require('node:crypto');

const OBSERVER_PREFIX = 'AKRAM_PLAYER_OBS:';

function classifyPlayerElement(input = {}) {
  const tag = String(input.tagName || '').toLowerCase();
  const signals = Array.isArray(input.signals)
    ? [...new Set(input.signals.map((value) => String(value).toLowerCase()).filter(Boolean))]
    : [];
  const protectedSignal = /(^|[-_\\s])(controls?|captions?|subtitles?|seek|progress|timeline|scrubber|volume|play|pause|fullscreen|settings|quality|toolbar|time-display|transcript)([-_\\s]|$)/i;
  const hasProtectedSignal = signals.some((value) => protectedSignal.test(value));
  if (
    ['video', 'audio', 'button', 'input', 'select', 'textarea'].includes(tag)
    || input.role === 'button'
    || input.hasProtectedAncestor === true
    || input.containsProtectedDescendant === true
    || hasProtectedSignal
  ) {
    return { kind: 'protected', confidence: 'high', reasons: ['player-control-or-media'] };
  }

  const adSignal = /(^|[-_\\s])(ad|ads|advert|advertisement|sponsor|sponsored|promotion|preroll|midroll|postroll|vast|ima)([-_\\s]|$)/i;
  const matched = signals.filter((value) => adSignal.test(value));
  if (!input.inPlayer || !input.isOverlay || matched.length === 0) {
    return { kind: 'ignore', confidence: 'low', reasons: [] };
  }
  const strong = matched.some((value) => /sponsor|vast|ima|preroll|midroll|postroll|advertisement/i.test(value));
  return {
    kind: 'candidate',
    confidence: strong || matched.length > 1 ? 'high' : 'medium',
    reasons: matched.slice(0, 6),
  };
}

function createPlayerObserverToken() {
  return crypto.randomBytes(24).toString('hex');
}

function buildPlayerObserverScript(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token)) {
    throw new TypeError('A 192-bit player observer token is required.');
  }
  const classifier = classifyPlayerElement.toString();
  return `(() => {
    'use strict';
    const token = ${JSON.stringify(token)};
    const prefix = ${JSON.stringify(OBSERVER_PREFIX)};
    const classifyPlayerElement = ${classifier};
    if (window.__akramPlayerObserverToken === token) return 'already-installed';
    window.__akramPlayerObserverToken = token;
    const reported = new WeakSet();
    const seen = new Set();
    let scheduled = false;
    let reportedCount = 0;

    const clean = (value, max = 80) => String(value || '').replace(/[\\u0000-\\u001f\\u007f]/g, '').trim().slice(0, max);
    const selectorFor = (element) => {
      if (element.id) return '#' + CSS.escape(element.id).slice(0, 180);
      const classes = [...element.classList].filter(Boolean).slice(0, 3).map((name) => '.' + CSS.escape(name));
      return (element.tagName.toLowerCase() + classes.join('')).slice(0, 256);
    };
    const inspect = (element) => {
      if (!(element instanceof Element) || reported.has(element) || reportedCount >= 40) return;
      const tag = element.tagName.toLowerCase();
      const rawSignals = [
        element.id, element.className,
        element.getAttribute('data-ad'), element.getAttribute('data-testid'),
        element.getAttribute('aria-label'), element.getAttribute('title'),
      ].filter((value) => typeof value === 'string').map((value) => clean(value.toLowerCase()));
      const signals = rawSignals.filter(Boolean);
      const protectedAncestor = !!element.closest('video,audio,button,input,select,textarea,[role="button"]')
        || !!element.closest('[class*="caption"],[class*="subtitle"],[class*="control"],[class*="progress"],[class*="timeline"]');
      const protectedDescendant = !!element.querySelector('video,audio,button,input,select,textarea,[role="button"],[class*="caption"],[class*="subtitle"]');
      let playerRoot = element.closest('.video-js,.jwplayer,.plyr,.html5-video-player,[data-player]');
      if (!playerRoot) {
        let parent = element.parentElement;
        for (let depth = 0; parent && depth < 7; depth += 1, parent = parent.parentElement) {
          if (parent.querySelector('video')) { playerRoot = parent; break; }
        }
      }
      const inPlayer = !!playerRoot;
      let isOverlay = false;
      try {
        const style = getComputedStyle(element);
        isOverlay = style.position === 'fixed' || style.position === 'absolute'
          || (inPlayer && style.zIndex !== 'auto' && style.zIndex !== '');
      } catch {}
      const result = classifyPlayerElement({
        tagName: tag,
        role: element.getAttribute('role') || '',
        signals,
        inPlayer,
        isOverlay,
        hasProtectedAncestor: protectedAncestor,
        containsProtectedDescendant: protectedDescendant,
      });
      if (result.kind !== 'candidate') return;
      const selector = selectorFor(element);
      if (!selector || seen.has(selector)) return;
      seen.add(selector);
      reported.add(element);
      reportedCount += 1;
      const payload = {
        type: 'candidate',
        selector,
        placement: 'player-overlay',
        confidence: result.confidence,
        reasons: result.reasons,
        tag: clean(tag, 16),
      };
      try { console.info(prefix + token + ':' + JSON.stringify(payload)); } catch {}
    };

    const scan = (root) => {
      if (!(root instanceof Element || root instanceof Document)) return;
      if (root instanceof Element) inspect(root);
      const candidates = root.querySelectorAll ? root.querySelectorAll('[id],[class],[data-ad],[data-testid],[aria-label],[title]') : [];
      for (let index = 0; index < Math.min(candidates.length, 300); index += 1) inspect(candidates[index]);
    };
    const schedule = (root) => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; scan(root instanceof Element ? root : document); });
    };
    scan(document);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') inspect(record.target);
        for (const node of record.addedNodes || []) {
          if (node instanceof Element) schedule(node);
        }
      }
    });
    observer.observe(document.documentElement, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['id', 'class', 'style', 'data-ad', 'data-testid', 'aria-label', 'title'],
    });
    return 'installed';
  })();`;
}

module.exports = {
  OBSERVER_PREFIX,
  classifyPlayerElement,
  createPlayerObserverToken,
  buildPlayerObserverScript,
};
