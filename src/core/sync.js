'use strict';
// Cross-device sync payloads (pure logic, unit-tested). What syncs:
// block lists, schedules, custom styles, preferences and the running focus
// session — so starting a block on one computer starts it on all of them.
// Never synced: PIN, AI key, stats, the hosts helper state.
const cfgLib = require('./config');
const engine = require('./engine');

const SYNC_SETTINGS = ['theme', 'lang', 'defaultMode', 'defaultMinutes', 'defaultListIds', 'patientDelaySec', 'emergencyDelaySec', 'challengeLength', 'strictBlocksTools', 'showOverlay', 'notifications', 'sound'];

function buildPayload(config, deviceId, changedAt) {
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

module.exports = { SYNC_SETTINGS, buildPayload, applyRemote };
