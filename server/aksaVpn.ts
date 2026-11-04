import { Agent, ProxyAgent, setGlobalDispatcher, type Dispatcher } from 'undici';

export interface AksaVpnStatus {
  configured: boolean;
  enabled: boolean;
  gateway: 'configured-local' | 'not-configured';
  /** Current adapter covers server-side browser requests only, not direct renderer connections. */
  scope: 'server-proxy-only';
}

function normalizeLocalGateway(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
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

/**
 * Aksa routes Aegis' outbound browser traffic through a loopback HTTP CONNECT gateway.
 * That local gateway must itself be backed by the user's trusted VPN/WireGuard service and
 * enforce public-destination restrictions. It is deliberately not an arbitrary remote proxy.
 * 'configured' validates only the local endpoint syntax; 'enabled' switches the request dispatcher.
 * Neither state proves that the VPN tunnel is connected. The renderer may still make direct requests
 * (for example external media/iframes), so this adapter is not a device-wide or full-renderer VPN.
 */
export function createAksaVpnController(
  proxyUrl: string | undefined,
  setDispatcher: (dispatcher: Dispatcher) => void = setGlobalDispatcher,
  createProxy: (uri: string) => Dispatcher = (uri) => new ProxyAgent({ uri })
) {
  const gateway = normalizeLocalGateway(proxyUrl);
  const directDispatcher = new Agent();
  let proxyDispatcher: Dispatcher | null = null;
  let enabled = false;

  return {
    status(): AksaVpnStatus {
      return {
        configured: !!gateway,
        enabled,
        gateway: gateway ? 'configured-local' : 'not-configured',
        scope: 'server-proxy-only',
      };
    },
    setEnabled(next: boolean): { ok: boolean; status: AksaVpnStatus; error?: string } {
      if (next && !gateway) {
        return {
          ok: false,
          status: this.status(),
          error: 'بوابة Aksa المحلية غير مهيأة. شغّل خدمة VPN محلية ثم اضبط AKSA_VPN_PROXY.',
        };
      }
      if (next) {
        // No direct-network fallback is permitted after the user enables Aksa.
        proxyDispatcher ??= createProxy(gateway!);
        setDispatcher(proxyDispatcher);
        enabled = true;
      } else {
        setDispatcher(directDispatcher);
        enabled = false;
      }
      return { ok: true, status: this.status() };
    },
    dispatcher(): Dispatcher | undefined {
      if (!enabled) return undefined;
      if (!proxyDispatcher) throw new Error('Aksa is enabled but its gateway is unavailable.');
      return proxyDispatcher;
    },
  };
}

const aksa = createAksaVpnController(process.env.AKSA_VPN_PROXY);
export const getAksaVpnStatus = () => aksa.status();
export const setAksaVpnEnabled = (enabled: boolean) => aksa.setEnabled(enabled);
export const getAksaDispatcher = () => aksa.dispatcher();
