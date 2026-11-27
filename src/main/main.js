'use strict';
const {
  app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification, dialog, shell, screen, powerMonitor,
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
const sync = require('../core/sync');
const { CloudClient } = require('./cloud');
const webusage = require('../core/webusage');
const blockrules = require('../core/blockrules');
const GROW = require('../shared/grow');
const LEVELS = require('../shared/levels');
const assistant = require('../core/assistant');
const blockinfoLib = require('../core/blockinfo');
const { blockInfo } = blockinfoLib;
const CLOUD_CONF = process.env.HALYRA_CLOUD_OFF === '1' ? {} : (() => { try { return require('../shared/cloud.json'); } catch (_) { return {}; } })();

const SELFTEST = process.argv.includes('--selftest');
const SELFTEST_OUT = process.env.HALYRA_SELFTEST_OUT || path.join(require('os').tmpdir(), 'halyra-selftest');
if (SELFTEST) app.setPath('userData', path.join(SELFTEST_OUT, 'userdata'));

const ASSETS = path.join(__dirname, 'assets');
const RENDERER = path.join(__dirname, '..', 'renderer');
let startHidden = process.argv.includes('--hidden');
const rendererLog = [];

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
let guard = null; // browser tabs / policy (computers)
let lastGrown = null;
let chatLog = null; // Halyra AI conversation [{role, text, sources?, actions?, at}] (kept on this device only)
let chatBusy = false; // the latest finished / withered grow item, for the UI's celebration
let blockPage = null; // local block page server { url, port }
// `failingSince` is when website blocking last started looking inactive while a
// block was running. Competing blockers get the worst reviews for exactly this:
// the session says "on" while nothing is actually blocked. Better to say so.
let hostsState = { installed: false, verified: false, expected: 0, failingSince: 0 };
let installedAppsCache = null;
let statsDirty = false;
let statsSyncDirty = false; // stats changed since the last cloud push
let remoteDevices = {}; // other devices' compact stats from the sync row
let lastStatsPush = 0;
let statsSyncNow = false; // push stats on the next sync (e.g. a tree just finished growing)
let mergedCache = { at: 0, key: '', summary: null };
let appCheckBusy = false;
let tickCount = 0;
const lastOverlay = new Map();
const unlocker = new Unlocker();
let cloud = null;
let deviceId = null;
let dirty = false;
let applyingRemote = false;
let lastRemoteAt = 0;
let syncTimer = null;
const syncState = { lastSync: 0, error: null, busy: false };

// Phones measure app time natively (platform.usageToday); computers count it here.
const usageNow = (now = Date.now()) => (platform.usageToday ? platform.usageToday(config, now) : stats ? statsLib.usageToday(stats, now) : {});
const evalNow = (now = Date.now()) => engine.evaluate(config, now, { usage: usageNow(now) });

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
  if (!applyingRemote && cloud && cloud.signedIn()) { dirty = true; scheduleSync(2500); }
}

// ------------------------------------------------------------------ account & sync

function cloudStore() {
  const file = path.join(app.getPath('userData'), 'account.json');
  return {
    load() {
      try { const raw = fs.readFileSync(file, 'utf8'); const dec = ai.decryptKey(raw.trim()); return dec ? JSON.parse(dec) : null; } catch (_) { return null; }
    },
    save(session) {
      try { if (!session) fs.rmSync(file, { force: true }); else fs.writeFileSync(file, ai.encryptKey(JSON.stringify(session))); } catch (_) { /* ignore */ }
    },
  };
}

function scheduleSync(ms) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(true), ms);
}

// Polls only a tiny "last changed" stamp; the full data is downloaded only when
// another device changed something (keeps the free database tier's bandwidth low).
let lastPulledStamp = '';
let lastSyncPoll = 0;
// How often a signed-in computer asks "did anything change?". Kept low so the free
// database tier lasts: every check costs a little bandwidth, on every computer, all day.
//   window open and in front → 45 s · a focus session running → 4 min · in the background → 12 min
// Opening the window, waking the computer or unlocking it always checks at once.
const SYNC_FRONT = 45000;
const SYNC_SESSION = 4 * 60000;
const SYNC_BACKGROUND = 12 * 60000;
function syncInterval() {
  if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) return SYNC_FRONT;
  if (config.session && config.session.endsAt > Date.now()) return SYNC_SESSION;
  return SYNC_BACKGROUND;
}
/** Check now if the last check is older than `minAge` (used on focus / wake). */
function syncSoon(minAge = 15000) {
  if (Date.now() - lastSyncPoll > minAge) syncNow(true).catch(() => {});
}
async function syncNow(force) {
  if (!cloud || !cloud.enabled() || !cloud.signedIn() || syncState.busy) return;
  if (!force && !dirty && !statsSyncNow && Date.now() - lastSyncPoll < syncInterval() - 2000) return;
  lastSyncPoll = Date.now();
  syncState.busy = true;
  try {
    const meta = cloud.pullMeta ? await cloud.pullMeta() : null;
    const stamp = meta ? `${meta.updated_at}|${meta.device}` : '';
    const row = !meta ? (cloud.pullMeta ? null : await cloud.pull()) : (stamp !== lastPulledStamp ? await cloud.pull() : { device: meta.device, updated_at: meta.updated_at, data: null, cached: true });
    if (row && row.data) lastPulledStamp = stamp;
    const nowMs = Date.now();
    if (row && row.data) remoteDevices = sync.otherDevices(row.data, deviceId, nowMs);
    if (row && row.data && row.device !== deviceId && Date.parse(row.updated_at) > lastRemoteAt) {
      lastRemoteAt = Date.parse(row.updated_at);
      const hadSession = Boolean(config.session && config.session.endsAt > Date.now());
      const r = sync.applyRemote(config, row.data, Date.now(), { pinSet: Boolean(config.settings.pinHash) });
      if (r.changed) {
        if (!hadSession && r.config.session && r.config.session.endsAt > Date.now()) notify(t('note.remote'), t('note.startedBody', { time: fmtClock(r.config.session.endsAt) }), 'important');
        applyingRemote = true;
        config = r.config;
        saveConfig();
        applyingRemote = false;
        applyWindowTheme();
        tick();
      }
      if (r.keptLocal) dirty = true;
    }
    const statsDue = statsSyncDirty && nowMs - lastStatsPush > 10 * 60000;
    if (dirty || !row || statsDue || statsSyncNow) {
      const devices = { ...remoteDevices, [deviceId]: sync.deviceEntry(stats, nowMs, { name: deviceName(), platform: process.platform }) };
      const at = await cloud.push(sync.buildPayload(config, deviceId, nowMs, devices), deviceId);
      if (typeof at === 'string') lastPulledStamp = `${at}|${deviceId}`;
      dirty = false;
      statsSyncDirty = false;
      statsSyncNow = false;
      lastStatsPush = nowMs;
    }
    syncState.lastSync = Date.now();
    syncState.error = null;
  } catch (e) {
    syncState.error = e.code || 'network';
    if (e.code === 'auth') cloud.signOut();
  } finally {
    syncState.busy = false;
    applyingRemote = false;
    push();
  }
}

