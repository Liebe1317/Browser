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
          scope: 'electron-session';
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
            scope: 'electron-session';
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
            scope: 'electron-session';
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
            scope: 'electron-session';
          };
          error?: string;
        }>;
      };
    };
  }
}
