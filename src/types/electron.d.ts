export {};

declare global {
  interface Window {
    aegisDesktop?: {
      vpn: {
        getStatus(): Promise<{
          configured: boolean;
          enabled: boolean;
          connected: boolean;
          gateway: string;
          scope: 'electron-session';
        }>;
        setEnabled(enabled: boolean): Promise<{
          ok: boolean;
          status: {
            configured: boolean;
            enabled: boolean;
            connected: boolean;
            gateway: string;
            scope: 'electron-session';
          };
          error?: string;
        }>;
      };
    };
  }
}
