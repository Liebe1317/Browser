// Runs every test file and fails if any assertion fails.  Usage: npm test
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const dir = import.meta.dirname;
const root = path.resolve(dir, '..');

// The end-to-end test runs the server in production mode, which serves the built UI from dist/.
// On a fresh clone dist/ does not exist yet, so build it once instead of failing a header assertion.
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.log('dist/ not found - running "vite build" first (needed by the e2e test)');
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const b = spawnSync(npx, ['vite', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (b.status !== 0) {
    console.log('vite build failed - cannot run the e2e test');
    process.exit(1);
  }
}
const files = fs.readdirSync(dir).filter((f) => /\.test\.(ts|mjs)$/.test(f)).sort();
let failed = 0;
for (const f of files) {
  console.log(`\n=== ${f}`);
  const res = spawnSync(process.execPath, ['--import', 'tsx', path.join(dir, f)], { encoding: 'utf8', timeout: 180_000 });
  process.stdout.write(res.stdout || '');
  process.stderr.write(res.stderr || '');
  const lines = (res.stdout || '').split('\n');
  const fails = lines.filter((l) => l.startsWith('FAIL')).length;
  if (res.status !== 0 || fails > 0) {
    failed++;
    console.log(`>>> ${f} FAILED (exit ${res.status}, ${fails} failing assertions)`);
  }
}
console.log(failed ? `\n${failed} test file(s) failed` : '\nAll test files passed');
process.exit(failed ? 1 : 0);
