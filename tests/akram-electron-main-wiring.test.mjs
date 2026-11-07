'use strict';

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const sessionPolicy = await readFile(new URL('../electron/session-policy.cjs', import.meta.url), 'utf8');

assert.match(main, /createAkramElectronShieldRuntime/);
assert.match(main, /const shieldManager = getShieldManager\(\)/);
assert.match(main, /manager:\s*shieldManager/);
assert.match(main, /vpnStatus:\s*\(\)\s*=>\s*\(\{\s*enabled:\s*aksaEnabled,\s*connected:\s*aksaEnabled\s*&&\s*aksaConnected/s);
assert.match(main, /ipcMain\.handle\('akram:shield:get-state'/);
assert.match(main, /ipcMain\.handle\('akram:shield:update-list'/);
assert.match(main, /if\s*\(!isTrustedUi\(event\)/);
assert.match(main, /akramShieldRuntime\.abortAll\(/);
assert.match(main, /akramShieldRuntime\.close\(\)/);
assert.match(preload, /shield:\s*Object\.freeze/);
assert.match(preload, /getState:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('akram:shield:get-state'\)/);
assert.match(preload, /updateList:\s*\(sourceId\)\s*=>\s*ipcRenderer\.invoke\('akram:shield:update-list',\s*sourceId\)/);
assert.match(sessionPolicy, /getShieldManager:\s*\(\)\s*=>\s*akramShieldsAdapter\.manager/);

console.log('PASS - Electron Main and preload expose only trusted Akram Shield updater controls');
