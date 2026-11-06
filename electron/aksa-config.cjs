'use strict';

const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const WIREPROXY_VERSION = 'v1.1.3';
const HTTP_PROXY_ADDRESS = '127.0.0.1:19090';
const INFO_ADDRESS = '127.0.0.1:19091';
const HEALTH_INTERVAL_SECONDS = 4;
const HEALTH_MAX_AGE_SECONDS = 9;

const RELEASE_ASSETS = Object.freeze({
  'win32-x64': {
    file: 'wireproxy_windows_amd64.tar.gz',
    sha256: 'bce041ea9fe0f8a3351301dcbe29cdf6a523bb25cf9c62f17ebb5699a8051d0f',
    executable: 'wireproxy.exe',
  },
  'darwin-x64': {
    file: 'wireproxy_darwin_amd64.tar.gz',
    sha256: '5d89742a0f381d9508d3ad828a0d300dceee24fa49015427eaff42a23f7a50bd',
    executable: 'wireproxy',
  },
  'darwin-arm64': {
    file: 'wireproxy_darwin_arm64.tar.gz',
    sha256: '28d34342c48c309b628d9c3c1439715bbaa94a0a110a204605c02139c02547a5',
    executable: 'wireproxy',
  },
  'linux-x64': {
    file: 'wireproxy_linux_amd64.tar.gz',
    sha256: 'e88c1d090740373fc606c1bafd81d9a5eadc642cce5667616e20e9d7a444f51c',
    executable: 'wireproxy',
  },
  'linux-arm64': {
    file: 'wireproxy_linux_arm64.tar.gz',
    sha256: '370e00bd2167960d1ecd1c3c1439715bbaa94a0a110a2040468670c9af6021b6',
    executable: 'wireproxy',
  },
});


function parseAksaLocalProxy(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }

  // Wireproxy binds only to this exact loopback endpoint.
  // Never permit a remote proxy, alternate port, credentials or URL parameters.
  if (
    parsed.protocol !== 'http:'
    || parsed.hostname !== '127.0.0.1'
    || parsed.port !== '19090'
    || parsed.username
    || parsed.password
    || (parsed.pathname !== '/' && parsed.pathname !== '')
    || parsed.search
    || parsed.hash
  ) return null;

  return Object.freeze({
    proxyRules: `http=${HTTP_PROXY_ADDRESS};https=${HTTP_PROXY_ADDRESS}`,
    proxyBypassRules: 'localhost;127.0.0.1;[::1]',
  });
}

function getReleaseAsset(platform = process.platform, arch = process.arch) {
  const asset = RELEASE_ASSETS[`${platform}-${arch}`];
  return asset ? { ...asset, version: WIREPROXY_VERSION } : null;
}

function getAegisUserDataPath(platform = process.platform, env = process.env, home = os.homedir()) {
  if (env.AEGIS_AKSA_HOME) return path.resolve(env.AEGIS_AKSA_HOME);
  if (platform === 'win32') {
    const root = env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(root, 'AegisBrowser');
  }
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'AegisBrowser');
  const root = env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(root, 'aegis-browser');
}

function getAksaPaths(userDataPath, platform = process.platform) {
  const root = path.join(userDataPath, 'aksa');
  return Object.freeze({
    root,
    binDir: path.join(root, 'bin'),
    executable: path.join(root, 'bin', platform === 'win32' ? 'wireproxy.exe' : 'wireproxy'),
    profile: path.join(root, 'wireguard.conf'),
    generatedConfig: path.join(root, 'wireproxy.conf'),
    archive: path.join(root, 'wireproxy-download.tar.gz'),
  });
}

function removeInlineComment(line) {
  const hash = line.indexOf('#');
  const semicolon = line.indexOf(';');
  const positions = [hash, semicolon].filter((n) => n >= 0);
  const end = positions.length ? Math.min(...positions) : line.length;
  return line.slice(0, end).trim();
}

function splitHostPort(value) {
  const text = String(value || '').trim();
  const match = text.match(/^\[([0-9a-f:]+)\]:(\d{1,5})$/i) || text.match(/^([^:\s]+):(\d{1,5})$/);
  if (!match) return false;
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  return net.isIP(match[1]) !== 0;
}

function decodeWireGuardKey(value) {
  try {
    const normalized = String(value || '').trim();
    const decoded = Buffer.from(normalized, 'base64');
    return decoded.length === 32 && decoded.toString('base64') === normalized;
  } catch {
    return false;
  }
}

