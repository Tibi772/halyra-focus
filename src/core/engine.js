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
  const paths = new Set();
  const allow = new Set();
  let allowOnly = false;
  const apps = new Map();
  const keywords = new Set();
  let safe = false;
  for (const list of config.lists || []) {
    if (!listIds.has(list.id)) continue;
    for (const k of list.keywords || []) keywords.add(k);
    if (list.safe) safe = true;
    if (list.allowOnly) {
      // "Only these sites": the list names what stays reachable in the browser
      // (its apps are still blocked). A list with no sites does nothing here.
      for (const site of list.sites || []) { const n = normalizeSite(site); if (n) { allow.add(n); allowOnly = true; } }
    } else {
      for (const site of list.sites || []) {
        const n = normalizeSite(site);
        if (n) sites.add(n);
      }
      for (const p of list.paths || []) paths.add(p);
    }
    for (const app of list.apps || []) {
      const k = appKey(app);
      if (!k) continue;
      const prev = apps.get(k);
      if (prev) {
        prev.mac = [...new Set([...(prev.mac || []), ...(app.mac || [])])];
        prev.win = [...new Set([...(prev.win || []), ...(app.win || [])])];
        prev.android = [...new Set([...(prev.android || []), ...(app.android || [])])];
      } else {
        apps.set(k, { name: app.name, mac: [...(app.mac || [])], win: [...(app.win || [])], android: [...(app.android || [])] });
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
    paths: [...paths].sort(),
    allow: allowOnly ? [...allow].sort() : null,
    apps: [...apps.values()],
    keywords: [...keywords].sort(),
    safe,
    endsAt,
    next,
    standing: standing(config, nowMs),
  };
}

/**
 * Standing blocks, outside focus sessions: "always" lists, and "earn" lists that
 * are not unlocked right now. They never make focus mode "on", never count as
 * focus time and never lock other settings — they are just enforced.
 */
function standing(config, nowMs) {
  const lists = [];
  const passes = config.passes || {};
  let nextPassEnd = null;
  for (const l of config.lists || []) {
    if (l.always) { lists.push(l); continue; }
    if (!l.earn) continue;
    const until = passes[l.id];
    if (typeof until === 'number' && until > nowMs) {
      if (!nextPassEnd || until < nextPassEnd) nextPassEnd = until;
      continue;
    }
    lists.push(l);
  }
  const sites = new Set();
  const paths = new Set();
  const keywords = new Set();
  const apps = new Map();
  let safe = false;
  for (const l of lists) {
    for (const site of l.sites || []) { const n = normalizeSite(site); if (n) sites.add(n); }
    for (const p of l.paths || []) paths.add(p);
    for (const k of l.keywords || []) keywords.add(k);
    if (l.safe) safe = true;
    for (const app of l.apps || []) {
      const k = appKey(app);
      if (!k) continue;
      const prev = apps.get(k);
      if (prev) {
        prev.mac = [...new Set([...(prev.mac || []), ...(app.mac || [])])];
        prev.win = [...new Set([...(prev.win || []), ...(app.win || [])])];
        prev.android = [...new Set([...(prev.android || []), ...(app.android || [])])];
      } else apps.set(k, { name: app.name, mac: [...(app.mac || [])], win: [...(app.win || [])], android: [...(app.android || [])] });
    }
  }
  return {
    listIds: lists.map((l) => l.id),
    names: lists.map((l) => l.name),
    sites: [...sites].sort(),
    paths: [...paths].sort(),
    keywords: [...keywords].sort(),
    apps: [...apps.values()],
    safe,
    nextPassEnd,
    any: lists.length > 0,
  };
}

/** Everything to enforce right now: focus blocks (if any) + standing blocks. */
function enforced(ev) {
  const st = ev.standing || { sites: [], paths: [], keywords: [], apps: [], safe: false, any: false, listIds: [] };
  const on = ev.blocking;
  const apps = new Map();
  for (const a of [...(on ? ev.apps : []), ...st.apps]) {
    const k = appKey(a);
    const prev = apps.get(k);
    if (prev) {
      prev.mac = [...new Set([...(prev.mac || []), ...(a.mac || [])])];
      prev.win = [...new Set([...(prev.win || []), ...(a.win || [])])];
      prev.android = [...new Set([...(prev.android || []), ...(a.android || [])])];
    } else apps.set(k, { ...a, mac: [...(a.mac || [])], win: [...(a.win || [])], android: [...(a.android || [])] });
  }
  const sites = [...new Set([...(on ? ev.sites : []), ...st.sites])].sort();
  const paths = [...new Set([...(on ? ev.paths || [] : []), ...st.paths])].sort();
  const keywords = [...new Set([...(on ? ev.keywords || [] : []), ...st.keywords])].sort();
  const allow = on && ev.allow && ev.allow.length ? ev.allow : null;
  return {
    any: on || st.any,
    sites, paths, keywords, allow,
    apps: [...apps.values()],
    safe: Boolean((on && ev.safe) || st.safe),
    // The helper drops blocks by itself at this time; standing blocks have no end.
    expiresAt: st.any ? null : (on ? ev.endsAt : null),
  };
}

/** True when `candidate` would weaken a standing (always / earn) block. */
function standingReduction(current, candidate, nowMs) {
  const a = standing(current, nowMs);
  if (!a.any) return false;
  const b = standing(candidate, nowMs);
  const has = (arr, x) => arr.includes(x);
  if (a.sites.some((x) => !has(b.sites, x)) || a.paths.some((x) => !has(b.paths, x)) || a.keywords.some((x) => !has(b.keywords, x))) return true;
  if (a.safe && !b.safe) return true;
  const bApps = new Set(b.apps.map(appKey));
  return a.apps.some((x) => !bApps.has(appKey(x)));
}

/** Weakening the always-on protection: a standing list shrinks, or the cool-down gets shorter. */
function standingWeakening(current, candidate, nowMs) {
  const a = (current.settings || {}).coolDownH || 0;
  const b = (candidate.settings || {}).coolDownH || 0;
  return b < a || standingReduction(current, candidate, nowMs);
}

const COOL_WINDOW_MS = 24 * 3600 * 1000;
/** The cool-down state: idle, waiting until `at`, or open (changes allowed until `closes`). */
function coolDown(config, nowMs) {
  const h = (config.settings || {}).coolDownH || 0;
  const at = typeof config.unlockAt === 'number' ? config.unlockAt : null;
  if (!at || nowMs >= at + COOL_WINDOW_MS) return { hours: h, state: h ? 'idle' : 'off', at: null };
  if (nowMs < at) return { hours: h, state: 'waiting', at };
  return { hours: h, state: 'open', at, closes: at + COOL_WINDOW_MS };
}

/** True when `candidate` would block less than `current` right now. */
function isReduction(current, candidate, nowMs, opts = {}) {
  const a = evaluate(current, nowMs, opts);
  if (!a.sources.length) return false;
  const b = evaluate(candidate, nowMs, opts);
  const bSites = new Set(b.sites);
  if (a.sites.some((s) => !bSites.has(s))) return true;
  const bPaths = new Set(b.paths);
  if (a.paths.some((p) => !bPaths.has(p))) return true;
  if (a.allow && (!b.allow || b.allow.some((x) => !a.allow.includes(x)))) return true;
  const bApps = new Map(b.apps.map((x) => [appKey(x), x]));
  for (const app of a.apps) {
    const other = bApps.get(appKey(app));
    if (!other) return true;
    if ((app.mac || []).some((m) => !(other.mac || []).includes(m))) return true;
    if ((app.win || []).some((w) => !(other.win || []).includes(w))) return true;
    if ((app.android || []).some((w) => !(other.android || []).includes(w))) return true;
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

module.exports = { MODES, MODE_RANK, strictest, sessionState, evaluate, isReduction, appKey, nextMidnight, standing, enforced, standingReduction, standingWeakening, coolDown, COOL_WINDOW_MS };
