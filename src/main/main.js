'use strict';
const {
  app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification, dialog, shell, screen,
} = require('electron');
const fs = require('fs');
const path = require('path');

const BRAND = require('../shared/brand');
const I18N = require('../shared/i18n');
const cfgLib = require('../core/config');
const engine = require('../core/engine');
const statsLib = require('../core/stats');
const { Unlocker } = require('../core/unlock');
const { expandHosts, normalizeSite } = require('../core/domains');
const { PRESETS } = require('../core/presets');
const { TAMPER_TOOLS } = require('../core/procmatch');
const platform = require('./platform');
const stylegen = require('../core/stylegen');
const coach = require('../core/coach');
const ai = require('./ai');

const SELFTEST = process.argv.includes('--selftest');
const SELFTEST_OUT = process.env.HALYRA_SELFTEST_OUT || path.join(require('os').tmpdir(), 'halyra-selftest');
if (SELFTEST) app.setPath('userData', path.join(SELFTEST_OUT, 'userdata'));

const ASSETS = path.join(__dirname, 'assets');
const RENDERER = path.join(__dirname, '..', 'renderer');
let startHidden = process.argv.includes('--hidden');

let config;
let stats;
let configPath;
let statsPath;
let win = null;
let overlay = null;
let tray = null;
let rev = 1;
let lastTick = Date.now();
let lastEval = null;
let lastHostsKey = null;
let hostsState = { installed: false, verified: false, expected: 0 };
let installedAppsCache = null;
let statsDirty = false;
let appCheckBusy = false;
let tickCount = 0;
const lastOverlay = new Map();
const unlocker = new Unlocker();

// ------------------------------------------------------------------ helpers

function lang() {
  const l = config && config.settings.lang;
  if (l && l !== 'auto') return l;
  return String(app.getLocale() || 'en').toLowerCase().startsWith('hu') ? 'hu' : 'en';
}
const t = (key, vars) => I18N.make(lang())(key, vars);