// ------------------------------------------------------------------ leaderboard (opt-in)

let lastLbReport = 0;
let lastLbKey = '';
function mergedStatsNow() {
  return Object.keys(remoteDevices).length && cloud && cloud.signedIn() ? sync.mergeStats(stats, remoteDevices) : stats;
}
function lbReady() { return Boolean(config.settings.lbOn && cloud && cloud.enabled() && cloud.signedIn()); }
async function lbReportNow(force) {
  if (stats.lbDeletePending && cloud && cloud.enabled() && cloud.signedIn() && !config.settings.lbOn) {
    await cloud.lbDeleteMe();
    stats.lbDeletePending = false;
    statsDirty = true;
    return;
  }
  if (!lbReady()) return;
  const now = Date.now();
  const week = statsLib.thisWeek(mergedStatsNow(), now);
  const lv = levelState(now);
  const rep = {
    name: config.settings.lbName || t('lb.anon'), emoji: config.settings.lbEmoji || '🦊', public: config.settings.lbPublic === true,
    weekStart: week.start, weekMinutes: week.minutes, totalMinutes: lv.inputs.focusMin, level: lv.level, streak: statsSummary(now).streak,
  };
  const key = JSON.stringify(rep);
  if (!force && (key === lastLbKey || now - lastLbReport < 10 * 60000)) return;
  await cloud.lbReport(rep);
  lastLbKey = key;
  lastLbReport = now;
}
async function lbCall(fn) {
  if (!cloud || !cloud.enabled()) return { ok: false, error: 'notConfigured' };
  if (!cloud.signedIn()) return { ok: false, error: 'signedOut' };
  try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, error: e.code || 'server', message: String(e.message || '').slice(0, 160) }; }
}

// ------------------------------------------------------------------ earn-to-unlock

/** Earned minutes not spent yet. */
function walletBalance() {
  const w = stats.wallet || { earned: 0, spent: 0 };
  return Math.max(0, Math.floor((w.earned - w.spent) / 60));
}

/** Unlock an earn-list for `minutes` of earned time (or lock it again and get the rest back). */
function spendEarned(listId, minutes) {
  const l = config.lists.find((x) => x.id === listId && x.earn);
  if (!l) return { ok: false, error: 'generic' };
  const now = Date.now();
  config.passes = config.passes || {};
  stats.wallet = stats.wallet || { earned: 0, spent: 0 };
  if (!(minutes > 0)) {
    const until = config.passes[listId] || 0;
    if (until > now) stats.wallet.spent = Math.max(0, stats.wallet.spent - (until - now) / 1000);
    delete config.passes[listId];
  } else {
    const m = Math.min(120, Math.round(minutes));
    if (walletBalance() < m) return { ok: false, error: 'balance' };
    stats.wallet.spent += m * 60;
    config.passes[listId] = Math.max(now, config.passes[listId] || 0) + m * 60000;
  }
  statsDirty = statsSyncDirty = true;
  dirty = true;
  saveConfig();
  tick();
  return { ok: true };
}

// ------------------------------------------------------------------ Halyra AI

function aiKey() { return ai.decryptKey(config.settings.aiKeyEnc); }

function chatFile() { return path.join(app.getPath('userData'), 'assistant.json'); }
function chatHistory() {
  if (!chatLog) { const raw = readJson(chatFile()); chatLog = Array.isArray(raw && raw.log) ? raw.log.slice(-60) : []; }
  return chatLog;
}
function saveChat() { try { fs.writeFileSync(chatFile(), JSON.stringify({ log: chatLog || [] })); } catch (_) { /* ignore */ } }

/** How Halyra AI answers right now: the user's key, Halyra's server (signed in), or offline. */
function aiMode() {
  if (aiKey()) return 'key';
  if (CLOUD_CONF.url && CLOUD_CONF.ai !== false && cloud && cloud.signedIn()) return 'cloud';
  return 'offline';
}

function assistantCtx() {
  return {
    lang: lang(),
    now: () => Date.now(),
    config: () => config,
    evaluate: () => evalNow(),
    stats: () => statsSummary(Date.now()),
    startSession: (o) => startSession(o),
    stopAll: () => stopAll(),
    extendSession: (m) => extendSession(m),
    applyConfigChange: (p) => applyConfigChange(p),
    normalizeRule: (raw) => { const p = blockrules.normalizePathRule(raw); if (p) return { path: p }; const site = normalizeSite(raw); return site ? { site } : null; },
    knownApps: () => [...(installedAppsCache || []), ...PRESETS.flatMap((p) => p.apps || [])],
    helperInstalled: () => hostsState.installed,
    cleanKeywords: (k) => cfgLib.cleanKeywords(k),
    weather: (place) => assistant.weather(fetchJson, place, { lang: lang(), city: config.settings.aiCity }),
    levels: () => levelState(Date.now()),
    wallet: () => walletBalance(),
    spendEarned: (id, m) => spendEarned(id, m),
    makeTheme: async (describe) => {
      const key = aiKey();
      if (key) { try { const spec = await ai.styleSpec(key, describe); if (spec && stylegen.fromHex(spec.accent) && stylegen.fromHex(spec.bg)) return stylegen.fromSpec({ ...spec, name: spec.name || describe }, { prompt: describe }); } catch (_) { /* fall back */ } }
      return stylegen.generate(describe, 0);
    },
  };
}

