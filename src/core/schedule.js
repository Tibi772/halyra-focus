'use strict';
// Weekly schedules. days: array of JS weekday numbers (0 = Sunday … 6 = Saturday).
// start/end: "HH:MM" local time. end <= start means the window runs past midnight.
// start === end means "all day" on the selected days.

function parseHM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi !== 0)) return null;
  return h * 60 + mi;
}

function atMinutes(base, dayOffset, minutes) {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, 0, minutes, 0, 0).getTime();
}

function minuteOfDay(d) {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60000;
}

/** Returns { active, endsAt } for a schedule at Date `now`. */
function scheduleWindow(schedule, now) {
  const start = parseHM(schedule.start);
  const end = parseHM(schedule.end);
  const days = new Set(Array.isArray(schedule.days) ? schedule.days : []);
  if (start == null || end == null || days.size === 0) return { active: false, endsAt: null };

  const t = minuteOfDay(now);
  const day = now.getDay();
  const prev = (day + 6) % 7;

  if (start === end) {
    if (!days.has(day)) return { active: false, endsAt: null };
    // Extend across consecutive selected days so the countdown is honest.
    let offset = 1;
    while (offset < 7 && days.has((day + offset) % 7)) offset += 1;
    return { active: true, endsAt: atMinutes(now, offset, 0) };
  }

  if (start < end) {
    if (days.has(day) && t >= start && t < end) return { active: true, endsAt: atMinutes(now, 0, end) };
    return { active: false, endsAt: null };
  }

  // Overnight window, e.g. 22:00 → 07:00
  if (days.has(day) && t >= start) return { active: true, endsAt: atMinutes(now, 1, end) };
  if (days.has(prev) && t < end) return { active: true, endsAt: atMinutes(now, 0, end) };
  return { active: false, endsAt: null };
}

/** Next time (ms) the schedule becomes active after `now`, or null. */
function nextStart(schedule, now) {
  const start = parseHM(schedule.start);
  const end = parseHM(schedule.end);
  const days = new Set(Array.isArray(schedule.days) ? schedule.days : []);
  if (start == null || end == null || days.size === 0) return null;
  for (let offset = 0; offset <= 7; offset += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (!days.has(d.getDay())) continue;
    const ts = atMinutes(d, 0, start === end ? 0 : start);
    if (ts > now.getTime()) return ts;
  }
  return null;
}

module.exports = { parseHM, scheduleWindow, nextStart };
