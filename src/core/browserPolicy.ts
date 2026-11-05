/**
 * Platform-neutral security policy for Aegis browser surfaces.
 *
 * This module deliberately has no Electron, Node, DOM, storage, or network dependencies.
 * Platform adapters must enforce these decisions at their privileged boundary.
 */

export type BrowserProfileKind = 'regular' | 'private';

export type SitePermission =
  | 'fullscreen'
  | 'media'
  | 'geolocation'
  | 'notifications'
  | 'camera'
  | 'microphone'
  | 'clipboard-read'
  | 'clipboard-sanitized-write'
  | 'midi'
  | 'usb'
  | 'serial'
  | 'bluetooth'
  | 'unknown';

export type NavigationSource = 'app-shell' | 'site';

export interface NavigationRequest {
  url: string;
  source: NavigationSource;
  trustedAppOrigin?: string;
}

export type NavigationDecision =
  | { action: 'allow'; url: string; destination: 'app' | 'web' }
  | { action: 'deny'; reason: 'invalid-url' | 'unsupported-scheme' | 'embedded-credentials' | 'untrusted-app-origin' };

const SAFE_WEB_PROTOCOLS = new Set(['http:', 'https:']);
const SAFE_CONTEXT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

/**
 * Only HTTP(S) URLs are valid site navigation targets. Credentials embedded in URLs are
 * rejected to prevent accidental credential disclosure through history, logs, or referrers.
 */
export function decideNavigation(request: NavigationRequest): NavigationDecision {
  let target: URL;
  try {
    target = new URL(request.url);
  } catch {
    return { action: 'deny', reason: 'invalid-url' };
  }

  if (!SAFE_WEB_PROTOCOLS.has(target.protocol)) {
    return { action: 'deny', reason: 'unsupported-scheme' };
  }

  if (target.username || target.password) {
    return { action: 'deny', reason: 'embedded-credentials' };
  }

  if (request.source === 'app-shell') {
    if (!request.trustedAppOrigin) {
      return { action: 'deny', reason: 'untrusted-app-origin' };
    }
    try {
      if (target.origin !== new URL(request.trustedAppOrigin).origin) {
        return { action: 'deny', reason: 'untrusted-app-origin' };
      }
    } catch {
      return { action: 'deny', reason: 'untrusted-app-origin' };
    }
    return { action: 'allow', url: target.toString(), destination: 'app' };
  }

  // Site surfaces must never navigate into the privileged application origin.
  if (request.trustedAppOrigin) {
    try {
      if (target.origin === new URL(request.trustedAppOrigin).origin) {
        return { action: 'deny', reason: 'untrusted-app-origin' };
      }
    } catch {
      // An invalid trusted origin is not a reason to reject otherwise valid web navigation.
    }
  }

  return { action: 'allow', url: target.toString(), destination: 'web' };
}

/** Permission policy is default-deny. Fullscreen requires a direct user gesture. */
export function decideSitePermission(permission: SitePermission, userGesture = false): boolean {
  return permission === 'fullscreen' && userGesture;
}

/** Chromium partition names are profile-scoped and shared by that profile's tabs. Private partitions omit the persist: prefix. */
export function getElectronPartition(kind: BrowserProfileKind, profileId: string): string | null {
  if (!SAFE_CONTEXT_ID.test(profileId)) return null;
  return kind === 'regular'
    ? `persist:aegis-regular-${profileId}`
    : `aegis-private-${profileId}`;
}

export interface ProfileStoragePolicy {
  persistent: boolean;
  clearOnClose: boolean;
  shareWithOtherProfiles: false;
}

export function getProfileStoragePolicy(kind: BrowserProfileKind): ProfileStoragePolicy {
  return kind === 'private'
    ? { persistent: false, clearOnClose: true, shareWithOtherProfiles: false }
    : { persistent: true, clearOnClose: false, shareWithOtherProfiles: false };
}

/** A context can only operate on resources owned by that exact context. */
export function ownsBrowsingContext(requesterContextId: string, resourceContextId: string): boolean {
  return SAFE_CONTEXT_ID.test(requesterContextId)
    && SAFE_CONTEXT_ID.test(resourceContextId)
    && requesterContextId === resourceContextId;
}

export type DiagnosticCategory =
  | 'media-error'
  | 'network-error'
  | 'permission-denied'
  | 'unsupported-codec'
  | 'drm-required'
  | 'navigation-denied';

export interface SafeDiagnosticEvent {
  category: DiagnosticCategory;
  origin: string | null;
  mimeType: string | null;
  code: string | null;
}

/**
 * Diagnostics are intentionally metadata-only: no path, query, fragment, page title,
 * cookies, headers, response bodies, or arbitrary error messages are retained.
 */
export function createSafeDiagnostic(input: {
  category: DiagnosticCategory;
  pageUrl?: string;
  mimeType?: string;
  code?: string;
}): SafeDiagnosticEvent {
  let origin: string | null = null;
  if (input.pageUrl) {
    try {
      const url = new URL(input.pageUrl);
      if (SAFE_WEB_PROTOCOLS.has(url.protocol)) origin = url.origin;
    } catch {
      origin = null;
    }
  }

  const mimeType = typeof input.mimeType === 'string'
    && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(input.mimeType)
    ? input.mimeType.toLowerCase()
    : null;

  const code = typeof input.code === 'string' && /^[A-Z0-9_-]{1,40}$/i.test(input.code)
    ? input.code
    : null;

  return { category: input.category, origin, mimeType, code };
}
