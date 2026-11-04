import http from 'node:http';
import { Agent, ProxyAgent, setGlobalDispatcher, type Dispatcher } from 'undici';

export interface AksaVpnStatus {
  configured: boolean;
  enabled: boolean;
  connected: boolean;
  gateway: 'configured-local' | 'not-configured';
  scope: 'server-egress-only';
}

function normalizeLocalGateway(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
    if (
      url.protocol !== 'http:' ||
      !localHosts.has(url.hostname.toLowerCase()) ||
      !url.port ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) return null;
    const port = Number(url.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeLocalHealthUrl(value: string | undefined): string | null {
  const candidate = value || 'http://127.0.0.1:19091/readyz';
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname.toLowerCase()) ||
      !url.port ||
      Number(url.port) < 1024 ||
      Number(url.port) > 65535 ||
      url.pathname !== '/readyz' ||
      url.username || url.password || url.search || url.hash
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Direct loopback Wireproxy readiness probe (Node http, not global fetch, to avoid proxy recursion). */
function probeGateway(_gateway: string, healthUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const request = http.get(new URL(healthUrl), { timeout: 1800, headers: { Accept: 'application/json' } }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        return finish(false);
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 4096) {
          response.destroy();
          finish(false);
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (body?.status === 'ok' && body?.tunnel === 'connected') return finish(true);
          const stamps: unknown[] = body && typeof body === 'object' && !Array.isArray(body)
            ? Object.values(body as Record<string, unknown>)
            : [];
          const nowSeconds = Math.floor(Date.now() / 1000);
          finish(stamps.length > 0 && stamps.every((stamp): stamp is number =>
            typeof stamp === 'number' &&
            Number.isInteger(stamp) &&
            stamp > 0 &&
            stamp <= nowSeconds + 2 &&
            nowSeconds - stamp <= 9
          ));
        } catch {
          finish(false);
        }
      });
      response.on('error', () => finish(false));
    });
    request.on('timeout', () => request.destroy(new Error('Aksa health probe timeout')));
    request.on('error', () => finish(false));
  });
}

/**
 * Aksa routes Aegis server-originated outbound traffic through a local HTTP CONNECT gateway.
 * The gateway MUST expose GET /health -> { status: "ok", tunnel: "connected" } and only report
 * connected after the WireGuard tunnel is actually handshaken and public-destination policy is live.
 * This controller refuses to enable on mere port-open/configured state and never falls back directly.
 */
export function createAksaVpnController(
  proxyUrl: string | undefined,
  setDispatcher: (dispatcher: Dispatcher) => void = setGlobalDispatcher,
  createProxy: (uri: string) => Dispatcher = (uri) => new ProxyAgent({ uri }),
  healthCheck: (gateway: string, healthUrl: string) => Promise<boolean> = probeGateway,
  healthUrlInput: string | undefined = process.env.AKSA_VPN_HEALTH_URL
) {
  const gateway = normalizeLocalGateway(proxyUrl);
  const healthUrl = normalizeLocalHealthUrl(healthUrlInput);
  const directDispatcher = new Agent();
  let proxyDispatcher: Dispatcher | null = null;
  let enabled = false;
  let connected = false;
  let monitor: NodeJS.Timeout | null = null;
  let checking = false;

  const refreshHealth = async (): Promise<boolean> => {
    if (!enabled || !gateway || !healthUrl || checking) return connected;
    checking = true;
    try {
      connected = await healthCheck(gateway, healthUrl);
    } catch {
      connected = false;
    } finally {
      checking = false;
    }
    return connected;
  };

  const startMonitor = () => {
    if (monitor) clearInterval(monitor);
    monitor = setInterval(() => { void refreshHealth(); }, 5000);
    monitor.unref();
  };

  const stopMonitor = () => {
    if (monitor) clearInterval(monitor);
    monitor = null;
  };

  const status = (): AksaVpnStatus => ({
    configured: !!gateway,
    enabled,
    connected: enabled && connected,
    gateway: gateway ? 'configured-local' : 'not-configured',
    scope: 'server-egress-only',
  });

  return {
    status,
    async setEnabled(next: boolean): Promise<{ ok: boolean; status: AksaVpnStatus; error?: string }> {
      if (!next) {
        stopMonitor();
        setDispatcher(directDispatcher);
        enabled = false;
        connected = false;
        return { ok: true, status: status() };
      }
      if (!gateway || !healthUrl) {
        return {
          ok: false,
          status: status(),
          error: 'بوابة Aksa المحلية غير مهيأة. اضبط AKSA_VPN_PROXY بعد تشغيل خدمة VPN المحلية.',
        };
      }
      let healthy = false;
      try {
        healthy = await healthCheck(gateway, healthUrl);
      } catch {
        healthy = false;
      }
      if (!healthy) {
        connected = false;
        return {
          ok: false,
          status: status(),
          error: 'بوابة Aksa لا تؤكد أن نفق WireGuard متصل. لم يتم تفعيل الاتصال حتى لا يحدث تسريب مباشر.',
        };
      }
      try {
        proxyDispatcher ??= createProxy(gateway);
        setDispatcher(proxyDispatcher);
        enabled = true;
        connected = true;
        startMonitor();
        return { ok: true, status: status() };
      } catch {
        stopMonitor();
        enabled = false;
        connected = false;
        setDispatcher(directDispatcher);
        return {
          ok: false,
          status: status(),
          error: 'تعذر تهيئة نفق Aksa. بقي الاتصال عبر الوكيل غير مفعّل.',
        };
      }
    },
    async checkNow(): Promise<boolean> {
      return refreshHealth();
    },
    dispatcher(): Dispatcher | undefined {
      if (!enabled) return undefined;
      if (!proxyDispatcher || !connected) throw new Error('Aksa tunnel is not healthy; refusing direct network fallback.');
      return proxyDispatcher;
    },
  };
}

// The browser's local Wireproxy sidecar owns these fixed loopback ports. The server only
// accepts the local proxy + /readyz contract, and refuses to enable until the tunnel heartbeat is fresh.
const aksa = createAksaVpnController(
  process.env.AKSA_VPN_PROXY || 'http://127.0.0.1:19090',
  setGlobalDispatcher,
  (uri) => new ProxyAgent({ uri }),
  probeGateway,
  process.env.AKSA_VPN_HEALTH_URL || 'http://127.0.0.1:19091/readyz'
);
export const getAksaVpnStatus = () => aksa.status();
export const setAksaVpnEnabled = (enabled: boolean) => aksa.setEnabled(enabled);
export const getAksaDispatcher = () => aksa.dispatcher();
