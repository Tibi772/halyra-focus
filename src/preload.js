'use strict';
// The only bridge between the UI and the system. The UI can call these
// functions and nothing else (contextIsolation + sandbox).
const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (arg) => ipcRenderer.invoke(ch, arg);
const on = (ch) => (cb) => {
  const fn = (_e, data) => cb(data);
  ipcRenderer.on(ch, fn);
  return () => ipcRenderer.removeListener(ch, fn);
};

contextBridge.exposeInMainWorld('api', {
  getState: call('state:get'),
  getPresets: call('presets:get'),
  setConfig: (patch, pin) => ipcRenderer.invoke('config:set', { patch, pin }),
  startSession: call('session:start'),
  extendSession: call('session:extend'),
  normalizeSites: (sites) => ipcRenderer.invoke('sites:normalize', { sites }),
  unlockRequest: call('unlock:request'),
  unlockEmergency: call('unlock:emergency'),
  unlockConfirm: call('unlock:confirm'),
  unlockCancel: call('unlock:cancel'),
  setPin: call('pin:set'),
  installedApps: call('apps:installed'),
  browseApps: call('apps:browse'),
  installHelper: call('helper:install'),
  uninstallHelper: call('helper:uninstall'),
  exportConfig: call('config:export'),
  importConfig: call('config:import'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', { url }),
  quit: call('app:quit'),
  onState: on('state'),
  onToast: on('toast'),
  onNavigate: on('navigate'),
  onOpenUnlock: on('open-unlock'),
  onOverlay: on('overlay'),
});
