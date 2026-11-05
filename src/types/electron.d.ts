export {};

declare global {
  interface Window {
    aegisDesktop?: {
      vpn: {
        getStatus(): Promise<{
          configured: boolean;
          installed: boolean;
          profileConfigured: boolean;
          running: boolean;
          enabled: boolean;
          connected: boolean;
          gateway: string;
          version: string | null;
          scope: 'registered-electron-sessions';
        }>;
        install(): Promise<{
          ok: boolean;
          version?: string;
          status?: {
            configured: boolean;
            installed: boolean;
            profileConfigured: boolean;
            running: boolean;
            enabled: boolean;
            connected: boolean;
            gateway: string;
            version: string | null;
            scope: 'registered-electron-sessions';
          };
          error?: string;
        }>;
        chooseConfig(): Promise<{
          ok: boolean;
          cancelled?: boolean;
          status?: {
            configured: boolean;
            installed: boolean;
            profileConfigured: boolean;
            running: boolean;
            enabled: boolean;
            connected: boolean;
            gateway: string;
            version: string | null;
            scope: 'registered-electron-sessions';
          };
          error?: string;
        }>;
        setEnabled(enabled: boolean): Promise<{
          ok: boolean;
          status: {
            configured: boolean;
            installed: boolean;
            profileConfigured: boolean;
            running: boolean;
            enabled: boolean;
            connected: boolean;
            gateway: string;
            version: string | null;
            scope: 'registered-electron-sessions';
          };
          error?: string;
        }>;
      };
      browser: {
        createSiteView(options: { tabId: string; profileKind: 'regular' | 'private'; profileId: string; url: string }): Promise<{ ok: boolean; tabId?: string; existing?: boolean; error?: string }>;
        setSiteViewBounds(tabId: string, bounds: { x: number; y: number; width: number; height: number }): Promise<boolean>;
        setSiteViewVisible(tabId: string, visible: boolean): Promise<boolean>;
        navigateSiteView(tabId: string, url: string): Promise<{ ok: boolean; error?: string }>;
        goBackSiteView(tabId: string): Promise<boolean>;
        goForwardSiteView(tabId: string): Promise<boolean>;
        reloadSiteView(tabId: string): Promise<boolean>;
        setSiteViewZoom(tabId: string, zoomLevel: number): Promise<boolean>;
        closeSiteView(tabId: string): Promise<boolean>;
        onSiteViewEvent(callback: (event: {
          tabId: string;
          type: 'loading' | 'title' | 'navigation' | 'error' | 'process-gone';
          isLoading?: boolean;
          title?: string;
          url?: string;
          canGoBack?: boolean;
          canGoForward?: boolean;
          code?: number;
          reason?: string;
        }) => void): () => void;
      };
    };
  }
}