'use strict';
// Local-only usage statistics. Nothing here ever leaves the computer.

function dayKey(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function emptyStats() {
  return { days: {} };
}

function day(stats, ms) {
  const k = dayKey(ms);
  if (!stats.days[k]) stats.days[k] = { focusSec: 0, blocks: {}, sessions: 0 };
  return stats.days[k];
}

function addFocus(stats, ms, seconds) {
  if (!(seconds > 0)) return;
  day(stats, ms).focusSec += Math.min(seconds, 10);
}

function addBlock(stats, ms, name) {
  const d = day(stats, ms);
  const k = String(name || '?').slice(0, 80);
  d.blocks[k] = (d.blocks[k] || 0) + 1;
  d.hours = d.hours || {};
  d.hours[k] = d.hours[k] || new Array(24).fill(0);
  d.hours[k][new Date(ms).getHours()] += 1;
}

function addUsage(stats, ms, listId, seconds) {
  if (!(seconds > 0)) return;
  const d = day(stats, ms);
  d.usage = d.usage || {};
  d.usage[listId] = (d.usage[listId] || 0) + Math.min(seconds, 10);
}

function usageToday(stats, ms) {
  const v = stats.days[dayKey(ms)];
  return (v && v.usage) || {};
}

function addSession(stats, ms) {
  day(stats, ms).sessions += 1;
}

/** A session that ran to the end: counts for levels and some achievements. */
function addDone(stats, endMs, minutes, startMs) {
  const d = day(stats, endMs);
  d.done = (d.done || 0) + 1;
  d.longest = Math.max(d.longest || 0, Math.round(minutes || 0));
  const h = new Date(startMs || endMs).getHours();
  if (h < 7) d.early = 1;
  if (h >= 22 || new Date(endMs).getHours() >= 23) d.night = 1;
}

/** A finished (ok) or abandoned (withered) grow item. `id` = session start, so devices don't double it. */
function addGrown(stats, rec) {
  stats.garden = Array.isArray(stats.garden) ? stats.garden : [];
  const id = String(rec.id);
  if (stats.garden.some((g) => g.id === id)) return false;
  stats.garden.push({ id, t: rec.t, i: rec.i, m: Math.max(1, Math.round(rec.m || 0)), ok: rec.ok !== false });
  stats.garden.sort((a, b) => a.t - b.t);
  if (stats.garden.length > 3000) stats.garden.splice(0, stats.garden.length - 3000);
  return true;
}

/**
 * A present rather than something earned — the Christmas tree everyone gets in
 * December. It stands on the island like anything else, but it is not counted
 * as a tree you grew, because you did not: the focus numbers stay honest.
 */
function gift(stats, id, item, ms) {
  stats.garden = Array.isArray(stats.garden) ? stats.garden : [];
  if (stats.garden.some((g) => g.id === id)) return false;
  stats.garden.push({ id, t: ms, i: item, m: 0, ok: true, gift: true });
  stats.garden.sort((a, b) => a.t - b.t);
  return true;
}

function gardenSummary(stats, ms) {
  const g = Array.isArray(stats.garden) ? stats.garden : [];
  const today = dayKey(ms);
  const weekAgo = ms - 7 * 86400000;
  const grown = g.filter((x) => x.ok && !x.gift).length;
  return {
    items: g.slice(-240),
    grown,
    withered: g.filter((x) => !x.ok).length,
    today: g.filter((x) => x.ok && !x.gift && dayKey(x.t) === today).length,
    week: g.filter((x) => x.ok && !x.gift && x.t >= weekAgo).length,
    gifts: g.filter((x) => x.gift).length,
  };
}

/** Monday of the week of `ms` (local) as "YYYY-MM-DD", and focus minutes since then. */
function thisWeek(stats, ms) {
  const d = new Date(ms);
  const back = (d.getDay() + 6) % 7;
  let minutes = 0;
  for (let i = 0; i <= back; i += 1) {
    const v = stats.days[dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i, 12).getTime())];
    if (v) minutes += v.focusSec / 60;
  }
  return { start: dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back, 12).getTime()), minutes: Math.floor(minutes) };
}

/** Last full week (Mon–Sun before the week of `ms`): { key, minutes, sessions, grown, bestDay }. */
function lastWeek(stats, ms) {
  const d = new Date(ms);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7), 12);
  const key = dayKey(monday.getTime());
  let minutes = 0;
  let sessions = 0;
  let best = null;
  for (let i = 1; i <= 7; i += 1) {
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - i, 12);
    const v = stats.days[dayKey(day.getTime())];
    const m = v ? Math.round(v.focusSec / 60) : 0;
    minutes += m;
    sessions += v ? v.sessions || 0 : 0;
    if (m && (!best || m > best.minutes)) best = { weekday: day.getDay(), minutes: m };
  }
  const from = monday.getTime() - 7 * 86400000;
  const grown = (stats.garden || []).filter((g) => g.ok && !g.gift && g.t >= from && g.t < monday.getTime() - 12 * 3600000).length;
  return { key, minutes, sessions, grown, bestDay: best };
}

