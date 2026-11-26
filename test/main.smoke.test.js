'use strict';
// Boots src/main/main.js against a fake `electron` module and drives the IPC
// handlers the way the UI does. Catches runtime errors without a real Electron.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-smoke-'));
const handlers = {};
const sent = [];
let readyResolve;
const ready = new Promise((r) => { readyResolve = r; });
const appEvents = {};

class FakeWebContents {
  constructor() { this.listeners = {}; }
  send(ch, data) { sent.push([ch, data]); }
  setWindowOpenHandler() {}
  on() {}
  once(ev, fn) { if (ev === 'did-finish-load') fn(); }
  isLoading() { return false; }
}
class FakeWindow {
  constructor(opts) { this.opts = opts; this.webContents = new FakeWebContents(); this.visible = false; this.destroyed = false; }
  loadFile() {}
  once(ev, fn) { if (ev === 'ready-to-show') setImmediate(fn); }
  on() {}
  show() { this.visible = true; }
  showInactive() { this.visible = true; }
  hide() { this.visible = false; }
  focus() {}
  isVisible() { return this.visible; }
  isDestroyed() { return this.destroyed; }
  setBackgroundColor() {}
  setTitleBarOverlay() {}
  setAlwaysOnTop() {}
  setIgnoreMouseEvents() {}
  setVisibleOnAllWorkspaces() {}
  setPosition() {}
}
const fakeElectron = {
  app: {
    isPackaged: false,
    dock: { show() {}, hide() {} },
    requestSingleInstanceLock: () => true,
    whenReady: () => ready,
    on: (ev, fn) => { appEvents[ev] = fn; },
    getPath: () => userData,
    getLocale: () => 'hu-HU',
    getVersion: () => '1.0.0',
    setLoginItemSettings() {},
    setAppUserModelId() {},
    setAboutPanelOptions() {},
    quit() { this.quitCalled = true; },
    getFileIcon: async () => ({ toDataURL: () => 'data:image/png;base64,' }),
  },
  BrowserWindow: FakeWindow,
  Tray: class { setTitle() {} setToolTip(t) { this.tip = t; } setContextMenu(m) { this.menu = m; } on() {} },
  Menu: { buildFromTemplate: (t) => t, setApplicationMenu() {} },
  ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; } },
  nativeImage: { createFromPath: () => ({ setTemplateImage() {} }) },
  Notification: class { static isSupported() { return true; } show() {} },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showSaveDialog: async () => ({ canceled: true }) },
  shell: { openExternal() {}, readShortcutLink: () => ({}) },
  screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }) },
  safeStorage: { isEncryptionAvailable: () => false },
};

const origLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === 'electron') return fakeElectron;
  return origLoad.call(this, request, ...rest);
};
const realSetInterval = global.setInterval;
global.setInterval = (fn, ms) => { const h = realSetInterval(fn, ms); h.unref(); return h; };

const call = (ch, arg) => handlers[ch]({}, arg);