function parseSections(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('ملف WireGuard فارغ.');
  if (Buffer.byteLength(text, 'utf8') > 64 * 1024) throw new Error('حجم ملف WireGuard يجب ألا يتجاوز 64KB.');
  if (text.includes('\0')) throw new Error('ملف WireGuard يحتوي بيانات غير صالحة.');

  const sections = [];
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = removeInlineComment(rawLine);
    if (!line) continue;
    const section = line.match(/^\[([A-Za-z0-9]+)\]$/);
    if (section) {
      const name = section[1].toLowerCase();
      if (name !== 'interface' && name !== 'peer') throw new Error('الملف يحتوي قسماً غير مسموح: ' + name);
      if (name === 'interface' && sections.some((item) => item.name === 'interface')) {
        throw new Error('يجب أن يحتوي ملف WireGuard على قسم Interface واحد فقط.');
      }
      current = { name, entries: [], keys: new Map() };
      sections.push(current);
      continue;
    }
    if (!current) throw new Error('وجدت إعداداً خارج أقسام Interface/Peer.');
    const equals = line.indexOf('=');
    if (equals < 1) throw new Error('سطر إعداد WireGuard غير صالح.');
    const key = line.slice(0, equals).trim().toLowerCase();
    const value = line.slice(equals + 1).trim();
    if (!key || !value) throw new Error('هناك إعداد WireGuard بقيمة فارغة.');
    const allowed = current.name === 'interface'
      ? new Set(['privatekey', 'address', 'dns', 'mtu', 'listenport'])
      : new Set(['publickey', 'presharedkey', 'endpoint', 'allowedips', 'persistentkeepalive']);
    if (!allowed.has(key)) throw new Error('إعداد WireGuard غير مدعوم أو خطير في هذا الملف: ' + key);
    if (current.keys.has(key)) throw new Error('إعداد WireGuard مكرر: ' + key);
    current.keys.set(key, value);
    current.entries.push({ key, value });
  }

  const interfaces = sections.filter((section) => section.name === 'interface');
  const peers = sections.filter((section) => section.name === 'peer');
  if (interfaces.length !== 1 || peers.length < 1) throw new Error('الملف يجب أن يحتوي Interface واحداً وPeer واحداً على الأقل.');

  const iface = interfaces[0].keys;
  if (!decodeWireGuardKey(iface.get('privatekey'))) throw new Error('PrivateKey غير صالح أو ليس مفتاح WireGuard بطول 32 بايت.');
  if (!iface.has('address')) throw new Error('Address مطلوب في قسم Interface.');
  const addresses = iface.get('address').split(',').map((value) => value.trim());
  if (!addresses.every((value) => {
    const parts = value.split('/');
    return parts.length === 2 && net.isIP(parts[0]) > 0 && /^\d{1,3}$/.test(parts[1]) &&
      Number(parts[1]) <= (net.isIP(parts[0]) === 4 ? 32 : 128);
  })) throw new Error('Address يحتوي عنوان IP أو CIDR غير صالح.');
  if (!iface.has('dns')) throw new Error('DNS مطلوب. استخدم عنوان DNS الذي يوفره مزود WireGuard.');

  const dns = iface.get('dns').split(',').map((value) => value.trim());
  if (!dns.length || !dns.every((value) => net.isIP(value) > 0)) throw new Error('DNS يجب أن يحتوي عناوين IP فقط.');

  let ipv4Default = false;
  let ipv6Default = false;
  for (const peer of peers) {
    if (!decodeWireGuardKey(peer.keys.get('publickey'))) throw new Error('PublicKey في أحد Peer غير صالح.');
    if (!peer.keys.has('endpoint') || !splitHostPort(peer.keys.get('endpoint'))) {
      throw new Error('Endpoint في كل Peer يجب أن يكون عنوان IP:Port لتجنب تسريب DNS عند بدء النفق.');
    }
    if (!peer.keys.has('allowedips')) throw new Error('AllowedIPs مطلوب لكل Peer.');
    const ranges = peer.keys.get('allowedips').split(',').map((value) => value.trim());
    for (const range of ranges) {
      const [address, prefix] = range.split('/');
      const family = net.isIP(address);
      if (!family || !/^\d{1,3}$/.test(prefix || '')) throw new Error('AllowedIPs يحتوي CIDR غير صالح.');
      const bits = Number(prefix);
      if (bits > (family === 4 ? 32 : 128)) throw new Error('AllowedIPs يحتوي prefix خارج النطاق.');
      if (range === '0.0.0.0/0') ipv4Default = true;
      if (range === '::/0') ipv6Default = true;
    }
  }
  if (!ipv4Default || !ipv6Default) {
    throw new Error('لمنع تسريب IPv4/IPv6 يجب أن يحتوي AllowedIPs على 0.0.0.0/0 و ::/0.');
  }
  return sections;
}

function buildWireproxyConfig(wireGuardText) {
  parseSections(wireGuardText);
  const output = [];
  let inInterface = false;
  let healthInserted = false;
  for (const rawLine of wireGuardText.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim();
    const section = line.match(/^\[([A-Za-z0-9]+)\]$/);
    if (section && section[1].toLowerCase() === 'peer' && inInterface && !healthInserted) {
      output.push(`CheckAlive = 1.1.1.1, 9.9.9.9`);
      output.push(`CheckAliveInterval = ${HEALTH_INTERVAL_SECONDS}`);
      healthInserted = true;
    }
    if (section) inInterface = section[1].toLowerCase() === 'interface';
    if (inInterface && /^(?:CheckAlive|CheckAliveInterval)\s*=/i.test(line)) continue;
    output.push(rawLine);
  }
  if (!healthInserted) {
    output.push(`CheckAlive = 1.1.1.1, 9.9.9.9`);
    output.push(`CheckAliveInterval = ${HEALTH_INTERVAL_SECONDS}`);
  }
  output.push('', '[http]', `BindAddress = ${HTTP_PROXY_ADDRESS}`, '');
  return output.join('\n');
}

function parseWireproxyReadyPayload(value, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const stamps = Object.values(value);
  if (!stamps.length || !stamps.every((stamp) => Number.isInteger(stamp) && stamp > 0)) return false;
  return stamps.every((stamp) => stamp <= nowSeconds + 2 && nowSeconds - stamp <= HEALTH_MAX_AGE_SECONDS);
}

function isConnectedHealthPayload(value) {
  if (value && typeof value === 'object' && value.status === 'ok' && value.tunnel === 'connected') return true;
  return parseWireproxyReadyPayload(value);
}

module.exports = {
  WIREPROXY_VERSION,
  HTTP_PROXY_ADDRESS,
  INFO_ADDRESS,
  HEALTH_INTERVAL_SECONDS,
  HEALTH_MAX_AGE_SECONDS,
  RELEASE_ASSETS,
  getReleaseAsset,
  parseAksaLocalProxy,
  getAegisUserDataPath,
  getAksaPaths,
  parseSections,
  buildWireproxyConfig,
  parseWireproxyReadyPayload,
  isConnectedHealthPayload,
};
