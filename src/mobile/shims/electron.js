'use strict';
// Electron, as far as the shared app code needs it, inside a phone WebView.
// main.js (the "brain") and preload.js run unchanged on top of this: ipcMain
// handlers are called directly, webContents.send() reaches the UI's listeners.
const { native, call } = require('./native');

const clone = (v) => (v === undefined ? undefined : (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v))));
const handlers = new Map();
const listeners = new Map();
let readyResolve;
const handlersReady = new Promise((r) => { readyResolve = r; });
const icons = new Map();

function dispatch(ch, data) {
  for (const fn of listeners.get(ch) || []) {
    try { fn({}, clone(data)); } catch (e) { console.error('listener', ch, e); }
  }
}

class WebContents {
  constructor(isMain) { this.isMain = isMain; }
  send(ch, data) { if (this.isMain) dispatch(ch, data); }
  on() {} once(ev, fn) { if (ev === 'did-finish-load') setTimeout(fn, 0); }
  setWindowOpenHandler() {} isLoading() { return false; }
  executeJavaScript(code) { return Promise.resolve((0, eval)(code)); }
  capturePage() { return Promise.resolve({ toPNG: () => new Uint8Array(0) }); }
}

let mainCreated = false;
class BrowserWindow {
  constructor() {
    this.isMain = !mainCreated;
    mainCreated = true;
    this.webContents = new WebContents(this.isMain);
  }
  loadFile() {} loadURL() {}
  once(ev, fn) { if (ev === 'ready-to-show') setTimeout(fn, 0); }
  on() {}
  show() {} showInactive() {} hide() {} focus() {} close() {}
  isVisible() { return this.isMain && (typeof document === 'undefined' || document.visibilityState !== 'hidden'); }
  isDestroyed() { return false; }
  setBackgroundColor(c) { if (this.isMain) call('setChrome', String(c)); }
  setTitleBarOverlay() {} setAlwaysOnTop() {} setIgnoreMouseEvents() {} setVisibleOnAllWorkspaces() {} setPosition() {}
}

const app = {
  isPackaged: true,
  isQuittingForReal: false,
  getPath: () => '/data',
  getLocale: () => (call('locale') || (typeof navigator !== 'undefined' && navigator.language) || 'en'),
  getVersion: () => call('appVersion') || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'),
  whenReady: () => Promise.resolve(),
  requestSingleInstanceLock: () => true,
  on() {},
  quit() { call('moveToBack'); },
  exit() { call('moveToBack'); },
  setAppUserModelId() {}, setAboutPanelOptions() {}, setLoginItemSettings() {},
  getLoginItemSettings: () => ({}),
  getFileIcon: async (p) => ({ toDataURL: () => icons.get(p) || '' }),
};

const ipcMain = {
  handle(ch, fn) { handlers.set(ch, fn); if (ch === 'app:quit') readyResolve(); },
};

const ipcRenderer = {
  async invoke(ch, arg) {
    if (!handlers.has(ch)) await handlersReady;
    const fn = handlers.get(ch);
    if (!fn) throw new Error(`No handler for ${ch}`);
    return clone(await fn({ sender: {} }, clone(arg)));
  },
  on(ch, fn) { if (!listeners.has(ch)) listeners.set(ch, []); listeners.get(ch).push(fn); },
  removeListener(ch, fn) { listeners.set(ch, (listeners.get(ch) || []).filter((x) => x !== fn)); },
};

const contextBridge = {
  exposeInMainWorld(key, value) {
    Object.defineProperty(window, key, { value: Object.freeze(value), enumerable: true, configurable: false, writable: false });
  },
};

class Notification {
  constructor(o) { this.o = o || {}; }
  static isSupported() { return true; }
  show() { call('notify', String(this.o.title || ''), String(this.o.body || '')); }
}

class Tray { setTitle() {} setToolTip() {} setContextMenu() {} on() {} }

module.exports = {
  app,
  BrowserWindow,
  Tray,
  Menu: { buildFromTemplate: (t) => t, setApplicationMenu() {} },
  ipcMain,
  ipcRenderer,
  contextBridge,
  nativeImage: { createFromPath: () => ({ setTemplateImage() {}, resize() { return this; } }) },
  Notification,
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showSaveDialog: async () => ({ canceled: true }) },
  shell: {
    openExternal(url) { if (!call('openUrl', String(url)) && typeof window !== 'undefined' && !native) window.open(url, '_blank'); },
    readShortcutLink: () => ({}),
  },
  screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: (typeof innerWidth !== 'undefined' ? innerWidth : 400), height: (typeof innerHeight !== 'undefined' ? innerHeight : 800) } }) },
  safeStorage: { isEncryptionAvailable: () => false },
  __icons: icons,
  __dispatch: dispatch,
};
