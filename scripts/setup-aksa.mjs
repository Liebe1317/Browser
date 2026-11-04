#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getAegisUserDataPath } = require('../electron/aksa-config.cjs');
const { installWireproxy } = require('../electron/aksa-installer.cjs');

try {
  const result = await installWireproxy({ userDataPath: getAegisUserDataPath() });
  process.stdout.write(`Installed Wireproxy ${result.version} for Aksa.\n`);
  process.stdout.write('Next: open Aegis Desktop → Settings → Privacy → choose your WireGuard .conf profile.\n');
} catch (error) {
  process.stderr.write(`Aksa installer: ${error instanceof Error ? error.message : 'installation failed'}\n`);
  process.exitCode = 1;
}
