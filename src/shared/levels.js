// Levels & achievements: focus turns into XP, XP into levels with names, and
// milestones into gems that orbit your 3D focus island. Pure functions, shared by
// the desktop app, the phone app and the tests (UMD: window.HalyraLevels / require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HalyraLevels = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  /** XP needed to go from level L to L+1: 60, 85, 110, … (1 XP = 1 focus minute). */
  const step = (L) => 60 + 25 * (L - 1);
  /** Total XP at which level L starts. */
  const startOf = (L) => 60 * (L - 1) + (25 * (L - 1) * (L - 2)) / 2;

  // Title bands: [first level, en, hu]
  const TITLES = [
    [1, 'Seedling', 'Mag'], [3, 'Sprout', 'Hajtás'], [5, 'Spark', 'Szikra'], [8, 'Ember', 'Parázs'],
    [11, 'Flame', 'Láng'], [15, 'Lantern', 'Lámpás'], [20, 'Lighthouse', 'Világítótorony'], [25, 'Comet', 'Üstökös'],
    [30, 'Star', 'Csillag'], [40, 'Nebula', 'Csillagköd'], [50, 'Galaxy', 'Galaxis'], [65, 'Supernova', 'Szupernóva'], [80, 'Legend', 'Legenda'],
  ];

  function titleOf(level, lang) {
    let t = TITLES[0];
    for (const b of TITLES) if (level >= b[0]) t = b;
    return lang === 'hu' ? t[2] : t[1];
  }

  /** XP from a summary: focus minutes + 5 per finished session + 10 per grown tree/building. */
  function xpOf(sum) {
    const s = sum || {};
    return Math.max(0, Math.round((s.focusMin || 0) + 5 * (s.sessions || 0) + 10 * (s.grown || 0)));
  }

  function levelOf(xp, lang) {
    const x = Math.max(0, Math.floor(xp || 0));
    let L = 1;
    while (startOf(L + 1) <= x && L < 999) L += 1;
    const into = x - startOf(L);
    const need = step(L);
    return { level: L, xp: x, into, need, pct: Math.min(1, into / need), title: titleOf(L, lang), nextTitle: titleOf(nextBand(L), lang), nextBandAt: nextBand(L) };
  }

  function nextBand(L) {
    const b = TITLES.find((t) => t[0] > L);
    return b ? b[0] : L + 1;
  }

  // Gems: each has its own shape + colour in 3D. `test` gets the summary.
  const GEMS = [
    { id: 'first', shape: 'octa', color: '#7cf0c8', en: ['First focus', 'Finished your first session'], hu: ['Első fókusz', 'Végigcsináltad az első fókuszt'], test: (s) => s.sessions >= 1 },
    { id: 'hour10', shape: 'icosa', color: '#6fb8ff', en: ['10 hours', '10 hours of focus in total'], hu: ['10 óra', 'Összesen 10 óra fókusz'], test: (s) => s.focusMin >= 600 },
    { id: 'hour100', shape: 'dodeca', color: '#b38cff', en: ['100 hours', '100 hours of focus — serious'], hu: ['100 óra', '100 óra fókusz — ez már komoly'], test: (s) => s.focusMin >= 6000 },
    { id: 'hour500', shape: 'star', color: '#ffd36b', en: ['500 hours', 'Half a thousand hours of focus'], hu: ['500 óra', 'Félezer óra fókusz'], test: (s) => s.focusMin >= 30000 },
    { id: 'streak7', shape: 'prism', color: '#ff9a5c', en: ['7-day streak', 'Focused 7 days in a row'], hu: ['7 napos sorozat', '7 napig egymás után fókuszáltál'], test: (s) => s.bestStreak >= 7 },
    { id: 'streak30', shape: 'spike', color: '#ff5d7a', en: ['30-day streak', 'A whole month, every day'], hu: ['30 napos sorozat', 'Egy teljes hónap, minden nap'], test: (s) => s.bestStreak >= 30 },
    { id: 'marathon', shape: 'tall', color: '#5fe0ff', en: ['Marathon', 'One session of 2 hours or more'], hu: ['Maraton', 'Egyetlen legalább 2 órás fókusz'], test: (s) => s.longestMin >= 120 },
    { id: 'early', shape: 'octa', color: '#ffe28a', en: ['Early bird', 'Focused before 7 in the morning'], hu: ['Korán kelő', 'Reggel 7 előtt fókuszáltál'], test: (s) => s.early },
    { id: 'night', shape: 'icosa', color: '#8f9bff', en: ['Night owl', 'Focused after 10 at night'], hu: ['Éjjeli bagoly', 'Este 10 után fókuszáltál'], test: (s) => s.night },
    { id: 'forest25', shape: 'dodeca', color: '#6be08a', en: ['Little forest', 'Grew 25 trees or buildings'], hu: ['Kis erdő', '25 fát vagy épületet növesztettél'], test: (s) => s.grown >= 25 },
    { id: 'week', shape: 'prism', color: '#ffb36b', en: ['Perfect week', 'At least 25 minutes on all 7 days of a week'], hu: ['Tökéletes hét', 'Egy hét mind a 7 napján legalább 25 perc'], test: (s) => s.perfectWeek },
    { id: 'shield', shape: 'shield', color: '#ff7a59', en: ['Shield up', 'Turned on an always-on list'], hu: ['Pajzs fel', 'Bekapcsoltál egy mindig aktív listát'], test: (s) => s.shield },
    { id: 'earned', shape: 'coin', color: '#ffd84d', en: ['Earned it', 'Spent minutes you earned by focusing'], hu: ['Kiérdemelted', 'Elköltöttél fókusszal szerzett perceket'], test: (s) => s.earned },
    { id: 'xmas', shape: 'star', color: '#ff6b6b', en: ['Holiday focus', 'Focused between 24 and 26 December'], hu: ['Ünnepi fókusz', 'Fókuszáltál december 24. és 26. között'], test: (s) => s.xmas },
  ];

  function gems(sum, lang) {
    const s = { focusMin: 0, sessions: 0, grown: 0, bestStreak: 0, longestMin: 0, ...sum };
    return GEMS.map((g) => {
      const [name, desc] = lang === 'hu' ? g.hu : g.en;
      return { id: g.id, shape: g.shape, color: g.color, name, desc, got: Boolean(g.test(s)) };
    });
  }

  /** Gem ids in `now` that weren't in `before` (for "new achievement" toasts). */
  function newGems(before, now) {
    const had = new Set((before || []).filter((g) => g.got).map((g) => g.id));
    return (now || []).filter((g) => g.got && !had.has(g.id));
  }

  return { step, startOf, xpOf, levelOf, titleOf, TITLES, GEMS, gems, newGems };
}));
