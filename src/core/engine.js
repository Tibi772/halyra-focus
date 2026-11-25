'use strict';
const { scheduleWindow, nextStart } = require('./schedule');
const { normalizeSite } = require('./domains');

const MODES = ['flexible', 'patient', 'strict'];
const MODE_RANK = { flexible: 0, patient: 1, strict: 2 };

function strictest(modes) {
  let best = 'flexible';
  for (const m of modes) if (MODE_RANK[m] > MODE_RANK[best]) best = m;
  return best;
}

/** Phase info for a manual session (plain countdown or pomodoro). */
function sessionState(session, nowMs) {
  if (!session || typeof session.endsAt !== 'number') return null;
  if (nowMs >= session.endsAt) return { ended: true };
  const p = session.pomodoro;
  if (p && p.work > 0 && p.cycles > 0) {
    const work = p.work * 60000;
    const brk = Math.max(0, p.brk) * 60000;
    const cycle = work + brk;
    const elapsed = Math.max(0, nowMs - session.startedAt);
    const idx = Math.floor(elapsed / cycle);
    const within = elapsed - idx * cycle;
    const base = session.startedAt + idx * cycle;
    if (within < work) {
      return { phase: 'work', cycle: idx + 1, cycles: p.cycles, phaseEndsAt: Math.min(base + work, session.endsAt), endsAt: session.endsAt };
    }
    return { phase: 'break', cycle: idx + 1, cycles: p.cycles, phaseEndsAt: base + cycle, endsAt: session.endsAt };
  }
  return { phase: 'work', cycle: 1, cycles: 1, phaseEndsAt: session.endsAt, endsAt: session.endsAt };
}

function appKey(app) {
  return String(app && app.name || '').trim().toLowerCase();
}

/**
 * Works out what must be blocked right now.
 * Returns { blocking, mode, sources, listIds, sites, apps, endsAt, next }
 */
function nextMidnight(nowMs) {
  const d = new Date(nowMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

function evaluate(config, nowMs, { usage } = {}) {
  const now = new Date(nowMs);
  const sources = [];

  const ss = sessionState(config.session, nowMs);
  if (ss && !ss.ended) {
    sources.push({
      type: 'session', id: 'session', name: null, mode: config.session.mode || 'flexible',
      endsAt: ss.endsAt, phase: ss.phase, phaseEndsAt: ss.phaseEndsAt, cycle: ss.cycle, cycles: ss.cycles,
      blocking: ss.phase === 'work', listIds: config.session.listIds || [],
      pomodoro: Boolean(config.session.pomodoro),
    });
  }

  let next = null;
  for (const s of config.schedules || []) {
    if (!s.enabled) continue;
    const w = scheduleWindow(s, now);
    const skipUntil = config.skips && config.skips[s.id];
    if (w.active && !(skipUntil && skipUntil > nowMs)) {
      sources.push({ type: 'schedule', id: s.id, name: s.name, mode: s.mode || 'flexible', endsAt: w.endsAt, phase: 'work', blocking: true, listIds: s.listIds || [] });
    } else {
      const ns = nextStart(s, now);
      if (ns && (!next || ns < next.at)) next = { at: ns, id: s.id, name: s.name };
    }
  }

  // Daily limits: once a list's apps have run for limitMin today, the list is blocked until midnight.
  if (usage) {
    for (const l of config.lists || []) {
      if (!(l.limitMin > 0)) continue;
      const id = `limit:${l.id}`;
      const skipUntil = config.skips && config.skips[id];
      if ((usage[l.id] || 0) >= l.limitMin * 60 && !(skipUntil && skipUntil > nowMs)) {
        sources.push({ type: 'limit', id, name: l.name, mode: l.limitMode || 'patient', endsAt: nextMidnight(nowMs), phase: 'work', blocking: true, listIds: [l.id] });
      }
    }
  }

  const blockingSources = sources.filter((s) => s.blocking);
  const listIds = new Set();
  for (const s of blockingSources) for (const id of s.listIds) listIds.add(id);

  const sites = new Set();
  const apps = new Map();
  for (const list of config.lists || []) {
    if (!listIds.has(list.id)) continue;
    for (const site of list.sites || []) {
      const n = normalizeSite(site);
      if (n) sites.add(n);
    }
    for (const app of list.apps || []) {
      const k = appKey(app);
      if (!k) continue;
      const prev = apps.get(k);
      if (prev) {
        prev.mac = [...new Set([...(prev.mac || []), ...(app.mac || [])])];
        prev.win = [...new Set([...(prev.win || []), ...(app.win || [])])];
      } else {
        apps.set(k, { name: app.name, mac: [...(app.mac || [])], win: [...(app.win || [])] });
      }
    }
  }

  const endsAt = blockingSources.length ? Math.max(...blockingSources.map((s) => s.endsAt || 0)) : null;
  return {
    blocking: blockingSources.length > 0,
    mode: strictest(sources.map((s) => s.mode)),
    sources,
    listIds: [...listIds],
    sites: [...sites].sort(),
    apps: [...apps.values()],
    endsAt,
    next,
  };
}

/** True when `candidate` would block less than `current` right now. */
function isReduction(current, candidate, nowMs, opts = {}) {
  const a = evaluate(current, nowMs, opts);
  if (!a.sources.length) return false;
  const b = evaluate(candidate, nowMs, opts);
  const bSites = new Set(b.sites);
  if (a.sites.some((s) => !bSites.has(s))) return true;
  const bApps = new Map(b.apps.map((x) => [appKey(x), x]));
  for (const app of a.apps) {
    const other = bApps.get(appKey(app));
    if (!other) return true;
    if ((app.mac || []).some((m) => !(other.mac || []).includes(m))) return true;
    if ((app.win || []).some((w) => !(other.win || []).includes(w))) return true;
  }
  const bSources = new Map(b.sources.map((s) => [s.id, s]));
  for (const s of a.sources) {
    const o = bSources.get(s.id);
    if (!o) return true;
    if ((o.endsAt || 0) < (s.endsAt || 0)) return true;
    if (MODE_RANK[o.mode] < MODE_RANK[s.mode]) return true;
    if (s.listIds.some((id) => !o.listIds.includes(id))) return true;
  }
  return false;
}

module.exports = { MODES, MODE_RANK, strictest, sessionState, evaluate, isReduction, appKey, nextMidnight };
