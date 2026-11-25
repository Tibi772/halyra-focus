'use strict';
// The focus coach: smart setup suggestions from a goal, firm (but honest)
// messages when you try to quit early, and insights from your own stats.
// Everything here runs offline; the optional AI only refines suggestions.
const { normalize } = require('./stylegen');
const { dayKey } = require('./stats');

const T = {
  en: {
    study: 'Study block: 4 × 25 min Pomodoro, Patient mode. Social media, video, games and chat are off — you can’t revise and scroll at the same time.',
    code: 'Deep work: 90 minutes, Patient mode. Social, video, news and games are off. Chat stays — teammates may need you.',
    work: 'Work sprint: 50 minutes. Social, video, news and shopping are off. Start with the hardest task.',
    write: 'Writing session: 90 minutes, Locked. Everything that pings is off. The first draft is allowed to be bad.',
    create: 'Creative session: 90 minutes. Social, news, shopping and games are off — keep the music.',
    read: 'Reading time: 50 minutes, Patient. Phone-style distractions are off. One chapter at a time.',
    sleep: 'Wind-down: 60 minutes before bed, Patient. Screens are for sleep later, not scrolling now.',
    workout: 'Training: 45 minutes. Social and video are off until you’re done.',
    default: 'Focus block: 50 minutes, Flexible. Social media and video are off. Decide what “done” looks like, then start.',
    lines: {
      almost: 'You’re {pct}% in. The last {left} are the easiest part — don’t quit now.',
      minutes: 'Only {left} left. Anything can be endured for {left}.',
      streak: 'You have a {streak}-day streak. Stop now and today won’t count.',
      goal: '“{goal}” — that’s why you started. {left} to go.',
      early: 'The first minutes are always the hardest. Give it {min} more minutes, then decide.',
      plain: 'Not now. {left} left, then you’re free.',
      breakNow: 'Your break comes in {left}. Hold on until then.',
    },
    insightPeak: '{name} is your weak spot around {from}:00–{to}:00. Block it automatically at that time?',
    insightNoSchedule: 'You have no active schedule. Blocks that switch on by themselves beat willpower.',
    insightBest: 'Your best day this week was {day} with {time} of focus.',
    insightBehind: 'Today you’re {min} min behind your daily average. One 25-minute block fixes that.',
    insightStreak: '{streak}-day streak. Keep it alive: at least 25 minutes today.',
    scheduleName: 'No {name} at {from}:00',
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  },
  hu: {
    study: 'Tanulás: 4 × 25 perc Pomodoro, Türelmes módban. Közösségi média, videó, játék és chat kikapcsolva — tanulni és görgetni egyszerre nem lehet.',
    code: 'Mély munka: 90 perc, Türelmes mód. Közösségi média, videó, hírek és játékok kikapcsolva. A chat marad — lehet, hogy a csapat keres.',
    work: 'Munkablokk: 50 perc. Közösségi média, videó, hírek és vásárlás kikapcsolva. A legnehezebb feladattal kezdd.',
    write: 'Írás: 90 perc, Zárolt mód. Minden, ami pittyeg, kikapcsolva. Az első vázlat lehet rossz.',
    create: 'Alkotás: 90 perc. Közösségi média, hírek, vásárlás és játékok kikapcsolva — a zene maradhat.',
    read: 'Olvasás: 50 perc, Türelmes mód. A figyelemelterelők kikapcsolva. Egyszerre egy fejezet.',
    sleep: 'Lefekvés előtti lazítás: 60 perc, Türelmes mód. A képernyő most nem görgetésre való.',
    workout: 'Edzés: 45 perc. Közösségi média és videó kikapcsolva, amíg nem végzel.',
    default: 'Fókusz: 50 perc, Laza mód. Közösségi média és videó kikapcsolva. Döntsd el, mitől lesz „kész”, és kezdd.',
    lines: {
      almost: 'Már {pct}%-nál tartasz. Az utolsó {left} a legkönnyebb rész — most ne add fel.',
      minutes: 'Már csak {left}. Ennyit bármi kibír.',
      streak: '{streak} napos sorozatod van. Ha most leállsz, a mai nap nem számít bele.',
      goal: '„{goal}” — ezért kezdted el. Még {left}.',
      early: 'Az első percek mindig a legnehezebbek. Adj neki még {min} percet, aztán dönts.',
      plain: 'Most nem. Még {left}, és utána szabad vagy.',
      breakNow: 'A szüneted {left} múlva jön. Addig tarts ki.',
    },
    insightPeak: '{name} a gyenge pontod {from}:00 és {to}:00 között. Tiltsam automatikusan ilyenkor?',
    insightNoSchedule: 'Nincs aktív időzítésed. A magától bekapcsoló tiltás erősebb az akaraterőnél.',
    insightBest: 'A heted legjobb napja: {day}, {time} fókusz.',
    insightBehind: 'Ma {min} perccel le vagy maradva a napi átlagodtól. Egy 25 perces blokk ezt helyrehozza.',
    insightStreak: '{streak} napos sorozat. Tartsd életben: ma legalább 25 perc.',
    scheduleName: 'Nincs {name} {from}:00-tól',
    days: ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'],
  },
};