test('main process boots and IPC works end-to-end', async () => {
  require('../src/main/main.js');
  readyResolve();
  await new Promise((r) => setTimeout(r, 50));

  const st = await call('state:get');
  assert.equal(st.lang, 'hu');
  assert.ok(st.lists.length >= 4);
  assert.equal(st.eval.blocking, false);
  assert.ok(fs.existsSync(path.join(userData, 'config.json')));
  assert.equal(st.settings.pinHash, undefined, 'pin hash never leaves main');

  // add a site to a list
  const social = st.lists[0];
  const patch = { lists: st.lists.map((l) => (l.id === social.id ? { ...l, sites: [...l.sites, 'https://www.Example.com/x'] } : l)) };
  let r = await call('config:set', { patch });
  assert.equal(r.ok, true);
  assert.ok(r.state.lists[0].sites.includes('example.com'));

  // start a strict session
  r = await call('session:start', { listIds: [social.id], minutes: 30, mode: 'strict' });
  assert.equal(r.ok, true);
  assert.equal(r.state.eval.blocking, true);
  assert.equal(r.state.eval.mode, 'strict');
  r = await call('session:start', { listIds: [social.id], minutes: 30, mode: 'flexible' });
  assert.equal(r.error, 'active');

  // removing a site while locked is refused, adding is fine
  const st2 = await call('state:get');
  const without = { lists: st2.lists.map((l) => (l.id === social.id ? { ...l, sites: l.sites.filter((s) => s !== 'example.com') } : l)) };
  r = await call('config:set', { patch: without });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'locked');
  const more = { lists: st2.lists.map((l) => (l.id === social.id ? { ...l, sites: [...l.sites, 'another.com'] } : l)) };
  assert.equal((await call('config:set', { patch: more })).ok, true);

  // stop: locked -> emergency challenge -> wrong text denied
  r = await call('unlock:request', {});
  assert.equal(r.status, 'locked');
  r = await call('unlock:emergency', {});
  assert.equal(r.status, 'challenge');
  assert.ok(r.challenge.length > 50);
  assert.equal((await call('unlock:confirm', { challenge: 'nope' })).status, 'denied');
  assert.equal((await call('app:quit')).ok, false, 'cannot quit during strict block');

  // extend works
  const before = (await call('state:get')).session.endsAt;
  await call('session:extend', { minutes: 15 });
  assert.equal((await call('state:get')).session.endsAt, before + 15 * 60000);

  // PIN: set, then wrong pin refused
  r = await call('pin:set', { current: '', next: '4321' });
  assert.equal(r.ok, true);
  assert.equal(r.state.settings.hasPin, true);
  assert.equal((await call('pin:set', { current: '0000', next: '' })).ok, false);

  // settings change + theme
  r = await call('config:set', { patch: { settings: { theme: 'crt', lang: 'en' } } });
  assert.equal(r.ok, true);
  assert.equal(r.state.settings.theme, 'crt');
  assert.equal(r.state.lang, 'en');

  // normalization helper + presets + installed apps (empty on linux)
  assert.deepEqual(await call('sites:normalize', { sites: ['HTTPS://WWW.Reddit.com/r/x', 'bad'] }), ['reddit.com']);
  assert.ok((await call('presets:get')).length >= 6);
  assert.ok(Array.isArray(await call('apps:installed', {})));

  // style studio (offline engine), save + apply, delete
  const gen = await call('style:generate', { prompt: 'neon tokiói éjszaka' });
  assert.equal(gen.ok, true);
  assert.equal(gen.source, 'offline');
  assert.ok(gen.theme.vars['--accent']);
  const tuned = await call('style:preview', { theme: { ...gen.theme, colors: { ...gen.theme.colors, accent: '#ff0000' } } });
  assert.equal(tuned.ok, true);
  const savedStyle = await call('style:save', { theme: tuned.theme, apply: true });
  assert.equal(savedStyle.ok, true);
  assert.equal(savedStyle.state.settings.theme, `custom:${savedStyle.id}`);
  assert.equal(savedStyle.state.customThemes.length, 1);
  const del = await call('style:delete', { id: savedStyle.id });
  assert.equal(del.state.customThemes.length, 0);
  assert.notEqual(del.state.settings.theme, `custom:${savedStyle.id}`);

  // coach
  const sug = await call('coach:suggest', { goal: 'vizsgára tanulok' });
  assert.equal(sug.ok, true);
  assert.ok(sug.listIds.length >= 1);
  assert.ok(sug.pomodoro);
  const line = await call('coach:line');
  assert.ok(line.text.length > 10, 'coach line during a block');
  assert.ok(Array.isArray((await call('state:get')).insights));
  assert.equal((await call('ai:setKey', { key: 'nope' })).error, 'aiKeyFormat');

  // account: not configured in this build → clean error, state still served
  const acc = await call('cloud:signIn', { email: 'a@b.c', password: 'password1' });
  assert.equal(acc.ok, false);
  assert.equal(acc.error, 'notConfigured');
  const accSt = await call('state:get');
  assert.equal(accSt.cloud.enabled, false);
  assert.equal(accSt.cloud.signedIn, false);
  assert.equal(typeof accSt.usage, 'object');
  assert.equal((await call('cloud:signOut')).ok, true);

  // daily limit + focus sound settings round-trip
  const withLimit = accSt.lists.map((l, i) => (i === 0 ? { ...l, limitMin: 45 } : l));
  const lim = await call('config:set', { patch: { lists: withLimit, settings: { focusSound: 'rain', focusVolume: 0.3 } } });
  assert.equal(lim.ok, true);
  assert.equal(lim.state.lists[0].limitMin, 45);
  assert.equal(lim.state.settings.focusSound, 'rain');

  // Halyra AI (offline: no key, no account): adds sites to a list during the running strict block
  const chat0 = await call('ai:chatGet');
  assert.equal(chat0.mode, 'offline');
  const c1 = await call('ai:chat', { text: 'block youtube.com/shorts and 9gag.com' });
  assert.equal(c1.ok, true);
  const lastMsg = c1.log[c1.log.length - 1];
  assert.equal(lastMsg.role, 'assistant');
  assert.ok(lastMsg.actions.some((a) => a.name === 'block_sites' && a.ok), JSON.stringify(lastMsg));
  const aiList = c1.state.lists.find((l) => /AI/.test(l.name));
  assert.ok(aiList && aiList.paths.includes('youtube.com/shorts') && aiList.sites.includes('9gag.com'));
  const c2 = await call('ai:chat', { text: 'állítsd le' });
  assert.match(c2.log[c2.log.length - 1].text, /⚠️/, 'a strict block is not stopped by the AI');
  const c3 = await call('ai:chat', { text: 'what is the meaning of life' });
  assert.match(c3.log[c3.log.length - 1].text, /Halyra AI|AI-t/);
  assert.equal((await call('ai:chatReset')).log.length, 0);

  // Always-on + earn lists: no focus needed, PIN + cool-down protect them, earned minutes open them.
  const base = (await call('state:get')).lists;
  const shield = { id: 'shield', name: 'Shield', emoji: '🛡️', sites: ['pornhub.com'], paths: [], apps: [], keywords: ['porn'], always: true, safe: true };
  const fun = { id: 'fun', name: 'Fun', emoji: '🎮', sites: ['store.steampowered.com'], paths: [], apps: [], earn: true };
  r = await call('config:set', { patch: { lists: [...base, shield, fun], settings: { coolDownH: 24 } } });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  let st3 = r.state;
  assert.ok(st3.eval.standing.listIds.includes('shield') && st3.eval.standing.listIds.includes('fun'));
  assert.equal(st3.coolDown.state, 'idle');
  assert.equal(st3.wallet.balance, 0);
  assert.equal((await call('earn:spend', { listId: 'fun', minutes: 10 })).error, 'balance');
  assert.equal((await call('earn:spend', { listId: 'fun', minutes: 0 })).ok, true);
  assert.equal((await call('earn:spend', { listId: 'shield', minutes: 5 })).ok, false, 'always lists cannot be bought open');
  const weaker = st3.lists.map((l) => (l.id === 'shield' ? { ...l, always: false } : l));
  assert.equal((await call('config:set', { patch: { lists: weaker } })).error, 'pin');
  r = await call('config:set', { patch: { lists: weaker }, pin: '4321' });
  assert.equal(r.error, 'cooldown');
  assert.equal(r.coolDown.hours, 24);
  assert.equal((await call('config:set', { patch: { settings: { coolDownH: 0 } }, pin: '4321' })).error, 'cooldown', 'cannot shorten the wait to skip it');
  r = await call('cooldown:set', { start: true });
  assert.equal(r.state.coolDown.state, 'waiting');
  assert.ok(r.state.coolDown.at > Date.now() + 23 * 3600 * 1000);
  assert.equal((await call('cooldown:set', { start: false })).state.coolDown.state, 'idle');
  const stricter = st3.lists.map((l) => (l.id === 'shield' ? { ...l, sites: [...l.sites, 'xvideos.com'] } : l));
  assert.equal((await call('config:set', { patch: { lists: stricter } })).ok, true, 'making it stricter needs nothing');

  // state is pushed to the window
  assert.ok(sent.some(([ch]) => ch === 'state'));
  // will-quit handler is safe
  appEvents['will-quit']();

  // persisted config reloads cleanly
  const saved = JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
  assert.equal(saved.session.mode, 'strict');
  assert.ok(saved.settings.pinHash);
});