function fmtClock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtLeft(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function writeJsonAtomic(p, data) {
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

function saveConfig() {
  rev += 1;
  try { writeJsonAtomic(configPath, config); } catch (e) { console.error('save config', e); }
}

function saveStats() {
  if (!statsDirty) return;
  statsDirty = false;
  try { writeJsonAtomic(statsPath, stats); } catch (e) { console.error('save stats', e); }
}

function notify(title, body) {
  if (!config.settings.notifications || !Notification.isSupported()) return;
  try { new Notification({ title, body, silent: !config.settings.sound }).show(); } catch (_) { /* ignore */ }
}

function publicSettings() {
  const { pinHash, pinSalt, aiKeyEnc, ...rest } = config.settings;
  return { ...rest, hasPin: Boolean(pinHash), hasAiKey: Boolean(aiKeyEnc) };
}

function activeCustomTheme() {
  const th = config.settings.theme;
  if (!th.startsWith('custom:')) return null;
  return (config.customThemes || []).find((t) => `custom:${t.id}` === th) || null;
}

let insightsCache = { at: 0, rev: 0, list: [] };
function currentInsights(now) {
  if (now - insightsCache.at > 60000 || insightsCache.rev !== rev) {
    insightsCache = { at: now, rev, list: coach.insights(stats, config, now, lang()) };
  }
  return insightsCache.list;
}

function fullState() {
  const now = Date.now();
  const ev = lastEval || engine.evaluate(config, now);
  return {
    now,
    rev,
    platform: process.platform,
    version: app.getVersion(),
    lang: lang(),
    lists: config.lists,
    schedules: config.schedules,
    settings: publicSettings(),
    session: config.session,
    eval: {
      blocking: ev.blocking, mode: ev.mode, sources: ev.sources, endsAt: ev.endsAt, next: ev.next,
      sitesCount: ev.sites.length, appsCount: ev.apps.length, listIds: ev.listIds,
    },
    unlock: unlocker.status(),
    helper: { ...hostsState, supported: platform.IS_MAC || platform.IS_WIN },
    stats: statsLib.summarize(stats, now),
    customThemes: (config.customThemes || []).map((t) => ({ ...t, vars: stylegen.cssVars(t) })),
    insights: currentInsights(now),
    aiModel: ai.MODEL,
  };
}

function push() {
  if (win && !win.isDestroyed() && win.isVisible()) win.webContents.send('state', fullState());
}

// ------------------------------------------------------------------ blocking loop

function sitesFor(ev) {
  return ev.blocking ? expandHosts(ev.sites) : [];
}

function syncHosts(ev, force = false) {
  hostsState.installed = platform.helperInstalled();
  const hosts = sitesFor(ev);
  // The helper drops the blocks by itself at this time, so a website block can
  // never outlive its timer (even if the app is force-quit or deleted).
  const expiresAt = ev.blocking ? ev.endsAt : null;
  const key = `${hosts.join(',')}|${expiresAt}`;
  if (hostsState.installed && (force || key !== lastHostsKey)) {
    if (platform.writeRules(hosts, expiresAt)) lastHostsKey = key;
  }
  hostsState.expected = hosts.length;
}

function verifyHostsLater() {
  setTimeout(() => {
    if (!hostsState.installed) { hostsState.verified = false; return; }
    const ev = lastEval || engine.evaluate(config, Date.now());
    hostsState.verified = platform.verifyHosts(sitesFor(ev)).ok;
    push();
  }, 4000);
}

async function enforceApps(ev) {
  if (appCheckBusy) return;
  let apps = ev.blocking ? ev.apps : [];
  if (ev.blocking && ev.mode === 'strict' && config.settings.strictBlocksTools) apps = [...apps, ...TAMPER_TOOLS];
  if (!apps.length) return;
  appCheckBusy = true;
  try {
    const hits = await platform.findBlocked(apps);
    if (!hits.length) return;
    platform.kill(hits.map((h) => h.pid));
    const now = Date.now();
    const seen = new Set();
    for (const h of hits) {
      if (seen.has(h.app.name)) continue;
      seen.add(h.app.name);
      if (now - (lastOverlay.get(h.app.name) || 0) < 5000) continue;
      lastOverlay.set(h.app.name, now);
      statsLib.addBlock(stats, now, h.app.name);
      statsDirty = true;
      showOverlay(h.app.name, ev);
    }
  } catch (e) {
    console.error('enforce', e);
  } finally {
    appCheckBusy = false;
  }
}

function transitions(prev, ev, now) {
  if (!prev) return;
  const prevS = prev.sources.find((s) => s.type === 'session');
  const curS = ev.sources.find((s) => s.type === 'session');
  if (prevS && curS && prevS.phase !== curS.phase) {
    if (curS.phase === 'break') notify(t('note.break'), t('note.breakBody', { m: Math.round((curS.phaseEndsAt - now) / 60000) }));
    else notify(t('note.back'), t('note.backBody', { n: curS.cycle, total: curS.cycles }));
  }
  const prevIds = new Set(prev.sources.map((s) => s.id));
  for (const s of ev.sources) {
    if (s.type === 'schedule' && !prevIds.has(s.id)) notify(t('note.schedule', { name: s.name }), t('note.scheduleBody', { time: fmtClock(s.endsAt) }));
  }
}

function tick() {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  tickCount += 1;

  let changed = false;
  if (config.session && now >= config.session.endsAt) {
    const mins = Math.round((config.session.endsAt - config.session.startedAt) / 60000);
    config.session = null;
    unlocker.cancel();
    changed = true;
    notify(t('note.ended'), t('note.endedBody', { m: mins }));
  }
  for (const [id, until] of Object.entries(config.skips || {})) {
    if (until <= now) { delete config.skips[id]; changed = true; }
  }
  if (changed) saveConfig();

  const ev = engine.evaluate(config, now);
  transitions(lastEval, ev, now);
  const blockingChanged = !lastEval || lastEval.blocking !== ev.blocking;
  lastEval = ev;

  if (ev.blocking && dt > 0) { statsLib.addFocus(stats, now, dt); statsDirty = true; }
  syncHosts(ev);
  if (blockingChanged) verifyHostsLater();
  if (tickCount % 2 === 0 || blockingChanged) enforceApps(ev);
  if (tickCount % 30 === 0) { statsLib.prune(stats, now); saveStats(); }
  if (tickCount % 10 === 0 && hostsState.installed && !hostsState.verified) {
    hostsState.verified = platform.verifyHosts(sitesFor(ev)).ok;
  }

  updateTray(ev, blockingChanged || changed);
  push();
}

// ------------------------------------------------------------------ actions

function stopAll() {
  const ev = engine.evaluate(config, Date.now());
  config.session = null;
  for (const s of ev.sources) if (s.type === 'schedule') config.skips[s.id] = s.endsAt;
  unlocker.cancel();
  saveConfig();
  tick();
}

function startSession({ listIds, minutes, mode, pomodoro, goal }) {
  const now = Date.now();
  if (config.session && config.session.endsAt > now) return { ok: false, error: 'active' };
  const ids = (Array.isArray(listIds) ? listIds : []).filter((id) => config.lists.some((l) => l.id === id));
  if (!ids.length) return { ok: false, error: 'noLists' };
  const m = engine.MODES.includes(mode) ? mode : 'flexible';
  let endsAt;
  let pomo = null;
  if (pomodoro && pomodoro.work > 0) {
    pomo = {
      work: Math.min(240, Math.max(1, Math.round(pomodoro.work))),
      brk: Math.min(120, Math.max(0, Math.round(pomodoro.brk || 0))),
      cycles: Math.min(24, Math.max(1, Math.round(pomodoro.cycles || 1))),
    };
    endsAt = now + (pomo.cycles * (pomo.work + pomo.brk) - pomo.brk) * 60000;
  } else {
    const mins = Math.min(24 * 60, Math.max(1, Math.round(Number(minutes) || 25)));
    endsAt = now + mins * 60000;
  }
  config.session = { startedAt: now, endsAt, listIds: ids, mode: m, pomodoro: pomo, goal: typeof goal === 'string' ? goal.trim().slice(0, 80) : '' };
  config.settings.defaultListIds = ids;
  config.settings.defaultMode = m;
  if (!pomo) config.settings.defaultMinutes = Math.round((endsAt - now) / 60000);
  statsLib.addSession(stats, now);
  statsDirty = true;
  saveConfig();
  notify(t('note.started'), t('note.startedBody', { time: fmtClock(endsAt) }));
  tick();
  return { ok: true };
}

function extendSession(minutes) {
  const s = config.session;
  if (!s || s.endsAt <= Date.now()) return { ok: false };
  if (s.pomodoro) {
    s.pomodoro.cycles = Math.min(24, s.pomodoro.cycles + 1);
    s.endsAt += (s.pomodoro.work + s.pomodoro.brk) * 60000;
  } else {
    s.endsAt += Math.min(240, Math.max(1, Math.round(Number(minutes) || 15))) * 60000;
  }
  saveConfig();
  tick();
  return { ok: true };
}

function unlockRequest(pin) {
  const ev = engine.evaluate(config, Date.now());
  if (!ev.sources.length) return { status: 'stopped' };
  if (config.settings.pinHash && !cfgLib.verifyPin(config.settings, pin)) return { status: 'pin', error: Boolean(pin) };
  const r = unlocker.request(ev.mode, config.settings);
  if (r.status === 'ready') { stopAll(); return { status: 'stopped' }; }
  return { ...r, endsAt: ev.endsAt, mode: ev.mode };
}

function quitAllowed() {
  const ev = engine.evaluate(config, Date.now());
  return !(ev.blocking && (ev.mode !== 'flexible' || config.settings.pinHash));
}

function applyLoginItem() {
  if (!app.isPackaged) return;
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(config.settings.launchAtLogin), openAsHidden: true, args: ['--hidden'] });
  } catch (_) { /* ignore */ }
}