const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (k in v ? v[k] : ''));
const L = (lang) => T[lang] || T.en;

const PROFILES = [
  { id: 'study', keys: ['tanul', 'vizsga', 'exam', 'study', 'homework', 'hazi', 'zh', 'erettsegi', 'felelet', 'teszt', 'test', 'egyetem', 'iskola', 'school', 'university', 'learn'], presets: ['social', 'video', 'games', 'chat'], pomodoro: { work: 25, brk: 5, cycles: 4 }, mode: 'patient' },
  { id: 'code', keys: ['kod', 'program', 'coding', 'code', 'dev', 'fejleszt', 'debug', 'bug', 'app', 'website', 'weboldal', 'roblox', 'script'], presets: ['social', 'video', 'news', 'games'], minutes: 90, mode: 'patient' },
  { id: 'write', keys: ['iras', 'irni', 'irok', 'writing', 'write', 'szakdolgozat', 'thesis', 'dolgozat', 'essay', 'essze', 'konyv', 'book', 'blog', 'cikk', 'article', 'forgatokonyv', 'script'], presets: ['social', 'video', 'games', 'chat', 'news', 'shopping'], minutes: 90, mode: 'strict' },
  { id: 'create', keys: ['vagas', 'vagni', 'vagok', 'edit', 'editing', 'video', 'rajz', 'draw', 'design', 'tervez', 'zene', 'music', 'tiktok', 'alkot', 'create', 'foto', 'photo'], presets: ['social', 'news', 'shopping', 'games'], minutes: 90, mode: 'flexible' },
  { id: 'read', keys: ['olvas', 'read', 'reading', 'konyvet'], presets: ['social', 'video', 'games', 'chat'], minutes: 50, mode: 'patient' },
  { id: 'sleep', keys: ['alv', 'sleep', 'lefekv', 'pihen', 'este', 'ejszaka', 'night', 'bed'], presets: ['social', 'video', 'games', 'news'], minutes: 60, mode: 'patient' },
  { id: 'workout', keys: ['edz', 'sport', 'gym', 'workout', 'futas', 'run', 'joga', 'yoga'], presets: ['social', 'video'], minutes: 45, mode: 'flexible' },
  { id: 'work', keys: ['munka', 'work', 'email', 'riport', 'report', 'prezentacio', 'presentation', 'excel', 'meeting', 'ugyfel', 'client', 'ajanlat', 'offer', 'projekt', 'project', 'szamla', 'invoice'], presets: ['social', 'video', 'news', 'shopping'], minutes: 50, mode: 'flexible' },
];

/** Suggest a session for a goal. Returns preset ids; the caller maps them to lists. */
function suggestSetup(goal, lang = 'en') {
  const words = ` ${normalize(goal)} `;
  let best = null;
  for (const p of PROFILES) {
    const score = p.keys.reduce((n, k) => n + (words.includes(` ${k}`) ? 1 : 0), 0);
    if (score && (!best || score > best.score)) best = { p, score };
  }
  const p = best ? best.p : { id: 'default', presets: ['social', 'video'], minutes: 50, mode: 'flexible' };
  return {
    profile: p.id,
    presets: p.presets,
    minutes: p.minutes || null,
    pomodoro: p.pomodoro || null,
    mode: p.mode,
    reason: L(lang)[p.id] || L(lang).default,
  };
}

