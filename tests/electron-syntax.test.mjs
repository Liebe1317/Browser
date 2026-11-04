import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
for (const file of ['electron/main.cjs', 'electron/preload.cjs', 'electron/aksa-config.cjs']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `Electron file must parse: ${file}\n${result.stderr || ''}`);
}
console.log('PASS - Electron main/preload and Aksa config parse successfully');
