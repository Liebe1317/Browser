import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export function ok(condition, message) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + message);
  if (!condition) process.exitCode = 1;
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

/** Self-signed certificate for the fake HTTPS upstream sites (needs the openssl CLI). */
export function makeCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-cert-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2', '-subj', '/CN=aegis.test'], { stdio: 'ignore' });
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}
