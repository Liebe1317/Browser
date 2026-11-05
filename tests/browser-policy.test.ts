import {
  createSafeDiagnostic,
  decideNavigation,
  decideSitePermission,
  getElectronPartition,
  getProfileStoragePolicy,
  ownsBrowsingContext,
} from '../src/core/browserPolicy.ts';

const ok = (condition: boolean, message: string) => {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + message);
  if (!condition) process.exitCode = 1;
};

const trustedOrigin = 'http://127.0.0.1:3000';
ok(
  decideNavigation({ url: trustedOrigin + '/settings', source: 'app-shell', trustedAppOrigin: trustedOrigin }).action === 'allow',
  'trusted application shell may navigate within its exact origin',
);
ok(
  decideNavigation({ url: 'https://example.com/watch', source: 'app-shell', trustedAppOrigin: trustedOrigin }).action === 'deny',
  'application shell cannot navigate to an arbitrary website',
);
ok(
  decideNavigation({ url: 'https://example.com/watch', source: 'site', trustedAppOrigin: trustedOrigin }).action === 'allow',
  'isolated site surface may navigate to an ordinary HTTPS website',
);
ok(
  decideNavigation({ url: trustedOrigin + '/api/bootstrap', source: 'site', trustedAppOrigin: trustedOrigin }).action === 'deny',
  'untrusted site surface cannot navigate into the privileged application origin',
);
ok(
  decideNavigation({ url: 'javascript:alert(1)', source: 'site' }).action === 'deny',
  'javascript URLs are rejected',
);
ok(
  decideNavigation({ url: 'file:///etc/passwd', source: 'site' }).action === 'deny',
  'file URLs are rejected for site navigation',
);
ok(
  decideNavigation({ url: 'https://user:password@example.com/', source: 'site' }).action === 'deny',
  'credentials embedded in navigation URLs are rejected',
);
ok(
  decideNavigation({ url: 'not a url', source: 'site' }).action === 'deny',
  'malformed navigation URLs are rejected',
);

ok(!decideSitePermission('camera', true), 'camera permission is denied even after a gesture');
ok(!decideSitePermission('microphone', true), 'microphone permission is denied by default');
ok(!decideSitePermission('geolocation', true), 'geolocation permission is denied by default');
ok(!decideSitePermission('fullscreen', false), 'fullscreen is denied without a user gesture');
ok(decideSitePermission('fullscreen', true), 'fullscreen is allowed only with a direct user gesture');

ok(
  getElectronPartition('regular', 'profile-main') === 'persist:aegis-regular-profile-main',
  'regular profile uses a persistent, namespaced Chromium partition',
);
ok(
  getElectronPartition('private', 'profile-main') === 'aegis-private-profile-main',
  'private profile uses a non-persistent Chromium partition',
);
ok(getElectronPartition('private', '../escape') === null, 'partition profile IDs reject path-like input');
ok(getProfileStoragePolicy('regular').persistent, 'regular profile storage is persistent');
ok(
  !getProfileStoragePolicy('private').persistent && getProfileStoragePolicy('private').clearOnClose,
  'private profile storage is ephemeral and must be cleared on close',
);
ok(
  !getProfileStoragePolicy('private').shareWithOtherProfiles,
  'private profile storage is never shared with other profiles',
);

ok(ownsBrowsingContext('tab-a', 'tab-a'), 'a context may access its own resources');
ok(!ownsBrowsingContext('tab-a', 'tab-b'), 'a context cannot access another context resources');
ok(!ownsBrowsingContext('../tab', '../tab'), 'invalid context IDs never establish ownership');

const diagnostic = createSafeDiagnostic({
  category: 'media-error',
  pageUrl: 'https://video.example/watch/secret-title?token=super-secret#fragment',
  mimeType: 'VIDEO/MP4',
  code: 'PIPELINE_ERROR',
});
ok(diagnostic.origin === 'https://video.example', 'diagnostics retain only the page origin, not its path or query');
ok(diagnostic.mimeType === 'video/mp4', 'diagnostics normalize a valid media MIME type');
ok(diagnostic.code === 'PIPELINE_ERROR', 'diagnostics retain only bounded machine-readable error codes');
ok(
  !JSON.stringify(diagnostic).includes('super-secret')
    && !JSON.stringify(diagnostic).includes('secret-title')
    && !JSON.stringify(diagnostic).includes('fragment'),
  'diagnostics never retain URL credentials, path, query, or fragment',
);
const invalidDiagnostic = createSafeDiagnostic({
  category: 'network-error',
  pageUrl: 'file:///private/path',
  mimeType: 'text/html; token=secret',
  code: 'Network error with private detail',
});
ok(invalidDiagnostic.origin === null, 'diagnostics reject non-web origins');
ok(invalidDiagnostic.mimeType === null && invalidDiagnostic.code === null, 'diagnostics reject arbitrary strings and secret-bearing metadata');
