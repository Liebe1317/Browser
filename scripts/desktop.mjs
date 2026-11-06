import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

const HOST = '127.0.0.1';
const PORT = 3000;
const APP_URL = `http://${HOST}:${PORT}`;
const isWindows = process.platform === 'win32';
const children = new Set();
let shuttingDown = false;

function spawnManaged(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(PORT), ELECTRON_START_URL: APP_URL },
    shell: isWindows,
    detached: !isWindows,
    ...options,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

function stopTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  if (isWindows) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) stopTree(child);
}

function assertPortAvailable() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`Port ${PORT} is already in use. Close the other local server and run npm run desktop again.`));
      } else {
        reject(error);
      }
    });
    probe.listen(PORT, HOST, () => probe.close(resolve));
  });
}

async function waitForServer(serverProcess) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
      throw new Error('The Aegis local web server stopped before becoming ready.');
    }
    try {
      const response = await fetch(APP_URL, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Timed out waiting for the Aegis local web server.');
}

async function main() {
  await assertPortAvailable();
  console.log('[Aegis] Starting the local browser service...');
  const server = spawnManaged(isWindows ? 'npm.cmd' : 'npm', ['run', 'dev']);
  await waitForServer(server);

  console.log('[Aegis] Local service is ready. Launching Chromium desktop...');
  const electron = spawnManaged(isWindows ? 'npx.cmd' : 'npx', ['--yes', 'electron@45.2.2', '.']);
  const exitCode = await new Promise((resolve, reject) => {
    electron.once('error', reject);
    electron.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  shutdown();
  process.exitCode = exitCode;
}

process.on('SIGINT', () => { shutdown(); process.exit(130); });
process.on('SIGTERM', () => { shutdown(); process.exit(143); });
process.on('exit', shutdown);

main().catch((error) => {
  console.error(`[Aegis] ${error instanceof Error ? error.message : 'Desktop startup failed.'}`);
  shutdown();
  process.exitCode = 1;
});