function prune(stats, ms, keepDays = 400) {
  const cutoff = dayKey(ms - keepDays * 86400000);
  for (const k of Object.keys(stats.days)) {
    if (k >= cutoff) continue;
    // Old days leave, but what they count towards levels stays.
    const v = stats.days[k];
    const a = stats.archive || (stats.archive = { focusSec: 0, done: 0, longest: 0, bestStreak: 0, early: 0, night: 0 });
    a.focusSec += v.focusSec || 0;
    a.done += v.done || 0;
    a.longest = Math.max(a.longest, v.longest || 0);
    if (v.early) a.early = 1;
    if (v.night) a.night = 1;
    delete stats.days[k];
  }
}

/** Everything levels & achievements need (see src/shared/levels.js). */
function levelInputs(stats, ms, streakMinMinutes = 25) {
  const a = stats.archive || {};
  let focusSec = a.focusSec || 0;
  let done = a.done || 0;
  let longest = a.longest || 0;
  let early = Boolean(a.early);
  let night = Boolean(a.night);
  let xmas = false;
  const keys = Object.keys(stats.days).sort();
  for (const k of keys) {
    const v = stats.days[k];
    focusSec += v.focusSec || 0;
    done += v.done || 0;
    longest = Math.max(longest, v.longest || 0);
    if (v.early) early = true;
    if (v.night) night = true;
    if (/-12-2[456]$/.test(k) && v.focusSec >= 60) xmas = true;
  }
  // best streak and "perfect week" (Mon–Sun, all 7 days ≥ the streak minimum)
  let best = a.bestStreak || 0;
  let run = 0;
  let prev = null;
  let perfectWeek = false;
  const okDays = new Set(keys.filter((k) => stats.days[k].focusSec >= streakMinMinutes * 60));
  for (const k of keys) {
    if (!okDays.has(k)) { run = 0; prev = k; continue; }
    const d = new Date(`${k}T12:00:00`);
    const y = prev ? new Date(`${prev}T12:00:00`) : null;
    run = y && Math.round((d - y) / 86400000) === 1 && okDays.has(prev) ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
    if (d.getDay() === 0 && run >= 7) perfectWeek = true;
  }
  const garden = Array.isArray(stats.garden) ? stats.garden : [];
  const grown = garden.filter((g) => g.ok && !g.gift).length;
  for (const g of garden) if (g.ok && !g.gift) longest = Math.max(longest, g.m || 0);
  return { focusMin: Math.floor(focusSec / 60), sessions: done, grown, bestStreak: best, longestMin: longest, early, night, perfectWeek, xmas };
}

function sum(obj) {
  return Object.values(obj || {}).reduce((a, b) => a + b, 0);
}

function summarize(stats, ms, streakMinMinutes = 25, opts = {}) {
  const last7 = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(ms);
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i, 12).getTime();
    const k = dayKey(t);
    const v = stats.days[k];
    last7.push({ day: k, weekday: new Date(t).getDay(), minutes: v ? Math.round(v.focusSec / 60) : 0, blocks: v ? sum(v.blocks) : 0 });
  }
  const today = stats.days[dayKey(ms)] || { focusSec: 0, blocks: {}, sessions: 0 };

  // One rest day per week doesn't break the streak (a "freeze"), so a single
  // missed day isn't a disaster — two in a row, or two in a week, still are.
  let streak = 0;
  let lastFreeze = -99;
  let freezes = 0;
  for (let i = 0; i < 400; i += 1) {
    const d = new Date(ms);
    const k = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i, 12).getTime());
    const v = stats.days[k];
    const ok = v && v.focusSec >= streakMinMinutes * 60;
    if (ok) { streak += 1; continue; }
    if (i === 0) continue; // today doesn't break the streak until it's over
    if (opts.freeze !== false && streak > 0 && i - lastFreeze >= 7 && i - lastFreeze !== 1) {
      const kb = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i - 1, 12).getTime());
      const vb = stats.days[kb];
      if (vb && vb.focusSec >= streakMinMinutes * 60) { lastFreeze = i; freezes += 1; continue; }
    }
    break;
  }

  const totals = {};
  let totalFocus = 0;
  for (const [k, v] of Object.entries(stats.days)) {
    totalFocus += v.focusSec;
    if (k < last7[0].day) continue;
    for (const [name, n] of Object.entries(v.blocks)) totals[name] = (totals[name] || 0) + n;
  }
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count }));

  return {
    todayMinutes: Math.round(today.focusSec / 60),
    todayBlocks: sum(today.blocks),
    todaySessions: today.sessions,
    weekMinutes: last7.reduce((a, b) => a + b.minutes, 0),
    totalHours: Math.round(totalFocus / 360) / 10,
    streak,
    freezes,
    last7,
    top,
    garden: gardenSummary(stats, ms),
  };
}

module.exports = {
  gift,
  addGrown, gardenSummary, lastWeek, dayKey, emptyStats, addFocus, addBlock, addUsage, usageToday, addSession, addDone, prune, summarize, levelInputs, thisWeek };
