#!/usr/bin/env node
'use strict';
// Builds a browser preview of the app UI with a fake `window.api`, so the UI can
// be designed and screenshotted without Electron:
//   node tools/ui-preview.js <outDir>   then open <outDir>/renderer/index.html#scenario=active&view=focus&theme=crt
const fs = require('fs');
const path = require('path');
const cfg = require('../src/core/config');
const engine = require('../src/core/engine');
const statsLib = require('../src/core/stats');
const { PRESETS } = require('../src/core/presets');
const stylegen = require('../src/core/stylegen');
const coach = require('../src/core/coach');

const out = path.resolve(process.argv[2] || 'preview');
const root = path.join(__dirname, '..', 'src');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'renderer'), path.join(out, 'renderer'), { recursive: true });
fs.cpSync(path.join(root, 'shared'), path.join(out, 'shared'), { recursive: true });

const NOW = new Date(2026, 10, 25, 14, 12, 30).getTime(); // Wed 14:12:30

function rawStats() {
  const st = statsLib.emptyStats();
  const mins = [95, 140, 60, 180, 125, 40, 85];
  mins.forEach((m, i) => {
    const t = NOW - (6 - i) * 86400000;
    for (let s = 0; s < m * 6; s += 1) statsLib.addFocus(st, t, 10);
  });
  for (let d = 0; d < 6; d += 1) for (let i = 0; i < 3; i += 1) statsLib.addBlock(st, new Date(2026, 10, 25 - d, 21, 15).getTime(), 'Steam');
  return st;
}

function fakeStats() {
  const st = statsLib.emptyStats();
  const mins = [95, 140, 60, 180, 125, 40, 85];
  mins.forEach((m, i) => {
    const t = NOW - (6 - i) * 86400000;
    for (let s = 0; s < m * 6; s += 1) statsLib.addFocus(st, t, 10);
  });
  const blocks = { 'reddit.com': 14, Steam: 9, 'youtube.com': 22, Discord: 6, 'instagram.com': 11, Roblox: 3 };
  for (const [k, n] of Object.entries(blocks)) for (let i = 0; i < n; i += 1) statsLib.addBlock(st, NOW - (i % 5) * 86400000, k);
  for (let i = 0; i < 7; i += 1) statsLib.addBlock(st, NOW, 'youtube.com');
  for (let i = 0; i < 4; i += 1) statsLib.addBlock(st, NOW, 'Steam');
  return statsLib.summarize(st, NOW);
}

function state(lang, mutate) {
  const c = cfg.defaults(lang);
  c.settings.onboarded = true;
  c.lists.push(cfg.presetToList(PRESETS.find((p) => p.id === 'news'), lang));
  c.schedules[0].enabled = true;
  c.schedules.push({ id: 'night', name: lang === 'hu' ? 'Esti lazítás tilalom' : 'Wind-down', listIds: [c.lists[0].id, c.lists[1].id, c.lists[2].id], days: [0, 1, 2, 3, 4, 5, 6], start: '22:30', end: '07:00', mode: 'patient', enabled: true });
  c.schedules.push({ id: 'weekend', name: lang === 'hu' ? 'Hétvégi gaming-szünet' : 'Weekend detox', listIds: [c.lists[2].id], days: [6, 0], start: '00:00', end: '00:00', mode: 'flexible', enabled: false });
  if (mutate) mutate(c);
  if (!c.customThemes) c.customThemes = [];
  if (!c._noCustom) {
    c.customThemes.push(stylegen.generate(lang === 'hu' ? 'Neon tokiói éjszaka' : 'Neon Tokyo night'));
    c.customThemes.push(stylegen.generate(lang === 'hu' ? 'Erdei nyugalom' : 'Calm forest'));
  }
  const ev = engine.evaluate(c, NOW, { usage: c._usage || {} });
  const { pinHash, pinSalt, aiKeyEnc, ...settings } = c.settings;
  return {
    now: NOW, rev: 1, platform: 'darwin', version: '1.0.0', lang,
    lists: c.lists, schedules: c.schedules, settings: { ...settings, hasPin: false, hasAiKey: false }, session: c.session,
    customThemes: c.customThemes.map((x) => ({ ...x, vars: stylegen.cssVars(x) })), aiModel: 'claude-haiku-5-5',
    insights: coach.insights(rawStats(), c, NOW, lang),
    eval: { blocking: ev.blocking, mode: ev.mode, sources: ev.sources, endsAt: ev.endsAt, next: ev.next, sitesCount: ev.sites.length, appsCount: ev.apps.length, listIds: ev.listIds },
    unlock: null, helper: { installed: true, verified: true, expected: 10, supported: true }, stats: fakeStats(),
    cloud: c._cloud || { enabled: true, signedIn: false, email: null, lastSync: 0, error: null },
    usage: c._usage || {},
  };
}

