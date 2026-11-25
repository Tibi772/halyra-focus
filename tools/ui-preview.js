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

const out = path.resolve(process.argv[2] || 'preview');
const root = path.join(__dirname, '..', 'src');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'renderer'), path.join(out, 'renderer'), { recursive: true });
fs.cpSync(path.join(root, 'shared'), path.join(out, 'shared'), { recursive: true });

const NOW = new Date(2026, 10, 25, 14, 12, 30).getTime(); // Wed 14:12:30

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
  const ev = engine.evaluate(c, NOW);
  const { pinHash, pinSalt, ...settings } = c.settings;
  return {
    now: NOW, rev: 1, platform: 'darwin', version: '1.0.0', lang,
    lists: c.lists, schedules: c.schedules, settings: { ...settings, hasPin: false }, session: c.session,
    eval: { blocking: ev.blocking, mode: ev.mode, sources: ev.sources, endsAt: ev.endsAt, next: ev.next, sitesCount: ev.sites.length, appsCount: ev.apps.length, listIds: ev.listIds },
    unlock: null, helper: { installed: true, verified: true, expected: 10, supported: true }, stats: fakeStats(),
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
  scenarios[`nohelper-${lang}`] = { ...scenarios[`idle-${lang}`], helper: { installed: false, verified: false, supported: true }, settings: { ...scenarios[`idle-${lang}`].settings, onboarded: false } };
}

const mock = `'use strict';
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
    unlockRequest: async () => ({ status: 'locked', endsAt: S.eval.endsAt }), unlockEmergency: async () => ({ status: 'challenge' }), unlockConfirm: async () => ({ status: 'denied' }), unlockCancel: ok,
    setPin: ok, installedApps: async () => [
      { name: 'Discord', mac: ['Discord'], win: [], icon: null }, { name: 'Steam', mac: ['Steam'], win: [], icon: null, running: true },
      { name: 'Slack', mac: ['Slack'], win: [], icon: null }, { name: 'Spotify', mac: ['Spotify'], win: [], icon: null },
      { name: 'Telegram', mac: ['Telegram'], win: [], icon: null }, { name: 'Minecraft', mac: ['Minecraft'], win: [], icon: null }],
    browseApps: async () => [], installHelper: ok, uninstallHelper: ok, exportConfig: ok, importConfig: ok, openExternal: ok, quit: ok,
    onState: (cb) => { push = cb; return () => {}; }, onToast: () => () => {}, onNavigate: () => () => {}, onOpenUnlock: () => () => {}, onOverlay: () => () => {},
  };
  window.__open = q.get('open');
  setTimeout(() => {
    const v = q.get('view');
    if (v) { const b = [...document.querySelectorAll('.nav-btn')][['focus','lists','schedules','stats','settings'].indexOf(v)]; if (b) b.click(); }
    if (q.get('open') === 'list') { const c = document.querySelector('.list-card'); if (c) c.click(); }
    if (q.get('open') === 'schedule') { const c = document.querySelector('.sched-card .btn'); if (c) c.click(); }
  }, 150);
})();
`;
fs.writeFileSync(path.join(out, 'renderer', 'mock.js'), mock);
const html = fs.readFileSync(path.join(out, 'renderer', 'index.html'), 'utf8').replace('<script src="../shared/brand.js"></script>', '<script src="mock.js"></script>\n  <script src="../shared/brand.js"></script>');
fs.writeFileSync(path.join(out, 'renderer', 'index.html'), html);
console.log('preview at', path.join(out, 'renderer', 'index.html'));
