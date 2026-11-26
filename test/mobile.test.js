'use strict';
// Phone: the blocking plan the native service enforces, and the bundled backend.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const path = require('path');
const cfg = require('../src/core/config');
const { buildPlan, activeAt, TAMPER } = require('../src/mobile/plan');

const MON_10 = new Date(2026, 10, 23, 10, 0, 0).getTime(); // Monday 10:00

test('plan: weekday schedule becomes exact windows for five weeks, with phone apps and site hosts', () => {
  const c = cfg.defaults('hu');
  const social = c.lists.find((l) => l.presetId === 'social');
  c.schedules = [{ id: 'work', name: 'Munka', enabled: true, days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00', listIds: [social.id], mode: 'patient' }];
  const p = buildPlan(c, MON_10);
  assert.equal(p.windows[0].from, MON_10, 'active now');
  assert.equal(p.windows[0].to, new Date(2026, 10, 23, 17, 0).getTime());
  assert.equal(p.windows[1].from, new Date(2026, 10, 24, 9, 0).getTime());
  assert.ok(p.windows.length >= 24 && p.windows.length <= 26, `${p.windows.length} windows`);
  assert.ok(p.windows[0].packages.includes('com.instagram.android'));
  assert.ok(p.windows[0].domains.includes('instagram.com') && p.windows[0].domains.includes('www.instagram.com'));
  assert.equal(p.windows[0].mode, 'patient');
  // weekends are free
  const sat = new Date(2026, 10, 28, 12, 0).getTime();
  assert.equal(activeAt(p, sat).packages.length, 0);
  assert.ok(activeAt(p, new Date(2026, 10, 27, 16, 59).getTime()).packages.includes('com.instagram.android'));
});

test('plan: Pomodoro breaks are not blocked; strict + "block tools" adds Settings and the Play Store', () => {
  const c = cfg.defaults('en');
  c.settings.strictBlocksTools = true;
  c.schedules = [];
  c.session = { startedAt: MON_10, endsAt: MON_10 + (2 * 30 - 5) * 60000, listIds: [c.lists[0].id], mode: 'strict', pomodoro: { work: 25, brk: 5, cycles: 2 } };
  const p = buildPlan(c, MON_10);
  assert.equal(p.windows.length, 2);
  assert.equal(p.windows[0].to - p.windows[0].from, 25 * 60000);
  assert.equal(p.windows[1].from, MON_10 + 30 * 60000);
  for (const pk of TAMPER) assert.ok(p.windows[0].packages.includes(pk));
  assert.equal(activeAt(p, MON_10 + 27 * 60000).packages.length, 0, 'break');
});

test('plan: a skipped schedule (unlocked) resumes when the skip ends; limits block by app time', () => {
  const c = cfg.defaults('en');
  c.schedules = [{ id: 's1', name: 'Evening', enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: '09:00', end: '12:00', listIds: [c.lists[0].id], mode: 'flexible' }];
  c.skips = { s1: MON_10 + 30 * 60000 };
  c.lists[1].limitMin = 30;
  const p = buildPlan(c, MON_10);
  assert.equal(p.windows[0].from, MON_10 + 30 * 60000);
  assert.equal(p.skips.s1, MON_10 + 30 * 60000);
  const lim = p.limits.find((l) => l.listId === c.lists[1].id);
  assert.equal(lim.limitSec, 1800);
  assert.ok(lim.packages.includes('com.google.android.youtube'));
  const before = activeAt(p, MON_10 + 5 * 60000, { 'com.google.android.youtube': 1700 });
  assert.ok(!before.packages.includes('com.google.android.youtube'));
  const after = activeAt(p, MON_10 + 5 * 60000, { 'com.google.android.youtube': 1500, 'com.netflix.mediaclient': 400 });
  assert.ok(after.packages.includes('com.google.android.youtube') && after.domains.includes('youtube.com'));
  assert.equal(after.endsAt, new Date(2026, 10, 24).getTime(), 'until midnight');
});

test('phone backend bundle: the desktop app logic runs unchanged on the phone shims', async () => {
  const { bundle } = require('../tools/build-android-web');
  const code = bundle('src/mobile/boot.js');
  const store = {};
  const plans = [];
  const listeners = {};
  const win = {
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    HalyraNative: {
      readFile: (n) => store[n] ?? null, writeFile: (n, d) => { store[n] = d; return true; }, removeFile: (n) => { delete store[n]; return true; },
      locale: () => 'hu-HU', appVersion: () => '9.9.9', kdf: (pw, salt) => require('crypto').pbkdf2Sync(pw, salt, 1000, 32, 'sha256').toString('hex'),
      permissions: () => JSON.stringify({ usage: true, overlay: true, vpn: true, notifications: true, battery: true }),
      usageToday: () => '{}', setPlan: (p) => { plans.push(JSON.parse(p)); return true; }, takeStats: () => JSON.stringify({ blocks: [[Date.now(), 'TikTok']], focus: [] }),
      notify: () => true, setChrome: () => true,
    },
  };
  const ctx = {
    document: { documentElement: { classList: { add() {} } }, visibilityState: 'visible' }, navigator: { language: 'hu-HU' },
    console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, structuredClone, TextEncoder, TextDecoder, URL, atob, btoa, fetch: async () => { throw new Error('offline'); },
    crypto: require('crypto').webcrypto, Promise, Date, Math, JSON,
  };
  Object.assign(ctx, win);
  ctx.globalThis = ctx;
  ctx.window = ctx; // in a browser, window is the global object
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'backend.js' });
  await new Promise((r) => setTimeout(r, 50));
  const api = ctx.window.api;
  assert.ok(api && typeof api.getState === 'function', 'window.api exposed like Electron preload');
  const s = await api.getState();
  assert.equal(s.platform, 'android');
  assert.equal(s.version, '9.9.9');
  assert.equal(s.lang, 'hu');
  assert.equal(s.mobile.perms.usage, true);
  const r = await api.startSession({ listIds: [s.lists[0].id], minutes: 30, mode: 'strict' });
  assert.equal(r.ok, true);
  assert.ok(plans.length > 0, 'plan pushed to the native service');
  const last = plans[plans.length - 1];
  assert.equal(last.windows[0].mode, 'strict');
  assert.ok(last.windows[0].packages.includes('com.instagram.android'));
  assert.equal(last.block.texts.title, 'Most tiltva van');
  // the PIN uses the native KDF and verifies
  assert.equal((await api.setPin({ current: '', next: '2468' })).ok, true);
  assert.ok(JSON.parse(store['config.json']).settings.pinHash.length === 64);
  // a strict block can't be stopped from the phone either
  const u = await api.unlockRequest({ pin: '2468' });
  assert.notEqual(u.status, 'stopped');
});