async function askAssistant(text, history) {
  const ctx = assistantCtx();
  const mode = aiMode();
  if (mode !== 'offline') {
    const transport = mode === 'key' ? { kind: 'key', key: aiKey() } : { kind: 'proxy', url: `${String(CLOUD_CONF.url).replace(/\/+$/, '')}/functions/v1/halyra-ai`, token: await cloud.token(), anonKey: CLOUD_CONF.anonKey };
    const messages = [];
    for (const m of history.slice(-16)) {
      if (!m.text) continue;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      if (messages.length && messages[messages.length - 1].role === role) messages[messages.length - 1].content += `\n\n${m.text}`;
      else messages.push({ role, content: m.text });
    }
    while (messages.length && messages[0].role !== 'user') messages.shift();
    messages.push({ role: 'user', content: text });
    try {
      const r = await ai.chat(transport, { system: assistant.systemPrompt(ctx), messages, tools: assistant.TOOLS, webSearch: assistant.WEB_SEARCH, run: (name, input) => assistant.runTool(ctx, name, input) });
      return { text: r.text, sources: r.sources, actions: r.actions.filter((a) => !/^get_/.test(a.name)).map((a) => ({ name: a.name, ok: a.result && a.result.ok !== false })), via: mode };
    } catch (e) {
      // The account server isn't set up yet, or the AI allowance is used up:
      // still do the basic commands offline (other questions show the error).
      if (mode !== 'cloud' || !['noProxy', 'network', 'timeout', 'quota', 'quotaFree'].includes(e.code)) throw e;
      if (/^quota/.test(e.code) && !assistant.offline(text, lang()).handled) throw e;
    }
  }
  const o = assistant.offline(text, lang());
  if (!o.handled) return { text: assistant.offlineHelp(lang()), via: 'offline' };
  const results = [];
  for (const c of o.calls) results.push({ name: c.name, result: await assistant.runTool(ctx, c.name, c.input) });
  return { text: assistant.offlineReply(lang(), results), actions: results.filter((r) => !/^get_/.test(r.name)).map((r) => ({ name: r.name, ok: r.result && r.result.ok !== false })), via: 'offline' };
}

function deviceName() {
  try { return (platform.deviceName && platform.deviceName()) || require('os').hostname() || process.platform; } catch (_) { return process.platform; }
}

/** Stats summary: this device, or all signed-in devices together. */
function statsSummary(now) {
  const ids = Object.keys(remoteDevices);
  if (!ids.length || !(cloud && cloud.signedIn())) return { ...statsLib.summarize(stats, now), devices: 1 };
  const key = ids.map((id) => `${id}:${remoteDevices[id].at}`).join(',');
  if (mergedCache.summary && mergedCache.key === key && now - mergedCache.at < 10000) return mergedCache.summary;
  const summary = { ...statsLib.summarize(sync.mergeStats(stats, remoteDevices), now), devices: ids.length + 1 };
  mergedCache = { at: now, key, summary };
  return summary;
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

/** Level, XP and gems — from every signed-in device's stats together. */
let levelCache = { at: 0, key: '', v: null };
function levelInputsNow(now) {
  const merged = Object.keys(remoteDevices).length && cloud && cloud.signedIn() ? sync.mergeStats(stats, remoteDevices) : stats;
  const inp = statsLib.levelInputs(merged, now);
  inp.shield = (config.lists || []).some((l) => l.always);
  inp.earned = ((stats.wallet || {}).spent || 0) > 0;
  return inp;
}
function levelState(now) {
  if (levelCache.v && now - levelCache.at < 5000) return levelCache.v;
  const inp = levelInputsNow(now);
  const v = { ...LEVELS.levelOf(LEVELS.xpOf(inp), lang()), gems: LEVELS.gems(inp, lang()), inputs: inp };
  levelCache = { at: now, key: '', v };
  return v;
}
/** Level-ups and new gems get a notification (once). */
function checkLevelUp(now) {
  const v = levelState(now);
  const seen = stats.seen || (stats.seen = { level: v.level, gems: v.gems.filter((g) => g.got).map((g) => g.id) });
  if (v.level > seen.level) {
    notify(t('lvl.upTitle', { n: v.level }), t('lvl.upBody', { title: v.title }));
    lastLevelUp = { level: v.level, at: now };
  }
  const fresh = v.gems.filter((g) => g.got && !seen.gems.includes(g.id));
  for (const g of fresh.slice(0, 2)) notify(t('lvl.gemTitle', { name: g.name }), g.desc);
  if (v.level !== seen.level || fresh.length) {
    stats.seen = { level: Math.max(seen.level, v.level), gems: [...seen.gems, ...fresh.map((g) => g.id)] };
    statsDirty = true;
    if (fresh.length) lastGem = { ids: fresh.map((g) => g.id), at: now };
  }
}
let lastLevelUp = null;
let lastGem = null;

function cloudPublic() {
  return {
    enabled: Boolean(cloud && cloud.enabled()),
    signedIn: Boolean(cloud && cloud.signedIn()),
    email: cloud ? cloud.email() : null,
    lastSync: syncState.lastSync,
    error: syncState.error,
    busy: syncState.busy,
  };
}

function markSessionChange() { config.sessionChangedAt = Date.now(); }

function saveStats() {
  if (!statsDirty) return;
  statsDirty = false;
  try { writeJsonAtomic(statsPath, stats); } catch (e) { console.error('save stats', e); }
}

// Notifications are the fastest way to make a focus app annoying, so most of
// what happens is collected and shown inside the app the next time it is opened
// ("While you were away"). Only the few things you would want to know right now
// interrupt you, and even those are rate-limited.
const notices = [];           // what to show in the app when it is next opened
let lastNoticeAt = 0;         // throttle for the quiet kind
const QUIET_GAP = 20 * 60000; // at most one nice-to-know popup every 20 minutes

function noticesFor() { return notices.slice(-8); }

function notify(title, body, level = 'quiet') {
  const now = Date.now();
  notices.push({ title, body, at: now, level });
  if (notices.length > 20) notices.splice(0, notices.length - 20);
  if (win && !win.isDestroyed()) win.webContents.send('notices', noticesFor());
  const pref = config.settings.notifyLevel || 'important';
  if (!config.settings.notifications || pref === 'off' || !Notification.isSupported()) return;
  if (level !== 'important') {
    if (pref === 'important') return;
    if (now - lastNoticeAt < QUIET_GAP) return;
  }
  // Nothing to interrupt: the app is already in front of you.
  if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) return;
  lastNoticeAt = now;
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
  const ev = lastEval || evalNow(now);
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
      pathsCount: (ev.paths || []).length, allowOnly: Boolean(ev.allow && ev.allow.length),
      standing: { listIds: ev.standing.listIds, names: ev.standing.names, safe: ev.standing.safe, any: ev.standing.any },
    },
    passes: config.passes || {},
    coolDown: engine.coolDown(config, Date.now()),
    wallet: { balance: walletBalance(), earned: Math.round((stats.wallet || {}).earned || 0), spent: Math.round((stats.wallet || {}).spent || 0), ratio: config.settings.earnRatio || 3 },
    unlock: unlocker.status(),
    helper: { ...hostsState, supported: platform.IS_MAC || platform.IS_WIN, outdated: Boolean(platform.helperOutdated && hostsState.installed && platform.helperOutdated()) },
    browsers: guard ? guard.state() : null,
    stats: statsSummary(now),
    levels: levelState(now),
    season: seasonOn(now),
    levelEvent: lastLevelUp && now - lastLevelUp.at < 60000 ? lastLevelUp : null,
    gemEvent: lastGem && now - lastGem.at < 60000 ? lastGem : null,
    customThemes: (config.customThemes || []).map((t) => ({ ...t, vars: stylegen.cssVars(t) })),
    insights: currentInsights(now),
    aiModel: ai.MODEL,
    aiMode: aiMode(),
    cloud: cloudPublic(),
    lastGrown,
    usage: usageNow(now),
    ...(platform.extraState ? platform.extraState() : {}),
  };
}