const scenarios = {};
for (const lang of ['en', 'hu']) {
  scenarios[`idle-${lang}`] = state(lang, (c) => { c.schedules[0].enabled = false; });
  scenarios[`active-${lang}`] = state(lang, (c) => {
    c.session = { startedAt: NOW - 17 * 60000 - 12000, endsAt: NOW + 33 * 60000 + 48000, listIds: [c.lists[0].id, c.lists[1].id, c.lists[2].id], mode: 'patient', pomodoro: null };
  });
  scenarios[`pomo-${lang}`] = state(lang, (c) => {
    c.schedules[0].enabled = false;
    c.session = { startedAt: NOW - 11 * 60000, endsAt: NOW - 11 * 60000 + (4 * 30 - 5) * 60000, listIds: [c.lists[0].id, c.lists[3].id], mode: 'strict', pomodoro: { work: 25, brk: 5, cycles: 4 } };
  });
  scenarios[`custom-${lang}`] = state(lang, (c) => {
    const th = stylegen.generate(lang === 'hu' ? 'Neon tokiói éjszaka' : 'Neon Tokyo night');
    c.customThemes = [th, stylegen.generate(lang === 'hu' ? 'Erdei nyugalom' : 'Calm forest')];
    c._noCustom = true;
    c.settings.theme = `custom:${th.id}`;
    c.session = { startedAt: NOW - 17 * 60000 - 12000, endsAt: NOW + 33 * 60000 + 48000, listIds: [c.lists[0].id, c.lists[1].id, c.lists[2].id], mode: 'patient', pomodoro: null, goal: lang === 'hu' ? 'Roblox játék programozása' : 'Coding my Roblox game' };
  });
  scenarios[`synced-${lang}`] = state(lang, (c) => {
    c.schedules[0].enabled = false;
    c.lists[0].limitMin = 45; c.lists[1].limitMin = 60;
    c._usage = { [c.lists[0].id]: 31 * 60 + 20, [c.lists[1].id]: 12 * 60 };
    c.settings.focusSound = 'rain';
    c._cloud = { enabled: true, signedIn: true, email: 'anna@halyra.app', lastSync: NOW - 40000, error: null };
  });
  scenarios[`remote-${lang}`] = state(lang, (c) => {
    c.schedules[0].enabled = false;
    c.session = { startedAt: NOW - 17 * 60000 - 12000, endsAt: NOW + 33 * 60000 + 48000, listIds: [c.lists[0].id, c.lists[1].id], mode: 'strict', pomodoro: null };
    c.settings.focusSound = 'rain';
    c._cloud = { enabled: true, signedIn: true, email: 'anna@halyra.app', lastSync: NOW - 20000, error: null };
  });
  scenarios[`limit-${lang}`] = state(lang, (c) => {
    c.schedules[0].enabled = false;
    c.lists[0].limitMin = 30;
    c._usage = { [c.lists[0].id]: 30 * 60 + 5 };
    c._cloud = { enabled: true, signedIn: true, email: 'anna@halyra.app', lastSync: NOW - 40000, error: null };
  });
  scenarios[`nohelper-${lang}`] = { ...scenarios[`idle-${lang}`], helper: { installed: false, verified: false, supported: true }, settings: { ...scenarios[`idle-${lang}`].settings, onboarded: false } };
}

