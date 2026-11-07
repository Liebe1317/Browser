'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The preload is injected into frames too. Never expose privileged APIs to website iframes.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('aegisDesktop', Object.freeze({
    vpn: Object.freeze({
      getStatus: () => ipcRenderer.invoke('aegis:vpn:get-status'),
      setEnabled: (enabled) => ipcRenderer.invoke('aegis:vpn:set-enabled', enabled === true),
      install: () => ipcRenderer.invoke('aegis:vpn:install'),
      chooseConfig: () => ipcRenderer.invoke('aegis:vpn:choose-config'),
    }),
    shield: Object.freeze({
      getState: () => ipcRenderer.invoke('akram:shield:get-state'),
      updateList: (sourceId) => ipcRenderer.invoke('akram:shield:update-list', sourceId),
    }),
    browser: Object.freeze({
      createSiteView: (options) => ipcRenderer.invoke('aegis:site:create', options),
      setSiteViewBounds: (tabId, bounds) => ipcRenderer.invoke('aegis:site:set-bounds', tabId, bounds),
      setSiteViewVisible: (tabId, visible) => ipcRenderer.invoke('aegis:site:set-visible', tabId, visible === true),
      navigateSiteView: (tabId, url) => ipcRenderer.invoke('aegis:site:navigate', tabId, url),
      goBackSiteView: (tabId) => ipcRenderer.invoke('aegis:site:back', tabId),
      goForwardSiteView: (tabId) => ipcRenderer.invoke('aegis:site:forward', tabId),
      reloadSiteView: (tabId) => ipcRenderer.invoke('aegis:site:reload', tabId),
      setSiteViewZoom: (tabId, zoomLevel) => ipcRenderer.invoke('aegis:site:set-zoom', tabId, zoomLevel),
      closeSiteView: (tabId) => ipcRenderer.invoke('aegis:site:close', tabId),
      onSiteViewEvent: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const listener = (_event, payload) => {
          if (payload && typeof payload.tabId === 'string' && typeof payload.type === 'string') callback(payload);
        };
        ipcRenderer.on('aegis:site:event', listener);
        return () => ipcRenderer.removeListener('aegis:site:event', listener);
      },
    }),
  }));
}
