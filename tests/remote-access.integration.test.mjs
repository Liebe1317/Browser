import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';

const username = 'akram-integration';
const password = 'integration-password-with-more-than-24-chars';
const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function launchServer(port, envOverrides = {}) {
  return spawn(process.execPath, ['--import', 'tsx', 'server.ts', '--port', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: '0.0.0.0',
      NODE_ENV: 'test',
      AEGIS_ALLOWED_HOSTS: 'localhost,127.0.0.1',
      AKRAM_REMOTE_AUTH_USER: username,
      AKRAM_REMOTE_AUTH_PASSWORD: password,
      ...envOverrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForExit(child, timeoutMs = 12_000) {
  if (child.exitCode !== null) return child.exitCode;
  return await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}

async function waitForHttp(url, child) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited before becoming ready (code ${child.exitCode}).`);
    try {
      return await fetch(url, { signal: AbortSignal.timeout(1_500) });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Server did not become ready: ${String(lastError)}`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(undefined);
    });
  });
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function main() {
  // A wildcard bind must fail closed when remote credentials are absent.
  const refusalPort = await freePort();
  const refused = launchServer(refusalPort, {
    AKRAM_REMOTE_AUTH_USER: '',
    AKRAM_REMOTE_AUTH_PASSWORD: '',
  });
  const refusalCode = await waitForExit(refused);
  if (refusalCode === null) {
    await stop(refused);
    assert.fail('Remote server stayed alive without mandatory credentials.');
  }
  assert.equal(refusalCode, 1, 'Remote bind without credentials must exit with code 1.');

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = launchServer(port);
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });

  try {
    await waitForHttp(`${base}/api/health`, child);

    const deniedPage = await fetch(base + '/', { redirect: 'manual' });
    assert.equal(deniedPage.status, 401, 'Unauthenticated page navigation must be rejected.');

    const allowedPage = await fetch(base + '/', {
      headers: { Authorization: auth },
      redirect: 'manual',
    });
    assert.equal(allowedPage.status, 200, 'Valid Basic auth must allow the browser application page.');

    const deniedApi = await fetch(base + '/api/health', {
      headers: { 'Sec-Fetch-Site': 'same-origin' },
    });
    assert.equal(deniedApi.status, 401, 'Unauthenticated API requests must be rejected.');

    const allowedApi = await fetch(base + '/api/health', {
      headers: { Authorization: auth, 'Sec-Fetch-Site': 'same-origin' },
    });
    assert.equal(allowedApi.status, 200, 'Authenticated same-origin health API must work.');
    assert.deepEqual(await allowedApi.json().then((body) => body.status), 'ok');

    const wrongHost = await fetch(base + '/api/health', {
      headers: {
        Authorization: auth,
        'Sec-Fetch-Site': 'same-origin',
        Host: `untrusted.invalid:${port}`,
      },
    });
    assert.equal(wrongHost.status, 421, 'Authenticated requests with unapproved Host must be rejected.');

    // /api/reader is one of the expensive endpoints. It returns 400 for missing input,
    // but the 21st request must be stopped by the configured 20/minute limiter first.
    const readerStatuses = [];
    for (let i = 0; i < 21; i++) {
      const response = await fetch(base + '/api/reader', {
        headers: { Authorization: auth, 'Sec-Fetch-Site': 'same-origin' },
      });
      readerStatuses.push(response.status);
    }
    assert.deepEqual(readerStatuses.slice(0, 20), Array(20).fill(400));
    assert.equal(readerStatuses[20], 429, 'The 21st expensive API request must be rate limited.');
    console.log('PASS - remote server refuses missing credentials, authenticates page/API, enforces Host checks and rate limits');
  } catch (error) {
    console.error(output.slice(-8_000));
    throw error;
  } finally {
    await stop(child);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