function push() {
  if (win && !win.isDestroyed() && win.isVisible()) win.webContents.send('state', fullState());
}

// ------------------------------------------------------------------ blocking loop

function sitesFor(ev) {
  return expandHosts(engine.enforced(ev).sites);
}

function syncHosts(ev, force = false) {
  hostsState.installed = platform.helperInstalled();
  const hosts = sitesFor(ev);
  // The helper drops the blocks by itself at this time, so a website block can
  // never outlive its timer (even if the app is force-quit or deleted).
  const enf = engine.enforced(ev);
  const expiresAt = enf.expiresAt;
  const extra = webRules(ev);
  const key = `${hosts.join(',')}|${extra.paths.join(',')}|${(extra.allow || []).join(',')}|${expiresAt}|${enf.safe}`;
  if (hostsState.installed && (force || key !== lastHostsKey)) {
    if (platform.writeRules(hosts, expiresAt, { paths: extra.paths, allow: extra.allow || [], safe: enf.safe })) lastHostsKey = key;
  }
  hostsState.expected = hosts.length;
}

/** Rules for browser-level blocking: { sites, paths, allow } (empty when nothing is blocked). */
function webRules(ev) {
  if (!ev) return { sites: [], paths: [], allow: null, keywords: [] };
  const enf = engine.enforced(ev);
  return { sites: enf.sites, paths: enf.paths, allow: enf.allow, keywords: enf.keywords };
}

/** Data for the local block page a blocked browser tab is sent to. */
function blockPageData(q) {
  const ev = lastEval || evalNow();
  const u = /^https?:\/\//.test(q.u || '') ? q.u : `https://${String(q.site || '').replace(/^\/+/, '')}/`;
  const rules = webRules(ev);
  const hit = blockrules.urlBlocked(u, rules) || blockrules.keywordHit(u, rules.keywords) || (q.k && rules.keywords.includes(q.k) ? q.k : null);
  const limit = ev.sources.find((s) => s.type === 'limit');
  const earnList = config.lists.find((l) => l.earn && (ev.standing.listIds || []).includes(l.id)
    && blockrules.urlBlocked(u, { hosts: l.sites, paths: l.paths || [], allow: null }));
  return {
    blocked: Boolean(hit),
    earn: earnList ? { list: earnList.name, id: earnList.id, balance: walletBalance() } : null,
    kind: limit && !ev.sources.some((s) => s.type !== 'limit') ? 'limit' : 'site',
    endsAt: ev.blocking ? ev.endsAt : null,
    mode: ev.blocking ? ev.mode : null,
    block: blockInfo({ lang: lang(), theme: activeCustomTheme(), config }),
  };
}

function verifyHostsLater() {
  setTimeout(() => {
    if (!hostsState.installed) { hostsState.verified = false; return; }
    const ev = lastEval || evalNow();
    hostsState.verified = platform.verifyHosts(sitesFor(ev)).ok;
    push();
  }, platform.IS_MOBILE ? 300 : 4000);
}

let hider = null;
let hiddenPids = new Map(); // pid → app name, for the "hidden" message on Windows
function getHider() {
  if (hider === null) {
    hider = (platform.makeHider && platform.makeHider((pid) => {
      const name = hiddenPids.get(pid);
      if (name) appBlockedNotice(name, lastEval || evalNow(), 'hide');
    })) || false;
  }
  return hider || null;
}

/** Stats + the friendly message, at most every 5 s per app. */
function appBlockedNotice(name, ev, action) {
  const now = Date.now();
  if (now - (lastOverlay.get(name) || 0) < 5000) return;
  lastOverlay.set(name, now);
  statsLib.addBlock(stats, now, name);
  statsDirty = statsSyncDirty = true;
  showOverlay(name, ev, action);
}

