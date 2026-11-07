'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const {
  getReleaseAsset,
  getAksaPaths,
  WIREPROXY_VERSION,
} = require('./aksa-config.cjs');

const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;
const MAX_TAR_BYTES = 32 * 1024 * 1024;
const MAX_BINARY_BYTES = 16 * 1024 * 1024;

function parseTarOctal(field) {
  const text = field.toString('ascii').replace(/\0.*$/, '').trim();
  if (!text) return 0;
  if (!/^[0-7]+$/.test(text)) throw new Error('Invalid tar archive size field');
  return Number.parseInt(text, 8);
}

function safeTarName(name) {
  const normalized = name.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return false;
  return !normalized.split('/').some((part) => part === '..');
}

function extractExecutableFromTarGz(archive, executableName) {
  if (!Buffer.isBuffer(archive) || archive.length > MAX_ARCHIVE_BYTES) {
    throw new Error('Wireproxy archive exceeds the download limit');
  }
  const tar = zlib.gunzipSync(archive, { maxOutputLength: MAX_TAR_BYTES });
  let offset = 0;
  let found = null;
  let entries = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    entries += 1;
    if (entries > 4096) throw new Error('Wireproxy archive contains too many entries');

    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const fullName = prefix ? `${prefix}/${name}` : name;
    if (!safeTarName(fullName)) throw new Error('Wireproxy archive contains an unsafe file path');

    const size = parseTarOctal(header.subarray(124, 136));
    const type = String.fromCharCode(header[156] || 0);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) throw new Error('Wireproxy archive is truncated');

    const isRegularFile = type === '\0' || type === '0' || type === '';
    if (isRegularFile && path.posix.basename(fullName) === executableName) {
      if (found) throw new Error('Wireproxy archive contains multiple executable candidates');
      if (size < 100 * 1024 || size > MAX_BINARY_BYTES) throw new Error('Unexpected Wireproxy executable size');
      found = Buffer.from(tar.subarray(dataStart, dataEnd));
    }

    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  if (!found) throw new Error('The pinned Wireproxy executable was not found in its release archive');
  return found;
}

async function downloadReleaseAsset(asset, fetchImpl = globalThis.fetch) {
  const url = `https://github.com/windtf/wireproxy/releases/download/${WIREPROXY_VERSION}/${asset.file}`;
  const response = await fetchImpl(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(45_000),
    headers: { Accept: 'application/octet-stream' },
  });
  if (!response.ok) throw new Error(`Wireproxy download failed (HTTP ${response.status})`);

  const finalUrl = new URL(response.url || url);
  if (finalUrl.protocol !== 'https:' ||
      !['github.com', 'release-assets.githubusercontent.com'].includes(finalUrl.hostname)) {
    throw new Error('Wireproxy download redirected to an untrusted host');
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ARCHIVE_BYTES) {
    throw new Error('Wireproxy release archive is too large');
  }
  const chunks = [];
  let total = 0;
  if (!response.body) throw new Error('Wireproxy release response has no body');
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_ARCHIVE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error('Wireproxy release archive exceeded the download limit');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  const archive = Buffer.concat(chunks, total);
  const digest = crypto.createHash('sha256').update(archive).digest('hex');
  if (digest !== asset.sha256) throw new Error('Wireproxy SHA-256 verification failed');
  return archive;
}

function verifyExecutable(executablePath, platform = process.platform) {
  const args = ['--version'];
  const result = spawnSync(executablePath, args, {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
    shell: false,
  });
  if (result.error || result.status !== 0) throw new Error('The downloaded Wireproxy executable did not start');
  const versionText = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (!/wireproxy, version/i.test(versionText) || !versionText.includes(WIREPROXY_VERSION)) {
    throw new Error('The downloaded Wireproxy executable has an unexpected version');
  }
  return versionText;
}

async function installWireproxy({
  userDataPath,
  platform = process.platform,
  arch = process.arch,
  fetchImpl = globalThis.fetch,
} = {}) {
  const asset = getReleaseAsset(platform, arch);
  if (!asset) throw new Error(`Akram VPN does not yet ship a Wireproxy binary for ${platform}/${arch}`);

  const paths = getAksaPaths(userDataPath, platform);
  fs.mkdirSync(paths.binDir, { recursive: true, mode: 0o700 });

  const archive = await downloadReleaseAsset(asset, fetchImpl);
  const binary = extractExecutableFromTarGz(archive, asset.executable);
  const tempPath = `${paths.executable}.new`;
  try {
    fs.writeFileSync(tempPath, binary, { mode: 0o700 });
    if (platform !== 'win32') fs.chmodSync(tempPath, 0o700);
    verifyExecutable(tempPath, platform);
    fs.renameSync(tempPath, paths.executable);
    if (platform !== 'win32') fs.chmodSync(paths.executable, 0o700);
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
  return { installed: true, version: WIREPROXY_VERSION, executable: paths.executable };
}

module.exports = {
  MAX_ARCHIVE_BYTES,
  MAX_TAR_BYTES,
  getReleaseAsset,
  safeTarName,
  extractExecutableFromTarGz,
  downloadReleaseAsset,
  verifyExecutable,
  installWireproxy,
};
