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

function addSession(stats, ms) {
  day(stats, ms).sessions += 1;
}

function prune(stats, ms, keepDays = 400) {
  const cutoff = dayKey(ms - keepDays * 86400000);
  for (const k of Object.keys(stats.days)) if (k < cutoff) delete stats.days[k];
}

function sum(obj) {
  return Object.values(obj || {}).reduce((a, b) => a + b, 0);
}

function summarize(stats, ms, streakMinMinutes = 25) {
  const last7 = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(ms);
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i, 12).getTime();
    const k = dayKey(t);
    const v = stats.days[k];
    last7.push({ day: k, weekday: new Date(t).getDay(), minutes: v ? Math.round(v.focusSec / 60) : 0, blocks: v ? sum(v.blocks) : 0 });
  }
  const today = stats.days[dayKey(ms)] || { focusSec: 0, blocks: {}, sessions: 0 };

  let streak = 0;
  for (let i = 0; i < 400; i += 1) {
    const d = new Date(ms);
    const k = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i, 12).getTime());
    const v = stats.days[k];
    const ok = v && v.focusSec >= streakMinMinutes * 60;
    if (ok) streak += 1;
    else if (i === 0) continue; // today doesn't break the streak until it's over
    else break;
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
    last7,
    top,
  };
}

module.exports = { dayKey, emptyStats, addFocus, addBlock, addSession, prune, summarize };