async function enforceApps(ev) {
  if (appCheckBusy) return;
  let apps = engine.enforced(ev).apps;
  if (ev.blocking && ev.mode === 'strict' && config.settings.strictBlocksTools) apps = [...apps, ...TAMPER_TOOLS];
  // "Only these sites": browsers we cannot filter tab by tab are closed while it is on.
  if (ev.blocking && ev.allow && ev.allow.length && platform.unfilterableBrowsers) apps = [...apps, ...platform.unfilterableBrowsers()];
  const hd = getHider();
  if (!apps.length) { if (hd && hiddenPids.size) { hiddenPids = new Map(); hd.set([]); } return; }
  appCheckBusy = true;
  try {
    const hits = await platform.findBlocked(apps);
    // Chat apps (or all apps, by choice) are hidden instead of quit, so nothing is lost.
    const tools = new Set(TAMPER_TOOLS.map((a) => a.name));
    const act = (h) => (hd && !tools.has(h.app.name) ? platform.appAction(h.app, config.settings.appAction) : 'close');
    const toHide = hits.filter((h) => act(h) === 'hide');
    const toClose = hits.filter((h) => act(h) !== 'hide');
    if (hd) {
      hiddenPids = new Map(toHide.map((h) => [h.pid, h.app.name]));
      const hid = await hd.set([...hiddenPids.keys()]);
      const named = new Set(hid.map((p) => hiddenPids.get(p)).filter(Boolean));
      for (const name of named) appBlockedNotice(name, ev, 'hide');
    }
    if (!toClose.length) return;
    platform.kill(toClose.map((h) => h.pid));
    const seen = new Set();
    for (const h of toClose) {
      if (seen.has(h.app.name)) continue;
      seen.add(h.app.name);
      appBlockedNotice(h.app.name, ev, 'close');
    }
  } catch (e) {
    console.error('enforce', e);
  } finally {
    appCheckBusy = false;
  }
}

let usageBusy = false;
let lastUsageAt = 0;
async function trackUsage(ev, now) {
  const limited = (config.lists || []).filter((l) => l.limitMin > 0 && (l.apps.length || l.sites.length) && !ev.listIds.includes(l.id));
  const dt = lastUsageAt ? Math.min(10, (now - lastUsageAt) / 1000) : 0;
  lastUsageAt = now;
  if (!limited.length || usageBusy || !dt) return;
  usageBusy = true;
  try {
    const apps = limited.flatMap((l) => l.apps);
    const [hits, page] = await Promise.all([
      apps.length ? platform.findBlocked(apps) : [],
      limited.some((l) => l.sites.length) && config.settings.trackWeb !== false ? platform.activeWebPage().catch(() => null) : null,
    ]);
    const running = new Set(hits.map((h) => engine.appKey(h.app)));
    for (const l of limited) {
      if (l.apps.some((a) => running.has(engine.appKey(a))) || webusage.pageMatches(page, l.sites)) { statsLib.addUsage(stats, now, l.id, dt); statsDirty = statsSyncDirty = true; }
    }
  } catch (_) { /* ignore */ } finally { usageBusy = false; }
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
    if (s.type === 'schedule' && !prevIds.has(s.id)) notify(t('note.schedule', { name: s.name }), t('note.scheduleBody', { time: fmtClock(s.endsAt) }), 'important');
    if (s.type === 'limit' && !prevIds.has(s.id)) notify(t('note.limit', { name: s.name }), t('note.limitBody'), 'important');
  }
}

function tick() {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  tickCount += 1;

  let changed = false;
  if (config.session && now >= config.session.endsAt) {
    const s = config.session;
    const mins = Math.round((s.endsAt - s.startedAt) / 60000);
    config.session = null;
    unlocker.cancel();
    changed = true;
    statsLib.addDone(stats, s.endsAt, mins, s.startedAt);
    statsDirty = statsSyncDirty = true;
    levelCache.at = 0;
    if (s.grow && statsLib.addGrown(stats, { id: s.startedAt, t: s.endsAt, i: s.grow, m: mins, ok: true })) {
      statsDirty = statsSyncDirty = true;
      lastGrown = { id: String(s.startedAt), i: s.grow, m: mins, ok: true, at: now };
      statsSyncNow = true;
      const it = GROW.BY_ID[s.grow];
      notify(t('grow.doneTitle', { name: it.name[lang()] || it.name.en }), t('note.endedBody', { m: mins }));
    } else {
      notify(t('note.ended'), t('note.endedBody', { m: mins }), 'important');
    }
  }
  for (const [id, until] of Object.entries(config.skips || {})) {
    if (until <= now) { delete config.skips[id]; changed = true; }
  }
  if (typeof config.unlockAt === 'number') {
    if (now >= config.unlockAt + engine.COOL_WINDOW_MS) { config.unlockAt = null; changed = true; }
    else if (now - dt * 1000 < config.unlockAt && now >= config.unlockAt) notify(t('cool.readyTitle'), t('cool.readyBody'), 'important');
  }
  if (changed) saveConfig();

  const ev = evalNow(now);
  if (platform.onTick && platform.onTick({ config, ev, now, rev, lang: lang(), theme: activeCustomTheme(), stats })) statsDirty = statsSyncDirty = true;
  transitions(lastEval, ev, now);
  const blockingChanged = !lastEval || lastEval.blocking !== ev.blocking;
  lastEval = ev;

  if (ev.blocking && dt > 0) {
    statsLib.addFocus(stats, now, dt);
    statsDirty = statsSyncDirty = true;
    // Focus earns minutes for "earn" lists (only real focus: a session's work phase or a schedule).
    if (config.lists.some((l) => l.earn)) {
      stats.wallet = stats.wallet || { earned: 0, spent: 0 };
      stats.wallet.earned += Math.min(dt, 10) / (config.settings.earnRatio || 3);
    }
  }
  syncHosts(ev);
  if (guard) guard.update(webRules(ev), { blockUrl: blockPage && blockPage.url, policyOk: hostsState.installed && !(platform.helperOutdated && platform.helperOutdated()), now });
  if (blockingChanged) verifyHostsLater();
  // Chrome/Edge on Windows can keep an ended block for a few minutes (they re-read
  // their policy on their own schedule): say so once a day, so nobody is puzzled.
  if (blockingChanged && lastEval && lastEval.blocking && !ev.blocking && platform.IS_WIN && hostsState.installed
    && (lastEval.sites.length || (lastEval.paths || []).length) && now - (stats.browserLagNoted || 0) > 86400000) {
    stats.browserLagNoted = now;
    statsDirty = true;
    notify(t('note.unblocked'), t('note.browserLag'));
  }
  if (tickCount % 2 === 0 || blockingChanged) enforceApps(ev);
  if (tickCount % (platform.IS_WIN ? 6 : 2) === 1) trackUsage(ev, now);
  if (tickCount % 15 === 0) syncNow();
  if (tickCount % 15 === 1) { try { checkLevelUp(now); } catch (e) { console.error('levels', e); } }
  if (tickCount % 150 === 7) lbReportNow().catch(() => {});
  if (tickCount % 60 === 5) weeklyReport(now);
  if (tickCount % 30 === 0) { statsLib.prune(stats, now); saveStats(); }
  // Re-check while a block is running, not only when something changes: an
  // update, another tool or a crash can quietly undo the rules mid-session.
  const recheck = hostsState.installed && (!hostsState.verified ? tickCount % 10 === 0 : ev.blocking && tickCount % 120 === 3);
  if (recheck) hostsState.verified = platform.verifyHosts(sitesFor(ev)).ok;
  if (hostsState.installed && ev.blocking && ev.sites.length && !hostsState.verified) {
    if (!hostsState.failingSince) hostsState.failingSince = now;
  } else {
    hostsState.failingSince = 0;
  }

  updateTray(ev, blockingChanged || changed);
  push();
}