function applyConfigChange(partial, pin) {
  const now = Date.now();
  const candidate = cfgLib.mergeEditable(config, partial || {});
  const ev = engine.evaluate(config, now);
  if (ev.sources.length && engine.isReduction(config, candidate, now)) {
    if (ev.mode !== 'flexible') return { ok: false, error: 'locked' };
    if (config.settings.pinHash && !cfgLib.verifyPin(config.settings, pin)) return { ok: false, error: 'pin' };
  }
  const prevLogin = config.settings.launchAtLogin;
  const prevTheme = config.settings.theme;
  const prevLang = lang();
  config = candidate;
  saveConfig();
  if (prevLogin !== config.settings.launchAtLogin) applyLoginItem();
  if (prevTheme !== config.settings.theme || 'customThemes' in (partial || {})) applyWindowTheme();
  if (prevLang !== lang()) { buildAppMenu(); updateTray(lastEval, true); }
  tick();
  return { ok: true };
}

function tryQuit() {
  if (!quitAllowed()) {
    showWindow();
    if (win) win.webContents.send('toast', { kind: 'error', text: t('err.quitLocked') });
    return false;
  }
  app.isQuittingForReal = true;
  app.quit();
  return true;
}

// ------------------------------------------------------------------ windows

const THEME_CHROME = {
  midnight: { bg: '#0a0d16', fg: '#e9ecf5' },
  daylight: { bg: '#f4f1ea', fg: '#1a1c22' },
  crt: { bg: '#030603', fg: '#5dff9a' },
  onebit: { bg: '#ffffff', fg: '#000000' },
  vapor: { bg: '#1b0b30', fg: '#ffe9ff' },
};

