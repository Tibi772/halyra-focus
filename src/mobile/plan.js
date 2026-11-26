'use strict';
// Turns the config into a "blocking plan" for a phone's native blocker: exact
// time windows (sessions incl. Pomodoro phases, schedules, skips) for the next
// days, plus daily limits. The native service enforces the plan on its own, so
// blocks start and end on time even when the app's UI is closed.
const engine = require('../core/engine');
const { expandHosts } = require('../core/domains');

// Weekly schedules repeat, so the plan covers five weeks ahead: blocking keeps
// working even if the app isn't opened for a long time.
const HORIZON_MS = 35 * 24 * 3600 * 1000;
const FOREVER = 8.64e15; // max JS date; fits a Kotlin Long
// Opening these during a strict block could undo it (settings → revoke
// permissions / uninstall). Mirrors the desktop "block tamper tools" option.
const TAMPER = ['com.android.settings', 'com.google.android.packageinstaller', 'com.android.packageinstaller', 'com.android.vending'];

const packagesOf = (apps) => [...new Set(apps.flatMap((a) => a.android || []))].sort();

function windowKey(w) {
  return `${w.mode}|${w.packages.join(',')}|${w.domains.join(',')}|${w.ids.join(',')}|${w.safe ? 1 : 0}|${w.standing ? 1 : 0}`;
}

/** Times at which the evaluation can change after t. */
function nextChange(config, ev, t) {
  const c = [];
  for (const s of ev.sources) {
    if (s.endsAt) c.push(s.endsAt);
    if (s.phaseEndsAt) c.push(s.phaseEndsAt);
  }
  if (ev.next && ev.next.at) c.push(ev.next.at);
  for (const v of Object.values(config.skips || {})) if (typeof v === 'number') c.push(v);
  for (const v of Object.values(config.passes || {})) if (typeof v === 'number') c.push(v);
  const future = c.filter((x) => x > t);
  return future.length ? Math.min(...future) : null;
}

function buildPlan(config, nowMs, opts = {}) {
  const until = nowMs + HORIZON_MS;
  const strictTools = Boolean(config.settings && config.settings.strictBlocksTools);
  const windows = [];
  let t = nowMs;
  for (let guard = 0; guard < 5000 && t < until; guard += 1) {
    // Limits are usage-based and handled natively, so they're left out here.
    const ev = engine.evaluate(config, t);
    const nx = nextChange(config, ev, t) || until;
    const st = ev.standing || { any: false };
    if (ev.blocking || st.any) {
      // Focus blocks + standing ("always" / locked "earn") lists.
      const enf = engine.enforced(ev);
      const packages = packagesOf(enf.apps);
      if (ev.blocking && ev.mode === 'strict' && strictTools) packages.push(...TAMPER.filter((p) => !packages.includes(p)));
      const w = {
        from: t,
        to: Math.min(nx, until),
        mode: ev.blocking ? ev.mode : 'flexible',
        packages,
        domains: expandHosts(enf.sites),
        ids: [...ev.sources.filter((s) => s.blocking).map((s) => s.id), ...(st.listIds || []).map((id) => `list:${id}`)].sort(),
        names: [...ev.sources.filter((s) => s.blocking).map((s) => s.name || ''), ...(st.names || [])].filter(Boolean),
        safe: enf.safe,
        standing: !ev.blocking, // always-on / earn lists only: no end time, no mode on the block screen
      };
      const prev = windows[windows.length - 1];
      if (prev && prev.to === w.from && windowKey(prev) === windowKey(w)) prev.to = w.to;
      else windows.push(w);
    }
    t = nx;
  }
  // Always-on and earn lists keep working past the horizon even if the app isn't opened again.
  const far = engine.standing(config, until);
  if (far.any) {
    const w = {
      from: until, to: FOREVER, mode: 'flexible', packages: packagesOf(far.apps), domains: expandHosts(far.sites),
      ids: (far.listIds || []).map((id) => `list:${id}`).sort(), names: (far.names || []).filter(Boolean), safe: far.safe, standing: true,
    };
    const prev = windows[windows.length - 1];
    if (prev && prev.to === w.from && windowKey(prev) === windowKey(w)) prev.to = w.to;
    else if (w.packages.length || w.domains.length || w.safe) windows.push(w);
  }
  const limits = (config.lists || []).filter((l) => l.limitMin > 0).map((l) => ({
    id: `limit:${l.id}`,
    listId: l.id,
    name: l.name,
    limitSec: l.limitMin * 60,
    mode: l.limitMode || 'patient',
    packages: packagesOf(l.apps || []),
    domains: expandHosts(l.sites || []),
  })).filter((l) => l.packages.length || l.domains.length);
  const skips = {};
  for (const [k, v] of Object.entries(config.skips || {})) if (typeof v === 'number' && v > nowMs) skips[k] = v;
  return {
    v: 1,
    generatedAt: nowMs,
    windows,
    limits,
    skips,
    block: opts.block || null, // texts + theme for the native block screen
  };
}

/** What the plan blocks at `nowMs`, given today's per-package usage (seconds). */
function activeAt(plan, nowMs, usageSecByPackage = {}) {
  const packages = new Set();
  const domains = new Set();
  let endsAt = 0;
  let mode = null;
  let safe = false;
  const rank = engine.MODE_RANK;
  for (const w of plan.windows || []) {
    if (w.from <= nowMs && nowMs < w.to) {
      w.packages.forEach((p) => packages.add(p));
      w.domains.forEach((d) => domains.add(d));
      if (w.safe) safe = true;
      if (w.standing) continue;
      endsAt = Math.max(endsAt, w.to);
      if (!mode || rank[w.mode] > rank[mode]) mode = w.mode;
    }
  }
  // A focus window is split where an always-on/earn list changes; follow the chain to the real end.
  for (let moved = endsAt > 0; moved;) {
    moved = false;
    for (const w of plan.windows || []) if (!w.standing && w.from <= endsAt && w.to > endsAt) { endsAt = w.to; moved = true; }
  }
  for (const l of plan.limits || []) {
    if ((plan.skips || {})[l.id] > nowMs) continue;
    const used = l.packages.reduce((n, p) => n + (usageSecByPackage[p] || 0), 0);
    if (used >= l.limitSec) {
      l.packages.forEach((p) => packages.add(p));
      l.domains.forEach((d) => domains.add(d));
      endsAt = Math.max(endsAt, engine.nextMidnight(nowMs));
      if (!mode || rank[l.mode] > rank[mode]) mode = l.mode;
    }
  }
  return { packages: [...packages], domains: [...domains], endsAt: endsAt || null, mode, safe };
}

module.exports = { buildPlan, activeAt, TAMPER, HORIZON_MS, FOREVER };