/** Once a week: a short summary of the last week (first time the app runs that week). */
function weeklyReport(now) {
  const w = statsLib.lastWeek(stats, now);
  if (stats.lastWeekly === w.key) return;
  const first = !stats.lastWeekly;
  stats.lastWeekly = w.key;
  statsDirty = true;
  if (first || w.minutes < 10) return;
  const h = Math.round(w.minutes / 6) / 10;
  const best = w.bestDay ? t('days.long')[w.bestDay.weekday] : '';
  notify(t('note.weekly', { h: String(h).replace('.', lang() === 'hu' ? ',' : '.') }), t('note.weeklyBody', { n: w.sessions, g: w.grown, best }));
}

// ------------------------------------------------------------------ actions

function stopAll() {
  const ev = evalNow();
  const s = config.session;
  const now = Date.now();
  // Giving up early: the tree withers / the building is left in ruins (can be turned off).
  if (s && s.grow && s.endsAt > now && now - s.startedAt >= 60000 && config.settings.growWither !== false) {
    if (statsLib.addGrown(stats, { id: s.startedAt, t: now, i: s.grow, m: (now - s.startedAt) / 60000, ok: false })) {
      statsDirty = statsSyncDirty = true;
      lastGrown = { id: String(s.startedAt), i: s.grow, m: Math.round((now - s.startedAt) / 60000), ok: false, at: now };
      statsSyncNow = true;
    }
  }
  config.session = null;
  markSessionChange();
  for (const s of ev.sources) if (s.type === 'schedule' || s.type === 'limit') config.skips[s.id] = s.endsAt;
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
  config.session = { startedAt: now, endsAt, listIds: ids, mode: m, pomodoro: pomo, goal: typeof goal === 'string' ? goal.trim().slice(0, 80) : '', grow: config.settings.growOn !== false ? config.settings.growItem : null };
  markSessionChange();
  config.settings.defaultListIds = ids;
  config.settings.defaultMode = m;
  if (!pomo) config.settings.defaultMinutes = Math.round((endsAt - now) / 60000);
  statsLib.addSession(stats, now);
  statsDirty = statsSyncDirty = true;
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
  markSessionChange();
  saveConfig();
  tick();
  return { ok: true };
}

function unlockRequest(pin) {
  const ev = evalNow();
  if (!ev.sources.length) return { status: 'stopped' };
  if (config.settings.pinHash && !cfgLib.verifyPin(config.settings, pin)) return { status: 'pin', error: Boolean(pin) };
  const r = unlocker.request(ev.mode, config.settings);
  if (r.status === 'ready') { stopAll(); return { status: 'stopped' }; }
  return { ...r, endsAt: ev.endsAt, mode: ev.mode };
}

function quitAllowed() {
  const ev = evalNow();
  return !(ev.blocking && (ev.mode !== 'flexible' || config.settings.pinHash));
}

// The app icon wears the season too: snow settles on the mark in the dock and
// on the taskbar while the winter look is on, and melts off when it is not.
let iconIsWinter = null;
function applyAppIcon() {
  const want = seasonOn(config.settings.season || 'auto') > 0;
  if (want === iconIsWinter) return;
  iconIsWinter = want;
  const file = path.join(ASSETS, want ? 'icon-winter.png' : 'icon.png');
  if (!fs.existsSync(file)) return;
  try {
    const img = nativeImage.createFromPath(file);
    if (img.isEmpty()) return;
    if (platform.IS_MAC && app.dock) app.dock.setIcon(img);
    else if (win && !win.isDestroyed()) win.setIcon(img);
  } catch (_) { /* the icon is decoration; never let it break startup */ }
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
  const ev = evalNow(now);
  if (ev.sources.length && engine.isReduction(config, candidate, now, { usage: usageNow(now) })) {
    if (ev.mode !== 'flexible') return { ok: false, error: 'locked' };
    if (config.settings.pinHash && !cfgLib.verifyPin(config.settings, pin)) return { ok: false, error: 'pin' };
  } else if (engine.standingWeakening(config, candidate, now)) {
    // Always-on lists (like the adult content shield) and earn lists are PIN-protected,
    // and with a cool-down they can only be weakened in the 24 h after the wait is over.
    if (config.settings.pinHash && !cfgLib.verifyPin(config.settings, pin)) return { ok: false, error: 'pin' };
    const cd = engine.coolDown(config, now);
    if (cd.hours > 0 && cd.state !== 'open') return { ok: false, error: 'cooldown', coolDown: cd };
  }
  const prevLogin = config.settings.launchAtLogin;
  const prevTheme = config.settings.theme;
  const prevLang = lang();
  config = candidate;
  saveConfig();
  if (prevLogin !== config.settings.launchAtLogin) applyLoginItem();
  applyAppIcon();
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
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });
  const wc = win.webContents;
  const rlog = (line) => { rendererLog.push(line); if (rendererLog.length > 60) rendererLog.shift(); if (SELFTEST) console.log(`[renderer] ${line}`); };
  wc.on('console-message', (e, level, message, line, source) => {
    const d = e && typeof e.message === 'string' ? e : { level, message, lineNumber: line, sourceId: source };
    const lv = String(d.level);
    if (lv === 'error' || lv === 'warning' || lv === '2' || lv === '3' || SELFTEST) rlog(`${lv} ${d.message} (${String(d.sourceId || '').split('/').pop()}:${d.lineNumber})`);
  });
  wc.on('preload-error', (_e, file, err) => rlog(`preload-error ${file}: ${err && err.stack}`));
  wc.on('did-fail-load', (_e, code, desc, url) => rlog(`did-fail-load ${code} ${desc} ${url}`));
  wc.on('render-process-gone', (_e, d) => rlog(`render-process-gone ${d && d.reason}`));
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
  win.on('show', () => { push(); syncSoon(); });
  win.on('focus', () => syncSoon());
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
/** A short, friendly line for a blocked app — in the app's language, festive in season. */
function friendlyLine(appName, ev, action) {
  const pick = (k) => { const a = t(k); return Array.isArray(a) && a.length ? a[Math.floor(Math.random() * a.length)] : ''; };
  const ends = ev && ev.blocking && ev.endsAt ? ev.endsAt : null;
  const vars = { app: appName, time: ends ? fmtClock(ends) : '' };
  const fill = (x) => String(x || '').replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : ''));
  const kind = ends ? (action === 'hide' ? 'hide' : 'close') : 'always';
  const festive = seasonOn() && Math.random() < 0.6;
  return fill(pick(festive ? `appmsg.xmas.${kind}` : `appmsg.${kind}`)) || t('overlay.blocked', { app: appName });
}

