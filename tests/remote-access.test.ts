import assert from 'node:assert/strict';
import {
  isRemoteBind,
  resolveRemoteAccessCredentials,
  verifyBasicAuthorization,
} from '../server/remoteAccess.ts';

assert.equal(isRemoteBind('127.0.0.1'), false);
assert.equal(isRemoteBind('127.0.0.2'), false);
assert.equal(isRemoteBind('localhost'), false);
assert.equal(isRemoteBind('::1'), false);
assert.equal(isRemoteBind('0.0.0.0'), true);
assert.equal(isRemoteBind('192.168.1.10'), true);
assert.equal(isRemoteBind('::'), true);

assert.throws(() => resolveRemoteAccessCredentials({}), /Remote binding refused/);
assert.throws(
  () => resolveRemoteAccessCredentials({ AKRAM_REMOTE_AUTH_USER: 'akram', AKRAM_REMOTE_AUTH_PASSWORD: 'short' }),
  /Remote binding refused/
);
assert.throws(
  () => resolveRemoteAccessCredentials({ AKRAM_REMOTE_AUTH_USER: 'a:b', AKRAM_REMOTE_AUTH_PASSWORD: 'x'.repeat(32) }),
  /Remote binding refused/
);
assert.deepEqual(
  resolveRemoteAccessCredentials({ AKRAM_REMOTE_AUTH_USER: 'akram', AKRAM_REMOTE_AUTH_PASSWORD: 'x'.repeat(32) }),
  { username: 'akram', password: 'x'.repeat(32) }
);

const username = 'akram';
const password = 'a-strong-remote-password-with-32chars';
const valid = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
assert.equal(verifyBasicAuthorization(valid, username, password), true);
assert.equal(verifyBasicAuthorization(valid, username, 'different-password'), false);
assert.equal(verifyBasicAuthorization(valid, 'different-user', password), false);
assert.equal(verifyBasicAuthorization(undefined, username, password), false);
assert.equal(verifyBasicAuthorization('Bearer token', username, password), false);
assert.equal(verifyBasicAuthorization('Basic !!!', username, password), false);

console.log('PASS - remote binds require strong Basic auth and credentials are verified safely');
