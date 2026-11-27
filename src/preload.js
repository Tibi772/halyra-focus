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
  normalizeRules: (items) => ipcRenderer.invoke('rules:normalize', { items }),
  chat: (text) => ipcRenderer.invoke('ai:chat', { text }),
  spendEarned: (listId, minutes) => ipcRenderer.invoke('earn:spend', { listId, minutes }),
  coolDown: (start) => ipcRenderer.invoke('cooldown:set', { start: Boolean(start) }),
  lbBoard: (scope, groupId) => ipcRenderer.invoke('lb:board', { scope, groupId }),
  lbCreate: (name) => ipcRenderer.invoke('lb:create', { name }),
  lbJoin: (code) => ipcRenderer.invoke('lb:join', { code }),
  lbLeave: (groupId) => ipcRenderer.invoke('lb:leave', { groupId }),
  lbOff: () => ipcRenderer.invoke('lb:off'),
  chatGet: () => ipcRenderer.invoke('ai:chatGet'),
  chatReset: () => ipcRenderer.invoke('ai:chatReset'),
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
  generateStyle: call('style:generate'),
  previewStyle: call('style:preview'),
  saveStyle: call('style:save'),
  deleteStyle: call('style:delete'),
  setAiKey: call('ai:setKey'),
  removeAiKey: call('ai:removeKey'),
  coachSuggest: call('coach:suggest'),
  coachLine: call('coach:line'),
  applyInsight: call('insight:apply'),
  cloudSignUp: call('cloud:signUp'),
  cloudSignIn: call('cloud:signIn'),
  cloudReset: call('cloud:reset'),
  cloudSignOut: call('cloud:signOut'),
  cloudSyncNow: call('cloud:syncNow'),
  quit: call('app:quit'),
  platformCall: (name, arg) => ipcRenderer.invoke('platform:call', { name, arg }),
  onState: on('state'),
  onToast: on('toast'),
  onNavigate: on('navigate'),
  onOpenUnlock: on('open-unlock'),
  onOverlay: on('overlay'),
  onNotices: on('notices'),
});
