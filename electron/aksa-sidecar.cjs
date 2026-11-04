'use strict';

const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');
const {
  INFO_ADDRESS,
  HEALTH_INTERVAL_SECONDS,
  getAksaPaths,
  buildWireproxyConfig,
  isConnectedHealthPayload,
} = require('./aksa-config.cjs');
const { installWireproxy } = require('./aksa-installer.cjs');

function probeReadyz(url = `http://${INFO_ADDRESS}/readyz`, timeoutMs = 1800) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const request = http.get(url, { timeout: timeoutMs, headers: { Accept: 'application/json' } }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        return finish(false);
      }
      const chunks = [];
      let total = 0;
      response.on('data', (chunk) => {
        total += chunk.length;
        if (total > 4096) {
          response.destroy();
          return finish(false);
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          finish(isConnectedHealthPayload(body));
        } catch {
          finish(false);
        }
      });
      response.on('error', () => finish(false));
    });
    request.on('timeout', () => request.destroy(new Error('Aksa readiness probe timed out')));
    request.on('error', () => finish(false));
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class AksaSidecar {
  constructor(userDataPath, options = {}) {
    this.paths = getAksaPaths(userDataPath, options.platform || process.platform);
    this.platform = options.platform || process.platform;
    this.arch = options.arch || process.arch;
    this.spawnProcess = options.spawnProcess || spawn;
    this.probe = options.probe || probeReadyz;
    this.installBinary = options.installBinary || installWireproxy;
    this.child = null;
    this.starting = null;
    this.stopping = false;
    this.lastError = '';
    this.onExit = options.onExit || (() => {});
  }

  getStatus() {
    const installed = fs.existsSync(this.paths.executable);
    const profileConfigured = fs.existsSync(this.paths.generatedConfig);
    const running = !!this.child && this.child.exitCode === null && !this.child.killed;
    return {
      installed,
      profileConfigured,
      running,
      connected: false,
      version: installed ? 'v1.1.3' : null,
    };
  }

  async install() {
    return this.installBinary({
      userDataPath: this.paths.root.replace(/[/\\]aksa$/, ''),
      platform: this.platform,
      arch: this.arch,
    });
  }

  configureProfile(sourcePath) {
    const stat = fs.statSync(sourcePath);
    if (!stat.isFile() || stat.size > 64 * 1024) throw new Error('ملف WireGuard يجب أن يكون ملفاً عادياً وأقل من 64KB.');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const generated = buildWireproxyConfig(source);
    fs.mkdirSync(this.paths.root, { recursive: true, mode: 0o700 });
    const tempPath = `${this.paths.generatedConfig}.new`;
    try {
      fs.writeFileSync(tempPath, generated, { encoding: 'utf8', mode: 0o600, flag: 'w' });
      if (this.platform !== 'win32') fs.chmodSync(tempPath, 0o600);
      fs.renameSync(tempPath, this.paths.generatedConfig);
      if (this.platform !== 'win32') fs.chmodSync(this.paths.generatedConfig, 0o600);
    } finally {
      try { fs.unlinkSync(tempPath); } catch {}
    }
    return { configured: true };
  }

  async checkHealth() {
    return this.probe();
  }

  async waitUntilHealthy(timeoutMs = 30_000) {
    const endAt = Date.now() + timeoutMs;
    while (Date.now() < endAt) {
      if (!this.child || this.child.exitCode !== null) return false;
      if (await this.checkHealth()) return true;
      await delay(500);
    }
    return false;
  }

  async start() {
    if (this.starting) return this.starting;
    this.starting = this.startInternal();
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async startInternal() {
    if (!fs.existsSync(this.paths.executable)) {
      return { ok: false, error: 'لم يتم تثبيت محرك Wireproxy بعد. استخدم زر تثبيت محرك Aksa أولاً.' };
    }
    if (!fs.existsSync(this.paths.generatedConfig)) {
      return { ok: false, error: 'لم يتم اختيار ملف WireGuard. اختر ملف .conf من مزود VPN أولاً.' };
    }

    if (this.child && this.child.exitCode === null) {
      if (await this.checkHealth()) return { ok: true };
      await this.stop();
    }

    this.lastError = '';
    this.stopping = false;
    let child;
    try {
      child = this.spawnProcess(
        this.paths.executable,
        ['-c', this.paths.generatedConfig, '-i', INFO_ADDRESS, '-s'],
        {
          stdio: 'ignore',
          windowsHide: true,
          detached: false,
          shell: false,
        }
      );
    } catch {
      return { ok: false, error: 'تعذر تشغيل محرك Wireproxy المحلي.' };
    }

    this.child = child;
    child.once('error', () => {
      this.lastError = 'تعذر تشغيل محرك Wireproxy المحلي.';
      if (this.child === child) this.child = null;
      if (!this.stopping) this.onExit();
    });
    child.once('exit', () => {
      if (this.child === child) this.child = null;
      if (!this.stopping) {
        this.lastError = 'توقف محرك Wireproxy قبل اكتمال الاتصال.';
        this.onExit();
      }
    });

    const healthy = await this.waitUntilHealthy();
    if (!healthy) {
      await this.stop();
      return {
        ok: false,
        error: this.lastError || 'لم يؤكد WireGuard وصول ping عبر النفق خلال 30 ثانية. تحقق من ملف المزود والشبكة.',
      };
    }
    return { ok: true };
  }

  async stop() {
    const child = this.child;
    if (!child) return;
    this.stopping = true;
    if (child.exitCode !== null) {
      if (this.child === child) this.child = null;
      this.stopping = false;
      return;
    }
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
        resolve();
      }, 2500);
      timer.unref?.();
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      try { child.kill('SIGTERM'); } catch { resolve(); }
    });
    if (this.child === child) this.child = null;
    this.stopping = false;
  }
}

module.exports = { AksaSidecar, probeReadyz, delay };