function themeChrome() {
  const custom = activeCustomTheme();
  if (custom) return { bg: custom.colors.bg, fg: custom.colors.text };
  return THEME_CHROME[config.settings.theme] || THEME_CHROME.midnight;
}

function applyWindowTheme() {
  if (!win || win.isDestroyed()) return;
  const c = themeChrome();
  win.setBackgroundColor(c.bg);
  if (platform.IS_WIN && win.setTitleBarOverlay) {
    try { win.setTitleBarOverlay({ color: c.bg, symbolColor: c.fg, height: 40 }); } catch (_) { /* older electron */ }
  }
}

function createWindow() {
  const c = themeChrome();
  win = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 920,
    minHeight: 640,
    show: false,
    title: BRAND.name,
    backgroundColor: c.bg,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 18, y: 18 },
    titleBarOverlay: platform.IS_WIN ? { color: c.bg, symbolColor: c.fg, height: 40 } : undefined,
    icon: platform.IS_WIN ? path.join(ASSETS, 'icon.png') : undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(RENDERER, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.once('ready-to-show', () => { if (!startHidden) showWindow(); startHidden = false; });
  win.on('close', (e) => {
    if (!app.isQuittingForReal) {
      e.preventDefault();
      win.hide();
      if (platform.IS_MAC && app.dock) app.dock.hide();
    }
  });
  win.on('show', () => push());
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  if (platform.IS_MAC && app.dock) app.dock.show();
  win.show();
  win.focus();
  push();
}

function createOverlay() {
  overlay = new BrowserWindow({
    width: 460,
    height: 150,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: true },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true);
  if (platform.IS_MAC) overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.loadFile(path.join(RENDERER, 'overlay.html'));
}

let overlayTimer = null;
function showOverlay(appName, ev) {
  if (!config.settings.showOverlay) {
    notify(t('overlay.blocked', { app: appName }), '');
    return;
  }
  if (!overlay || overlay.isDestroyed()) createOverlay();
  const area = screen.getPrimaryDisplay().workArea;
  overlay.setPosition(Math.round(area.x + (area.width - 460) / 2), Math.round(area.y + 24));
  const left = ev.endsAt ? t('overlay.leftTime', { t: fmtLeft(ev.endsAt - Date.now()) }) : '';
  const custom = activeCustomTheme();
  const payload = {
    title: t('overlay.blocked', { app: appName }), sub: t('overlay.sub', { left }), theme: custom ? 'custom' : config.settings.theme,
    vars: custom ? stylegen.cssVars(custom) : null, font: custom ? custom.font : null,
  };
  const send = () => { overlay.webContents.send('overlay', payload); overlay.showInactive(); };
  if (overlay.webContents.isLoading()) overlay.webContents.once('did-finish-load', send);
  else send();
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => { if (overlay && !overlay.isDestroyed()) overlay.hide(); }, 3600);
}

// ------------------------------------------------------------------ tray & menu

