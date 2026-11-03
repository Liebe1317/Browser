// Runs every test file and fails if any assertion fails.  Usage: npm test
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const dir = import.meta.dirname;
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