const wrap = (file) => `(function(){const module={exports:{}};const exports=module.exports;${fs.readFileSync(path.join(root, 'core', file), 'utf8').replace(/require\(['"]\.\/(\w+)['"]\)/g, (m, n) => `__mods.${n}`)};return module.exports;})()`;
const mock = `'use strict';
var __mods = {};
__mods.stylegen = ${wrap('stylegen.js')};
__mods.stats = ${wrap('stats.js')};
__mods.coach = ${wrap('coach.js')};
(function(){
  const SC = ${JSON.stringify(scenarios)};
  const PRESETS = ${JSON.stringify(PRESETS)};
  const q = new URLSearchParams(location.hash.slice(1));
  const S = JSON.parse(JSON.stringify(SC[q.get('scenario') || 'idle-en']));
  if (q.get('theme')) S.settings.theme = q.get('theme');
  if (q.get('platform')) S.platform = q.get('platform');
  let push = null;
  const ok = async () => ({ ok: true, state: S });
  window.api = {
    getState: async () => S, getPresets: async () => PRESETS,
    setConfig: async (patch) => { if (patch.lists) S.lists = patch.lists; if (patch.schedules) S.schedules = patch.schedules; if (patch.settings) Object.assign(S.settings, patch.settings); S.rev++; return { ok: true, state: JSON.parse(JSON.stringify(S)) }; },
    startSession: ok, extendSession: ok, normalizeSites: async (a) => a.map((x) => x.toLowerCase().replace(/^https?:\\/\\//, '').replace(/^www\\./, '').split('/')[0]),
    unlockRequest: async () => (q.get('unlock') === 'wait' ? { status: 'wait', readyAt: S.now + 42000 } : { status: 'locked', endsAt: S.eval.endsAt }), unlockEmergency: async () => ({ status: 'challenge' }), unlockConfirm: async () => ({ status: 'denied' }), unlockCancel: ok,
    setPin: ok, installedApps: async () => [
      { name: 'Discord', mac: ['Discord'], win: [], icon: null }, { name: 'Steam', mac: ['Steam'], win: [], icon: null, running: true },
      { name: 'Slack', mac: ['Slack'], win: [], icon: null }, { name: 'Spotify', mac: ['Spotify'], win: [], icon: null },
      { name: 'Telegram', mac: ['Telegram'], win: [], icon: null }, { name: 'Minecraft', mac: ['Minecraft'], win: [], icon: null }],
    generateStyle: async ({ prompt, seed }) => { const th = __mods.stylegen.generate(prompt, seed || 0); return { ok: true, source: 'offline', theme: { ...th, vars: __mods.stylegen.cssVars(th) } }; },
    previewStyle: async ({ theme }) => { const th = __mods.stylegen.sanitizeTheme(theme); return th ? { ok: true, theme: { ...th, vars: __mods.stylegen.cssVars(th) } } : { ok: false }; },
    saveStyle: async ({ theme }) => { const th = __mods.stylegen.sanitizeTheme(theme); S.customThemes = [{ ...th, vars: __mods.stylegen.cssVars(th) }, ...S.customThemes.filter((x) => x.id !== th.id)]; S.settings.theme = 'custom:' + th.id; S.rev++; return { ok: true, state: JSON.parse(JSON.stringify(S)) }; },
    deleteStyle: ok, setAiKey: ok, removeAiKey: ok, applyInsight: ok,
    cloudSignIn: async ({ email }) => { S.cloud = { enabled: true, signedIn: true, email, lastSync: S.now, error: null }; S.rev++; return { ok: true, state: JSON.parse(JSON.stringify(S)) }; },
    cloudSignUp: async () => ({ ok: true, needsConfirm: true, state: S }), cloudReset: ok, cloudSyncNow: ok,
    cloudSignOut: async () => { S.cloud = { enabled: true, signedIn: false, email: null, lastSync: 0, error: null }; S.rev++; return { ok: true, state: JSON.parse(JSON.stringify(S)) }; },
    coachSuggest: async ({ goal }) => { const r = __mods.coach.suggestSetup(goal, S.lang); return { ok: true, source: 'offline', listIds: S.lists.filter((l) => r.presets.includes(l.presetId)).map((l) => l.id), minutes: r.minutes, pomodoro: r.pomodoro, mode: r.mode, reason: r.reason }; },
    coachLine: async () => ({ text: __mods.coach.coachLine({ goal: S.session && S.session.goal, leftMs: 33 * 60000, totalMs: 51 * 60000, streak: S.stats.streak, todayMin: 20 }, S.lang), streak: S.stats.streak }),
    browseApps: async () => [], installHelper: ok, uninstallHelper: ok, exportConfig: ok, importConfig: ok, openExternal: ok, quit: ok,
    onState: (cb) => { push = cb; return () => {}; }, onToast: () => () => {}, onNavigate: () => () => {}, onOpenUnlock: () => () => {}, onOverlay: () => () => {},
  };
  window.__open = q.get('open');
  setTimeout(() => {
    const v = q.get('view');
    if (v) { const b = [...document.querySelectorAll('.nav-btn')][['focus','lists','schedules','stats','settings'].indexOf(v)]; if (b) b.click(); }
    if (q.get('open') === 'list') { const c = document.querySelector('.list-card'); if (c) c.click(); }
    if (q.get('open') === 'schedule') { const c = document.querySelector('.sched-card .btn'); if (c) c.click(); }
    if (q.get('open') === 'studio') { const c = document.querySelector('.theme-card.new-style'); if (c) c.click(); setTimeout(() => { const chip = document.querySelectorAll('.studio .chip')[+(q.get('ex') || 0)]; if (chip) chip.click(); }, 200); }
    if (q.get('open') === 'smart') { const i = document.querySelector('[data-fid=goal]'); if (i) { i.value = q.get('goal') || 'Vizsgára tanulok'; i.dispatchEvent(new Event('input')); i.nextSibling.click(); } }
    if (q.get('open') === 'unlock') { const b = document.querySelector('.btn.danger'); if (b) b.click(); }
  }, 150);
})();
`;
fs.writeFileSync(path.join(out, 'renderer', 'mock.js'), mock);
const html = fs.readFileSync(path.join(out, 'renderer', 'index.html'), 'utf8').replace('<script src="../shared/brand.js"></script>', '<script src="mock.js"></script>\n  <script src="../shared/brand.js"></script>');
fs.writeFileSync(path.join(out, 'renderer', 'index.html'), html);
console.log('preview at', path.join(out, 'renderer', 'index.html'));