function trayIcon() {
  if (platform.IS_MAC) {
    const img = nativeImage.createFromPath(path.join(ASSETS, 'trayTemplate.png'));
    img.setTemplateImage(true);
    return img;
  }
  return nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
}

let lastMenuKey = '';
function updateTray(ev, force) {
  if (!tray || !ev) return;
  const now = Date.now();
  const session = ev.sources.find((s) => s.type === 'session');
  let label = t('tray.idle');
  let title = '';
  if (session && session.phase === 'break') {
    label = t('tray.break', { t: fmtLeft(session.phaseEndsAt - now) });
    title = ` ☕ ${fmtLeft(session.phaseEndsAt - now)}`;
  } else if (ev.blocking) {
    label = t('tray.active', { t: fmtLeft(ev.endsAt - now) });
    title = ` ${fmtLeft(ev.endsAt - now)}`;
  }
  if (platform.IS_MAC) tray.setTitle(title, { fontType: 'monospacedDigit' });
  tray.setToolTip(`${BRAND.name} — ${label}`);

  const minuteKey = `${lang()}|${ev.blocking}|${Math.floor(now / 30000)}`;
  if (!force && minuteKey === lastMenuKey) return;
  lastMenuKey = minuteKey;
  const defaults = config.settings.defaultListIds.length ? config.settings.defaultListIds : config.lists.slice(0, 2).map((l) => l.id);
  const items = [{ label, enabled: false }, { type: 'separator' }];
  if (!ev.sources.length) {
    for (const m of [25, 50, 90]) {
      items.push({ label: t('tray.start', { m }), click: () => startSession({ listIds: defaults, minutes: m, mode: config.settings.defaultMode }) });
    }
  } else {
    items.push({ label: t('tray.stop'), click: () => { showWindow(); win.webContents.send('open-unlock'); } });
  }
  items.push({ type: 'separator' }, { label: t('tray.open'), click: showWindow }, { label: t('tray.quit'), click: tryQuit });
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function buildAppMenu() {
  if (!platform.IS_MAC) { Menu.setApplicationMenu(null); return; }
  const template = [
    {
      label: BRAND.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: t('nav.settings'), accelerator: 'Cmd+,', click: () => { showWindow(); win.webContents.send('navigate', 'settings'); } },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { label: t('tray.quit'), accelerator: 'Cmd+Q', click: tryQuit },
      ],
    },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ------------------------------------------------------------------ IPC

function ipc() {
  const handle = (ch, fn) => ipcMain.handle(ch, async (_e, arg) => {
    try { return await fn(arg || {}); } catch (e) { console.error(ch, e); return { ok: false, error: 'generic' }; }
  });

  handle('state:get', () => fullState());
  handle('presets:get', () => PRESETS);
  handle('config:set', ({ patch, pin }) => ({ ...applyConfigChange(patch, pin), state: fullState() }));
  handle('session:start', (o) => ({ ...startSession(o), state: fullState() }));
  handle('session:extend', ({ minutes }) => ({ ...extendSession(minutes), state: fullState() }));
  handle('sites:normalize', ({ sites }) => (Array.isArray(sites) ? sites : []).slice(0, 3000).map(normalizeSite).filter(Boolean));

  handle('unlock:request', ({ pin }) => unlockRequest(pin));
  handle('unlock:emergency', ({ pin }) => {
    const ev = engine.evaluate(config, Date.now());
    if (!ev.sources.length) return { status: 'stopped' };
    if (config.settings.pinHash && !cfgLib.verifyPin(config.settings, pin)) return { status: 'pin', error: Boolean(pin) };
    return unlocker.emergency(config.settings);
  });
  handle('unlock:confirm', ({ challenge }) => {
    const ev = engine.evaluate(config, Date.now());
    if (!ev.sources.length) return { status: 'stopped' };
    if (ev.mode === 'flexible') return { status: 'denied' };
    if (unlocker.confirm(ev.mode, { challenge })) { stopAll(); return { status: 'stopped' }; }
    return { status: 'denied' };
  });
  handle('unlock:cancel', () => { unlocker.cancel(); return { ok: true }; });

  handle('pin:set', ({ current, next }) => {
    if (!cfgLib.verifyPin(config.settings, current)) return { ok: false, error: 'pin' };
    const ev = engine.evaluate(config, Date.now());
    if (!next) {
      if (ev.blocking && ev.mode !== 'flexible') return { ok: false, error: 'locked' };
      config.settings.pinHash = null;
      config.settings.pinSalt = null;
    } else {
      const p = String(next);
      if (p.length < 4 || p.length > 12) return { ok: false, error: 'generic' };
      const { hash, salt } = cfgLib.hashPin(p);
      config.settings.pinHash = hash;
      config.settings.pinSalt = salt;
    }
    saveConfig();
    return { ok: true, state: fullState() };
  });

  handle('apps:installed', async ({ refresh }) => {
    if (!installedAppsCache || refresh) {
      const list = await platform.listInstalledApps((p) => shell.readShortcutLink(p));
      installedAppsCache = await Promise.all(list.map(async (a) => {
        let icon = null;
        try { icon = (await app.getFileIcon(a.path, { size: 'normal' })).toDataURL(); } catch (_) { icon = null; }
        return { name: a.name, mac: a.mac, win: a.win, icon, running: Boolean(a.running) };
      }));
    }
    return installedAppsCache;
  });
  handle('apps:browse', async () => {
    const r = await dialog.showOpenDialog(win, platform.IS_MAC
      ? { defaultPath: '/Applications', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Apps', extensions: ['app'] }] }
      : { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Programs', extensions: ['exe'] }] });
    if (r.canceled) return [];
    return r.filePaths.map(platform.appFromPath).filter(Boolean).map(({ path: _p, ...rest }) => rest);
  });

  handle('helper:install', async () => {
    const r = await platform.installHelper(t('helper.prompt'));
    lastHostsKey = null;
    syncHosts(engine.evaluate(config, Date.now()), true);
    verifyHostsLater();
    return { ...r, state: fullState() };
  });
  handle('helper:uninstall', async () => {
    const ev = engine.evaluate(config, Date.now());
    if (ev.blocking && ev.mode !== 'flexible') return { ok: false, error: 'locked' };
    const r = await platform.uninstallHelper(t('helper.prompt'));
    hostsState = { installed: platform.helperInstalled(), verified: false, expected: 0 };
    lastHostsKey = null;
    return { ...r, state: fullState() };
  });

  handle('config:export', async () => {
    const r = await dialog.showSaveDialog(win, { defaultPath: 'halyra-focus-settings.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return { ok: false };
    const { pinHash, pinSalt, ...settings } = config.settings;
    fs.writeFileSync(r.filePath, JSON.stringify({ app: BRAND.name, version: 1, lists: config.lists, schedules: config.schedules, settings }, null, 2));
    return { ok: true };
  });
  handle('config:import', async ({ pin }) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return { ok: false };
    const data = readJson(r.filePaths[0]);
    if (!data || !Array.isArray(data.lists)) return { ok: false, error: 'generic' };
    const res = applyConfigChange({ lists: data.lists, schedules: data.schedules || [], settings: data.settings || {} }, pin);
    return { ...res, state: fullState() };
  });

  // ---------------------------------------------------------------- AI & coach
  const aiKey = () => ai.decryptKey(config.settings.aiKeyEnc);
  handle('style:generate', async ({ prompt, seed }) => {
    const text = String(prompt || '').trim().slice(0, 200);
    if (!text) return { ok: false, error: 'generic' };
    const key = aiKey();
    if (key && !seed) {
      try {
        const spec = await ai.styleSpec(key, text);
        if (spec && stylegen.fromHex(spec.accent) && stylegen.fromHex(spec.bg)) {
          const theme = stylegen.fromSpec({ ...spec, name: spec.name || text }, { prompt: text });
          return { ok: true, source: 'ai', theme: { ...theme, vars: stylegen.cssVars(theme) } };
        }
      } catch (e) {
        const theme = stylegen.generate(text, seed || 0);
        return { ok: true, source: 'offline', aiError: e.code || 'apiError', theme: { ...theme, vars: stylegen.cssVars(theme) } };
      }
    }
    const theme = stylegen.generate(text, seed || 0);
    return { ok: true, source: 'offline', theme: { ...theme, vars: stylegen.cssVars(theme) } };
  });
  handle('style:preview', ({ theme }) => {
    const clean = stylegen.sanitizeTheme(theme);
    return clean ? { ok: true, theme: { ...clean, vars: stylegen.cssVars(clean) } } : { ok: false };
  });
  handle('style:save', ({ theme, apply }) => {
    const clean = stylegen.sanitizeTheme(theme);
    if (!clean) return { ok: false, error: 'generic' };
    const list = (config.customThemes || []).filter((x) => x.id !== clean.id);
    const r = applyConfigChange({ customThemes: [clean, ...list].slice(0, 24), settings: apply ? { theme: `custom:${clean.id}` } : {} });
    return { ...r, id: clean.id, state: fullState() };
  });
  handle('style:delete', ({ id }) => {
    const list = (config.customThemes || []).filter((x) => x.id !== id);
    const settings = config.settings.theme === `custom:${id}` ? { theme: 'midnight' } : {};
    return { ...applyConfigChange({ customThemes: list, settings }), state: fullState() };
  });
  handle('ai:setKey', async ({ key }) => {
    const k = String(key || '').trim();
    if (!/^sk-[\w-]{20,}$/.test(k)) return { ok: false, error: 'aiKeyFormat' };
    try { await ai.complete(k, { system: 'Reply with OK.', prompt: 'OK?', maxTokens: 5, timeoutMs: 15000 }); } catch (e) {
      if (e.code === 'invalidKey') return { ok: false, error: 'aiInvalid' };
      if (e.code === 'network' || e.code === 'timeout') return { ok: false, error: 'aiNetwork' };
    }
    config.settings.aiKeyEnc = ai.encryptKey(k);
    saveConfig();
    return { ok: true, state: fullState() };
  });
  handle('ai:removeKey', () => { config.settings.aiKeyEnc = null; saveConfig(); return { ok: true, state: fullState() }; });
  handle('coach:suggest', async ({ goal }) => {
    const g = String(goal || '').trim().slice(0, 160);
    const lang0 = lang();
    const mapPresets = (presets) => config.lists.filter((l) => presets.includes(l.presetId)).map((l) => l.id);
    const key = aiKey();
    if (key && g) {
      try {
        const r = await ai.suggest(key, g, config.lists, lang0);
        if (r && Array.isArray(r.listIds)) {
          const listIds = r.listIds.filter((id) => config.lists.some((l) => l.id === id));
          if (listIds.length) {
            const pomo = r.pomodoro && r.pomodoro.work > 0 ? { work: Math.min(120, Math.max(5, r.pomodoro.work | 0)), brk: Math.min(30, Math.max(0, r.pomodoro.brk | 0)), cycles: Math.min(12, Math.max(1, r.pomodoro.cycles | 0)) } : null;
            return { ok: true, source: 'ai', listIds, minutes: pomo ? null : Math.min(240, Math.max(10, Number(r.minutes) || 50)), pomodoro: pomo, mode: engine.MODES.includes(r.mode) ? r.mode : 'patient', reason: String(r.reason || '').slice(0, 300) };
          }
        }
      } catch (_) { /* fall back to the offline coach */ }
    }
    const s0 = coach.suggestSetup(g, lang0);
    let listIds = mapPresets(s0.presets);
    if (!listIds.length) listIds = config.lists.slice(0, 2).map((l) => l.id);
    return { ok: true, source: 'offline', listIds, minutes: s0.minutes, pomodoro: s0.pomodoro, mode: s0.mode, reason: s0.reason };
  });
  handle('coach:line', () => {
    const now = Date.now();
    const ev = engine.evaluate(config, now);
    const src = ev.sources.find((x) => x.type === 'session') || ev.sources[0];
    if (!src) return { text: '' };
    const s0 = src.type === 'session' ? config.session : null;
    const total = s0 ? s0.endsAt - s0.startedAt : 60 * 60000;
    const sum = statsLib.summarize(stats, now);
    return {
      text: coach.coachLine({
        goal: s0 && s0.goal, leftMs: src.endsAt - now, totalMs: total, streak: sum.streak, todayMin: sum.todayMinutes,
        phase: src.phase, phaseLeftMs: s0 && s0.pomodoro ? src.phaseEndsAt - now : null,
      }, lang()),
      streak: sum.streak,
    };
  });
  handle('insight:apply', ({ id }) => {
    const ins = currentInsights(Date.now()).find((x) => x.id === id);
    if (!ins || !ins.action) return { ok: false };
    const a = ins.action;
    let r = { ok: false };
    if (a.type === 'createSchedule') r = applyConfigChange({ schedules: [...config.schedules, { ...a.schedule, id: cfgLib.uid() }] });
    if (a.type === 'enableSchedule') r = applyConfigChange({ schedules: config.schedules.map((x) => (x.id === a.id ? { ...x, enabled: true } : x)) });
    insightsCache.at = 0;
    return { ...r, action: a.type, state: fullState() };
  });

  handle('app:open-external', ({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { ok: true }; });
  handle('app:quit', () => ({ ok: tryQuit() }));
}

// ------------------------------------------------------------------ boot

function boot() {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  configPath = path.join(dir, 'config.json');
  statsPath = path.join(dir, 'stats.json');
  const raw = readJson(configPath);
  const sysLang = String(app.getLocale() || 'en').toLowerCase().startsWith('hu') ? 'hu' : 'en';
  config = cfgLib.normalizeLoaded(raw, sysLang);
  const rawStats = readJson(statsPath);
  stats = rawStats && rawStats.days ? rawStats : statsLib.emptyStats();
  if (!raw) saveConfig();

  if (platform.IS_WIN) app.setAppUserModelId(BRAND.appId);
  app.setAboutPanelOptions && app.setAboutPanelOptions({ applicationName: BRAND.name, copyright: '© Halyra', website: BRAND.website });

  if (platform.IS_MAC && app.isPackaged) {
    try { if (app.getLoginItemSettings().wasOpenedAtLogin) startHidden = true; } catch (_) { /* ignore */ }
  }
  ipc();
  buildAppMenu();
  applyLoginItem();
  tray = new Tray(trayIcon());
  tray.on('click', () => { if (!platform.IS_MAC) showWindow(); });
  createWindow();
  if (startHidden && platform.IS_MAC && app.dock) app.dock.hide();

  lastHostsKey = null;
  tick();
  verifyHostsLater();
  setInterval(tick, 1000);
  if (SELFTEST) runSelftest();
}

function runSelftest() {
  const selftest = require('./selftest');
  const ctx = {
    outDir: SELFTEST_OUT,
    version: app.getVersion(),
    platform,
    win: () => win,
    overlay: () => (overlay && !overlay.isDestroyed() ? overlay : null),
    config: () => config,
    setConfig: async (patch, pin) => applyConfigChange(patch, pin),
    startSession,
    stopAll,
    unlockRequest: async (pin) => unlockRequest(pin),
    tryQuitDry: () => quitAllowed(),
    forceClearSession: () => { config.session = null; unlocker.cancel(); saveConfig(); tick(); },
    blockCount: (name) => Object.values(stats.days).reduce((n, d) => n + (d.blocks[name] || 0), 0),
  };
  const watchdog = setTimeout(() => { console.error('[selftest] timed out'); app.exit(2); }, 8 * 60000);
  selftest(ctx).then((ok) => {
    clearTimeout(watchdog);
    app.isQuittingForReal = true;
    app.exit(ok ? 0 : 1);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(boot);
  app.on('activate', () => showWindow());
  app.on('window-all-closed', (e) => { if (e && e.preventDefault) e.preventDefault(); });
  app.on('before-quit', () => { app.isQuittingForReal = true; });
  app.on('will-quit', () => {
    try {
      saveStats();
      const ev = engine.evaluate(config, Date.now());
      // Quitting from a flexible block means "turn it off". Non-flexible blocks
      // keep websites blocked even if the app is force-closed.
      if (!ev.blocking || (ev.mode === 'flexible' && !config.settings.pinHash)) {
        if (platform.helperInstalled()) platform.writeRules([]);
      }
    } catch (_) { /* best effort */ }
  });
}