function seasonOn(now = Date.now()) {
  return blockinfoLib.seasonOn(config.settings.season || 'auto', now);
}

function showOverlay(appName, ev, action) {
  const line = friendlyLine(appName, ev, action);
  if (!config.settings.showOverlay) {
    notify(line, '');
    return;
  }
  if (!overlay || overlay.isDestroyed()) createOverlay();
  const area = screen.getPrimaryDisplay().workArea;
  overlay.setPosition(Math.round(area.x + (area.width - 460) / 2), Math.round(area.y + 24));
  const left = ev.endsAt ? t('overlay.leftTime', { t: fmtLeft(ev.endsAt - Date.now()) }) : '';
  const custom = activeCustomTheme();
  const quotes = t(seasonOn() ? 'quotes.xmas' : 'quotes');
  const quote = Array.isArray(quotes) ? quotes[Math.floor(Math.random() * quotes.length)] : '';
  const payload = {
    title: line, sub: `${quote} ${left}`.trim(), theme: custom ? 'custom' : config.settings.theme, festive: seasonOn(),
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
  let label = ev.standing && ev.standing.any ? t('tray.shield') : t('tray.idle');
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
  // "youtube.com/shorts" → part-of-site rule; anything else → whole site.
  handle('rules:normalize', ({ items }) => {
    const out = { sites: [], paths: [] };
    for (const raw of (Array.isArray(items) ? items : []).slice(0, 3000)) {
      const p = blockrules.normalizePathRule(raw);
      if (p) { out.paths.push(p); continue; }
      const s = normalizeSite(raw);
      if (s) out.sites.push(s);
    }
    return out;
  });

  handle('unlock:request', ({ pin }) => unlockRequest(pin));
  handle('unlock:emergency', ({ pin }) => {
    const ev = evalNow();
    if (!ev.sources.length) return { status: 'stopped' };
    if (config.settings.pinHash && !cfgLib.verifyPin(config.settings, pin)) return { status: 'pin', error: Boolean(pin) };
    return unlocker.emergency(config.settings);
  });
  handle('unlock:confirm', ({ challenge }) => {
    const ev = evalNow();
    if (!ev.sources.length) return { status: 'stopped' };
    if (ev.mode === 'flexible') return { status: 'denied' };
    if (unlocker.confirm(ev.mode, { challenge })) { stopAll(); return { status: 'stopped' }; }
    return { status: 'denied' };
  });
  handle('unlock:cancel', () => { unlocker.cancel(); return { ok: true }; });

  handle('pin:set', ({ current, next }) => {
    if (!cfgLib.verifyPin(config.settings, current)) return { ok: false, error: 'pin' };
    const ev = evalNow();
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
        return { name: a.name, mac: a.mac, win: a.win, ...(a.android ? { android: a.android } : {}), icon, running: Boolean(a.running) };
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
    syncHosts(evalNow(), true);
    verifyHostsLater();
    return { ...r, state: fullState() };
  });
  handle('helper:uninstall', async () => {
    const ev = evalNow();
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
  handle('earn:spend', ({ listId, minutes }) => spendEarned(String(listId || ''), Number(minutes) || 0));
  handle('lb:board', ({ scope, groupId }) => lbCall(async () => {
    if (config.settings.lbOn) await lbReportNow(true).catch(() => {});
    const [rows, groups] = await Promise.all([cloud.lbBoard(scope === 'group' ? 'group' : 'global', groupId || null), cloud.lbGroups()]);
    return { rows: Array.isArray(rows) ? rows : [], groups: Array.isArray(groups) ? groups : [] };
  }));
  handle('lb:create', ({ name }) => lbCall(async () => ({ group: await cloud.lbCreateGroup(String(name || '').slice(0, 40)) })));
  handle('lb:join', ({ code }) => lbCall(async () => ({ group: await cloud.lbJoin(String(code || '').replace(/[^a-z0-9]/gi, '').slice(0, 12)) })));
  handle('lb:leave', ({ groupId }) => lbCall(async () => { await cloud.lbLeave(String(groupId || '')); return {}; }));
  handle('lb:off', async () => {
    // Leaving always works locally, even if the server can't be reached right now.
    let ok = true;
    if (cloud && cloud.enabled() && cloud.signedIn()) { try { await cloud.lbDeleteMe(); } catch (_) { ok = false; } }
    stats.lbDeletePending = !ok;
    statsDirty = true;
    config.settings.lbOn = false;
    saveConfig();
    return { ok, state: fullState() };
  });
  handle('cooldown:set', ({ start }) => {
    const now = Date.now();
    const cd = engine.coolDown(config, now);
    if (start) {
      if (!cd.hours || cd.state === 'waiting' || cd.state === 'open') return { ok: true, state: fullState() };
      config.unlockAt = now + cd.hours * 3600 * 1000;
    } else {
      config.unlockAt = null;
    }
    config.unlockChangedAt = now;
    saveConfig();
    tick();
    return { ok: true, state: fullState() };
  });

  // ---------------------------------------------------------------- Halyra AI chat
  handle('ai:chatGet', () => ({ log: chatHistory(), mode: aiMode() }));
  handle('ai:chatReset', () => { chatLog = []; saveChat(); return { log: [], mode: aiMode() }; });
  handle('ai:chat', async ({ text }) => {
    const msg = String(text || '').trim().slice(0, 4000);
    if (!msg) return { ok: false, error: 'generic' };
    if (chatBusy) return { ok: false, error: 'busy' };
    chatBusy = true;
    const log = chatHistory();
    log.push({ role: 'user', text: msg, at: Date.now() });
    try {
      const reply = await askAssistant(msg, log.slice(0, -1));
      log.push({ role: 'assistant', at: Date.now(), ...reply });
    } catch (e) {
      log.push({ role: 'assistant', at: Date.now(), error: e.code || 'apiError', text: '' });
    } finally {
      chatBusy = false;
    }
    chatLog = log.slice(-60);
    saveChat();
    return { ok: true, log: chatLog, mode: aiMode(), state: fullState() };
  });

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
    const ev = evalNow(now);
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

  // ---------------------------------------------------------------- account
  const cloudCall = async (fn) => {
    try { const r = await fn(); return { ok: true, ...r, state: fullState() }; } catch (e) { return { ok: false, error: e.code || 'network', state: fullState() }; }
  };
  handle('cloud:signUp', ({ email, password }) => cloudCall(async () => {
    const r = await cloud.signUp(String(email || '').trim(), String(password || ''));
    if (r.signedIn) { lastRemoteAt = 0; lastPulledStamp = ''; await syncNow(true); }
    return r;
  }));
  handle('cloud:signIn', ({ email, password }) => cloudCall(async () => {
    await cloud.signIn(String(email || '').trim(), String(password || ''));
    lastRemoteAt = 0;
    lastPulledStamp = '';
    await syncNow(true);
    return { signedIn: true };
  }));
  handle('cloud:reset', ({ email }) => cloudCall(() => cloud.resetPassword(String(email || '').trim())));
  // Signing out would cut this computer off from a block that is running on the
  // account, so it is held back exactly as long as quitting is — no cheating.
  handle('cloud:signOut', () => {
    if (!quitAllowed()) return { ok: false, error: 'signOutLocked', state: fullState() };
    cloud.signOut(); syncState.lastSync = 0; remoteDevices = {}; lastPulledStamp = '';
    return { ok: true, state: fullState() };
  });
  handle('cloud:syncNow', async () => { dirty = true; lastPulledStamp = ''; await syncNow(true); return { ok: !syncState.error, error: syncState.error, state: fullState() }; });

  handle('app:open-external', ({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { ok: true }; });
  handle('app:quit', () => ({ ok: tryQuit() }));
  // Platform-specific actions (phones: permissions, battery settings …).
  if (platform.handlers) {
    const hs = platform.handlers({ fullState: () => fullState(), tick: () => tick(), t });
    handle('platform:call', async ({ name, arg }) => (hs[name] ? hs[name](arg || {}) : { ok: false, error: 'generic' }));
  }
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

  const devFile = path.join(dir, 'device-id');
  try { deviceId = fs.readFileSync(devFile, 'utf8').trim(); } catch (_) { deviceId = ''; }
  if (!deviceId) { deviceId = cfgLib.uid(); try { fs.writeFileSync(devFile, deviceId); } catch (_) { /* ignore */ } }
  cloud = new CloudClient(CLOUD_CONF, cloudStore());

  if (platform.IS_WIN) app.setAppUserModelId(BRAND.appId);
  app.setAboutPanelOptions && app.setAboutPanelOptions({ applicationName: BRAND.name, copyright: '© Halyra', website: BRAND.website });

  if (platform.IS_MAC && app.isPackaged) {
    try { if (app.getLoginItemSettings().wasOpenedAtLogin) startHidden = true; } catch (_) { /* ignore */ }
  }
  if (platform.startBlockServer) {
    blockPage = platform.startBlockServer({ root: path.join(__dirname, '..', 'renderer'), data: (q) => blockPageData(q), actions: { spend: (id, m) => spendEarned(String(id || ''), m) } });
  }
  if (platform.createBrowserGuard) {
    guard = platform.createBrowserGuard({ log: (m) => console.log(m) });
    guard.onHit = (site) => { statsLib.addBlock(stats, Date.now(), site); statsDirty = statsSyncDirty = true; };
  }
  try { if (!SELFTEST) app.setAsDefaultProtocolClient('halyrafocus'); } catch (_) { /* ignore */ }
  ipc();
  buildAppMenu();
  applyLoginItem();
  applyAppIcon();
  tray = new Tray(trayIcon());
  tray.on('click', () => { if (!platform.IS_MAC) showWindow(); });
  createWindow();
  if (startHidden && platform.IS_MAC && app.dock) app.dock.hide();

  lastHostsKey = null;
  tick();
  verifyHostsLater();
  setInterval(tick, 1000);
  setTimeout(syncNow, 3000);
  // Waking or unlocking the computer checks the account at once (the network needs a moment after sleep).
  if (powerMonitor && powerMonitor.on) {
    powerMonitor.on('resume', () => setTimeout(() => syncSoon(0), 5000));
    powerMonitor.on('unlock-screen', () => syncSoon());
  }
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
    rendererLog: () => rendererLog.slice(),
    browserState: () => (guard ? guard.state() : null),
    evaluate: () => evalNow(),
    blockCount: (name) => Object.values(stats.days).reduce((n, d) => n + (d.blocks[name] || 0), 0),
  };
  const watchdog = setTimeout(() => { console.error('[selftest] timed out'); app.exit(2); }, 10 * 60000);
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
  app.on('open-url', (e) => { if (e && e.preventDefault) e.preventDefault(); if (app.isReady()) showWindow(); });
  app.whenReady().then(boot);
  app.on('activate', () => showWindow());
  app.on('window-all-closed', (e) => { if (e && e.preventDefault) e.preventDefault(); });
  app.on('before-quit', () => { app.isQuittingForReal = true; });
  app.on('will-quit', () => {
    try {
      saveStats();
      const ev = evalNow();
      // Quitting from a flexible block means "turn it off". Non-flexible blocks
      // keep websites blocked even if the app is force-closed.
      if (!ev.blocking || (ev.mode === 'flexible' && !config.settings.pinHash)) {
        if (platform.helperInstalled()) platform.writeRules([]);
      }
      if (guard) guard.stop();
    } catch (_) { /* best effort */ }
  });
}
