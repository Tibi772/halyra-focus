'use strict';
// The phone counterpart of src/main/platform.js. Blocking itself is done by the
// native service (it keeps working while the UI is closed); this module feeds it
// a plan and reports permissions/app usage back to the shared app code.
const n = require('./shims/native');
const electron = require('./shims/electron');
const { buildPlan } = require('./plan');
const { blockInfo } = require('../core/blockinfo');
const I18N = require('../shared/i18n');
const statsLib = require('../core/stats');

let permsCache = { at: 0, v: null };
function perms(force) {
  const now = Date.now();
  if (force || !permsCache.v || now - permsCache.at > 1500) {
    permsCache = { at: now, v: n.json('permissions') || { usage: false, overlay: false, vpn: false, notifications: false, battery: false, preview: !n.available } };
  }
  return permsCache.v;
}

let usageCache = { at: 0, key: '', v: {} };
function usageToday(config, now) {
  const lists = (config.lists || []).filter((l) => l.limitMin > 0);
  if (!lists.length) return {};
  const pk = [...new Set(lists.flatMap((l) => l.apps.flatMap((a) => a.android || [])))].sort();
  const key = pk.join(',');
  if (now - usageCache.at > 15000 || key !== usageCache.key) {
    usageCache = { at: now, key, v: (pk.length && n.json('usageToday', JSON.stringify(pk))) || {} };
  }
  const out = {};
  for (const l of lists) out[l.id] = (l.apps || []).flatMap((a) => a.android || []).reduce((s, p) => s + (usageCache.v[p] || 0), 0);
  return out;
}

let lastPlanKey = '';
let lastSent = 0;
let lastCheck = 0;
let lastRev = -1;
let lastMerge = 0;
/** Blocks and focus time the native service recorded while the UI was closed. */
function mergeNativeStats(stats, now) {
  if (!stats || now - lastMerge < 10000) return false;
  lastMerge = now;
  const d = n.json('takeStats');
  if (!d) return false;
  let changed = false;
  for (const [ts, name] of d.blocks || []) { statsLib.addBlock(stats, ts, String(name)); changed = true; }
  for (const [ts, ms] of d.focus || []) { if (ms > 0) { statsLib.addFocus(stats, ts, ms / 1000); changed = true; } }
  return changed;
}

function onTick({ config, now, rev, lang, theme, stats }) {
  const statsChanged = mergeNativeStats(stats, now);
  pushPlan({ config, now, rev, lang, theme });
  return statsChanged;
}

function pushPlan({ config, now, rev, lang, theme }) {
  if (rev === lastRev && now - lastCheck < 60000) return;
  lastRev = rev;
  lastCheck = now;
  const plan = buildPlan(config, now, { block: blockInfo({ lang, theme, config }) });
  // Active windows start "now" on every rebuild; round that away so an unchanged
  // plan isn't re-sent every minute.
  const hour = Math.floor(now / 3600000) * 3600000;
  const key = JSON.stringify({ ...plan, generatedAt: 0, windows: plan.windows.map((w) => ({ ...w, from: Math.max(w.from, hour) })) });
  if (key === lastPlanKey && now - lastSent < 30 * 60000) return;
  lastPlanKey = key;
  lastSent = now;
  n.call('setPlan', JSON.stringify(plan));
}

async function listInstalledApps() {
  const list = (await n.async('installedApps')) || [];
  return list.map((a) => {
    const p = `android:${a.pkg}`;
    if (a.icon) electron.__icons.set(p, a.icon);
    return { name: a.name, mac: [], win: [], android: [a.pkg], path: p, running: false };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function handlers({ fullState }) {
  return {
    permission: async ({ kind }) => {
      await n.async('requestPermission', String(kind || ''));
      perms(true);
      return { ok: true, state: fullState() };
    },
    refresh: () => { perms(true); usageCache.at = 0; return { ok: true, state: fullState() }; },
  };
}

module.exports = {
  IS_MAC: false,
  IS_WIN: false,
  IS_MOBILE: true,
  findBlocked: async () => [],
  activeWebPage: async () => null,
  kill() {},
  makeHider: () => null, // phones block apps with their own full-screen page
  appAction: () => 'close',
  listInstalledApps,
  appFromPath: () => null,
  helperInstalled: () => Boolean(perms().vpn),
  writeRules: () => true,
  verifyHosts: () => ({ ok: true }),
  installHelper: async () => { await n.async('requestPermission', 'vpn'); return { ok: Boolean(perms(true).vpn) }; },
  uninstallHelper: async () => ({ ok: true }),
  rulesPath: () => '',
  hostsPath: () => '',
  usageToday,
  onTick,
  extraState: () => ({ mobile: { perms: perms(), native: n.available } }),
  handlers,
};