function fmtLeft(ms, lang) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return lang === 'hu' ? `${m} perc` : `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return lang === 'hu' ? `${h} óra${r ? ` ${r} perc` : ''}` : `${h} h${r ? ` ${r} min` : ''}`;
}

/** A firm, specific line for the moment someone tries to stop early. */
function coachLine({ goal, leftMs, totalMs, streak = 0, todayMin = 0, phase, phaseLeftMs }, lang = 'en') {
  const t = L(lang).lines;
  const left = fmtLeft(leftMs, lang);
  const pct = totalMs > 0 ? Math.round((1 - leftMs / totalMs) * 100) : 0;
  if (phase === 'work' && phaseLeftMs && phaseLeftMs < leftMs && phaseLeftMs <= 10 * 60000) return fill(t.breakNow, { left: fmtLeft(phaseLeftMs, lang) });
  if (leftMs <= 5 * 60000) return fill(t.minutes, { left });
  if (pct >= 70) return fill(t.almost, { pct, left });
  if (streak >= 2 && todayMin < 25) return fill(t.streak, { streak });
  if (goal && String(goal).trim()) return fill(t.goal, { goal: String(goal).trim().slice(0, 60), left });
  if (pct < 20) return fill(t.early, { min: Math.min(10, Math.max(3, Math.round(leftMs / 60000 / 4))) });
  return fill(t.plain, { left });
}

/**
 * Insights from raw stats ({days: {YYYY-MM-DD: {focusSec, blocks, hours}}}).
 * Each insight may carry an action the UI can apply with one click.
 */
function insights(stats, config, nowMs, lang = 'en') {
  const t = L(lang);
  const out = [];
  const days = [];
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(nowMs);
    const k = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i, 12).getTime());
    days.push([k, stats.days[k]]);
  }
  // 1) peak hour of the most blocked thing
  const totals = {};
  const hours = {};
  for (const [, v] of days) {
    if (!v) continue;
    for (const [name, n] of Object.entries(v.blocks || {})) totals[name] = (totals[name] || 0) + n;
    for (const [name, arr] of Object.entries(v.hours || {})) {
      hours[name] = hours[name] || new Array(24).fill(0);
      arr.forEach((n, h) => { hours[name][h] += n; });
    }
  }
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3 && hours[top[0]]) {
    const arr = hours[top[0]];
    let bestH = 0;
    for (let h = 0; h < 24; h += 1) {
      const win = arr[h] + arr[(h + 1) % 24];
      if (win > arr[bestH] + arr[(bestH + 1) % 24]) bestH = h;
    }
    const from = bestH;
    const to = (bestH + 2) % 24;
    const list = (config.lists || []).find((l) => l.apps.some((a) => a.name === top[0]) || l.sites.includes(top[0]));
    const exists = (config.schedules || []).some((s) => s.enabled && s.listIds.includes(list && list.id) && Number(s.start.slice(0, 2)) === from);
    if (list && !exists) {
      out.push({
        id: 'peak',
        text: fill(t.insightPeak, { name: top[0], from: String(from).padStart(2, '0'), to: String(to).padStart(2, '0') }),
        action: {
          type: 'createSchedule',
          schedule: { name: fill(t.scheduleName, { name: top[0], from: String(from).padStart(2, '0') }), listIds: [list.id], days: [0, 1, 2, 3, 4, 5, 6], start: `${String(from).padStart(2, '0')}:00`, end: `${String(to).padStart(2, '0')}:00`, mode: 'patient', enabled: true },
        },
      });
    }
  }
  // 2) no schedule at all
  if (!(config.schedules || []).some((s) => s.enabled)) {
    const off = (config.schedules || [])[0];
    out.push({ id: 'noschedule', text: t.insightNoSchedule, action: off ? { type: 'enableSchedule', id: off.id } : null });
  }
  // 3) streak / behind average
  const week = days.slice(0, 7);
  const mins = week.map(([, v]) => (v ? Math.round(v.focusSec / 60) : 0));
  const today = mins[0];
  const pastAvg = Math.round(mins.slice(1).reduce((a, b) => a + b, 0) / 6);
  if (pastAvg >= 20 && today < pastAvg) out.push({ id: 'behind', text: fill(t.insightBehind, { min: pastAvg - today }), action: { type: 'startFocus', minutes: 25 } });
  const best = week.reduce((b, [k, v]) => (v && (!b || v.focusSec > b[1].focusSec) ? [k, v] : b), null);
  if (best && best[1].focusSec >= 1800) {
    const d = new Date(`${best[0]}T12:00:00`);
    const m = Math.round(best[1].focusSec / 60);
    out.push({ id: 'best', text: fill(t.insightBest, { day: t.days[d.getDay()], time: fmtLeft(m * 60000, lang) }) });
  }
  return out.slice(0, 4);
}

module.exports = { suggestSetup, coachLine, insights, PROFILES };
