'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The preload is injected into frames too. Never expose privileged APIs to website iframes.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('aegisDesktop', Object.freeze({
    vpn: Object.freeze({
      getStatus: () => ipcRenderer.invoke('aegis:vpn:get-status'),
      setEnabled: (enabled) => ipcRenderer.invoke('aegis:vpn:set-enabled', enabled === true),
    }),
  }));
}
