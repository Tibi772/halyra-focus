'use strict';
// Cross-device sync payloads (pure logic, unit-tested). What syncs:
// block lists, schedules, custom styles, preferences and the running focus
// session — so starting a block on one computer starts it on all of them —
// plus a compact copy of each device's stats and grown forest, so every device
// and the web app can show the totals. Never synced: PIN, AI key, helper state.
const cfgLib = require('./config');
const engine = require('./engine');

const SYNC_SETTINGS = ['theme', 'lang', 'defaultMode', 'defaultMinutes', 'defaultListIds', 'patientDelaySec', 'emergencyDelaySec', 'challengeLength', 'strictBlocksTools', 'showOverlay', 'notifications', 'sound', 'growOn', 'growItem', 'growWither', 'focusSound', 'soundAuto'];
const statsLib = require('./stats');

const DEVICE_DAYS = 120;

/** Compact copy of one device's stats for the sync row (~10–40 KB). */
function deviceEntry(stats, nowMs, { name = '', platform = '' } = {}) {
  const cutoff = statsLib.dayKey(nowMs - DEVICE_DAYS * 86400000);
  const days = {};
  for (const [k, v] of Object.entries(stats.days || {})) {
    if (k < cutoff) continue;
    const b = Object.entries(v.blocks || {}).sort((x, y) => y[1] - x[1]).slice(0, 8);
    days[k] = { f: Math.round(v.focusSec || 0), s: v.sessions || 0, b: Object.fromEntries(b) };
  }
  return { name: String(name).slice(0, 60), platform, at: nowMs, days, garden: (stats.garden || []).slice(-600) };
}

/** Other devices' entries from the row (drops ours and ones silent for 120 days). */
function otherDevices(remote, deviceId, nowMs) {
  const out = {};
  const devs = remote && remote.devices && typeof remote.devices === 'object' ? remote.devices : {};
  for (const [id, d] of Object.entries(devs)) {
    if (id === deviceId || !d || typeof d !== 'object') continue;
    if (!(d.at > nowMs - DEVICE_DAYS * 86400000)) continue;
    out[id] = d;
  }
  return out;
}

/** This device's full stats + the other devices' compact ones → one stats object for summarize(). */
function mergeStats(local, others) {
  const days = JSON.parse(JSON.stringify(local.days || {}));
  const garden = new Map((local.garden || []).map((g) => [g.id, g]));
  for (const d of Object.values(others || {})) {
    for (const [k, v] of Object.entries(d.days || {})) {
      const day = days[k] || (days[k] = { focusSec: 0, blocks: {}, sessions: 0 });
      day.focusSec += Number(v.f) || 0;
      day.sessions += Number(v.s) || 0;
      for (const [name, n] of Object.entries(v.b || {})) day.blocks[name] = (day.blocks[name] || 0) + (Number(n) || 0);
    }
    for (const g of d.garden || []) if (g && g.id && !garden.has(g.id)) garden.set(g.id, g);
  }
  return { days, garden: [...garden.values()].sort((a, b) => a.t - b.t) };
}

function buildPayload(config, deviceId, changedAt, devices) {
  const settings = {};
  for (const k of SYNC_SETTINGS) settings[k] = config.settings[k];
  return {
    v: 1,
    device: deviceId,
    changedAt,
    lists: config.lists,
    schedules: config.schedules,
    customThemes: config.customThemes || [],
    settings,
    session: config.session && config.session.endsAt > changedAt - 1 ? config.session : null,
    sessionChangedAt: config.sessionChangedAt || 0,
    ...(devices ? { devices } : {}),
  };
}

/**
 * Apply a remote payload onto the local config.
 * Respects locks: while a non-flexible block is running here, remote changes
 * that would weaken it are ignored (the local, stricter version wins).
 * Returns { config, changed, keptLocal }.
 */
function applyRemote(config, remote, nowMs, { pinSet = false } = {}) {
  if (!remote || remote.v !== 1) return { config, changed: false, keptLocal: false };
  const settings = {};
  for (const k of SYNC_SETTINGS) if (k in (remote.settings || {})) settings[k] = remote.settings[k];
  let next = cfgLib.mergeEditable(config, { lists: remote.lists, schedules: remote.schedules, customThemes: remote.customThemes, settings });
  let keptLocal = false;
  const ev = engine.evaluate(config, nowMs);
  const locked = ev.sources.length && (ev.mode !== 'flexible' || pinSet);
  if (locked && engine.isReduction(config, next, nowMs)) {
    // Keep local lists/schedules (stricter); still take styles & preferences.
    next = cfgLib.mergeEditable(config, { customThemes: remote.customThemes, settings });
    keptLocal = true;
  }

  // Session: newest decision wins, but never weaken a local locked block.
  const rs = remote.session && remote.session.endsAt > nowMs ? remote.session : null;
  const ls = config.session && config.session.endsAt > nowMs ? config.session : null;
  const remoteNewer = (remote.sessionChangedAt || 0) > (config.sessionChangedAt || 0);
  if (remoteNewer) {
    const candidate = { ...next, session: rs ? { ...rs, listIds: rs.listIds.filter((id) => next.lists.some((l) => l.id === id)) } : null, sessionChangedAt: remote.sessionChangedAt };
    const localLocked = ls && (ls.mode !== 'flexible' || pinSet);
    if (!(localLocked && engine.isReduction({ ...next, session: ls }, candidate, nowMs))) next = candidate;
    else keptLocal = true;
  } else {
    next = { ...next, session: config.session, sessionChangedAt: config.sessionChangedAt || 0 };
  }

  const strip = (c) => JSON.stringify({ l: c.lists, s: c.schedules, t: c.customThemes, st: c.settings, se: c.session });
  return { config: next, changed: strip(next) !== strip(config), keptLocal };
}

module.exports = { SYNC_SETTINGS, buildPayload, applyRemote, deviceEntry, otherDevices, mergeStats };
