'use strict';
// 1.6: levels & gems, streak freeze, weekly minutes for the leaderboard, hiding chat apps,
// the Christmas look, the assistant's new tools and the new settings.
const test = require('node:test');
const assert = require('node:assert/strict');
const LEVELS = require('../src/shared/levels');
const statsLib = require('../src/core/stats');
const cfgLib = require('../src/core/config');
const I18N = require('../src/shared/i18n');
const GROW = require('../src/shared/grow');
const { blockInfo, seasonOn } = require('../src/core/blockinfo');
const hider = require('../src/main/hider');
const A = require('../src/core/assistant');

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
function focus(st, ms, minutes) { for (let s = 0; s < minutes * 6; s += 1) statsLib.addFocus(st, ms, 10); }

test('levels: XP curve is monotonic, titles and progress make sense', () => {
  let prev = 0;
  for (let xp = 0; xp < 20000; xp += 37) {
    const L = LEVELS.levelOf(xp, 'en');
    assert.ok(L.level >= prev, 'level never goes down');
    assert.ok(L.pct >= 0 && L.pct <= 1);
    assert.ok(L.into >= 0 && L.into < L.need);
    prev = L.level;
  }
  assert.equal(LEVELS.levelOf(0, 'en').level, 1);
  assert.equal(LEVELS.levelOf(59, 'en').level, 1);
  assert.equal(LEVELS.levelOf(60, 'en').level, 2);
  assert.equal(LEVELS.levelOf(0, 'hu').title, 'Mag');
  assert.ok(LEVELS.levelOf(100000, 'en').level > 50);
  const l8 = LEVELS.levelOf(LEVELS.xpOf({ focusMin: 700, sessions: 20, grown: 5 }), 'en');
  assert.equal(l8.xp, 700 + 100 + 50);
  assert.ok(l8.nextBandAt > l8.level);
});

test('gems: unlock from the right stats, names in both languages, newGems diff', () => {
  const none = LEVELS.gems({}, 'en');
  assert.ok(none.length >= 12);
  assert.ok(none.every((g) => !g.got && g.name && g.desc && /^#/.test(g.color)));
  const hu = LEVELS.gems({}, 'hu');
  assert.notEqual(hu[0].name, none[0].name);
  const some = { focusMin: 650, sessions: 3, bestStreak: 7, early: true, shield: true };
  const got = LEVELS.gems(some, 'en').filter((g) => g.got).map((g) => g.id);
  for (const id of ['first', 'hour10', 'streak7', 'early', 'shield']) assert.ok(got.includes(id), id);
  assert.ok(!got.includes('hour100'));
  assert.deepEqual(LEVELS.newGems(LEVELS.gems({ sessions: 0 }, 'en'), LEVELS.gems({ sessions: 1 }, 'en')).map((g) => g.id), ['first']);
});

test('stats: finished sessions, early/night flags, archive keeps level inputs', () => {
  const st = statsLib.emptyStats();
  focus(st, at(2026, 11, 2), 60);
  statsLib.addDone(st, at(2026, 11, 2, 6, 50), 50, at(2026, 11, 2, 6, 0));
  statsLib.addDone(st, at(2026, 11, 3, 23, 30), 90, at(2026, 11, 3, 22, 0));
  let inp = statsLib.levelInputs(st, at(2026, 11, 4));
  assert.equal(inp.sessions, 2);
  assert.equal(inp.longestMin, 90);
  assert.equal(inp.early, true);
  assert.equal(inp.night, true);
  assert.equal(inp.focusMin, 60);
  // a year later the days are pruned, but the totals still count
  statsLib.prune(st, at(2027, 12, 20));
  assert.equal(Object.keys(st.days).length, 0);
  inp = statsLib.levelInputs(st, at(2027, 12, 20));
  assert.equal(inp.sessions, 2);
  assert.equal(inp.focusMin, 60);
  assert.equal(inp.early, true);
});

test('stats: Christmas focus earns the seasonal gem input; perfect week', () => {
  const st = statsLib.emptyStats();
  focus(st, at(2026, 12, 25), 5);
  for (let d = 7; d <= 13; d += 1) focus(st, at(2026, 12, d), 30); // Mon 7 – Sun 13 Dec 2026
  const inp = statsLib.levelInputs(st, at(2026, 12, 26));
  assert.equal(inp.xmas, true);
  assert.equal(inp.perfectWeek, true);
  assert.ok(inp.bestStreak >= 7);
});

test('streak freeze: one missed day a week keeps the streak, two in a row break it', () => {
  const st = statsLib.emptyStats();
  const today = at(2026, 11, 27);
  for (const d of [20, 21, 22, 24, 25, 26, 27]) focus(st, at(2026, 11, d), 30); // the 23rd is missed
  const s = statsLib.summarize(st, today);
  assert.equal(s.streak, 7);
  assert.equal(s.freezes, 1);
  assert.equal(statsLib.summarize(st, today, 25, { freeze: false }).streak, 4);
  const st2 = statsLib.emptyStats();
  for (const d of [20, 21, 24, 25, 26, 27]) focus(st2, at(2026, 11, d), 30); // 22 and 23 missed
  assert.equal(statsLib.summarize(st2, today).streak, 4);
});

test('this week: starts on Monday and sums minutes since then', () => {
  const st = statsLib.emptyStats();
  focus(st, at(2026, 11, 22), 40); // Sunday — previous week
  focus(st, at(2026, 11, 23), 30); // Monday
  focus(st, at(2026, 11, 27), 45); // Friday
  const w = statsLib.thisWeek(st, at(2026, 11, 27, 18));
  assert.equal(w.start, '2026-11-23');
  assert.equal(w.minutes, 75);
  assert.equal(statsLib.thisWeek(st, at(2026, 11, 23, 9)).start, '2026-11-23');
});

test('blocked apps: chat apps are hidden (not closed) in smart mode', () => {
  for (const n of ['Discord', 'Messenger', 'WhatsApp', 'Telegram', 'Slack', 'Microsoft Teams', 'Facebook', 'Signal']) assert.equal(hider.actionFor({ name: n }, 'smart'), 'hide', n);
  for (const n of ['Steam', 'Roblox', 'League of Legends', 'Minecraft']) assert.equal(hider.actionFor({ name: n }, 'smart'), 'close', n);
  assert.equal(hider.actionFor({ name: 'Steam' }, 'hide'), 'hide');
  assert.equal(hider.actionFor({ name: 'Discord' }, 'close'), 'close');
  assert.match(hider.JXA_HIDE, /hide/);
  assert.match(hider.WIN_HIDER, /ShowWindowAsync/);
});

test('Christmas look: automatic in December until 6 January, can be forced on/off', () => {
  // seasonOn answers "how much winter", 0 to 1, not just yes/no
  assert.equal(seasonOn('auto', at(2026, 12, 1)), 1);
  assert.equal(seasonOn('auto', at(2027, 1, 6, 20)), 1);
  assert.equal(seasonOn('auto', at(2027, 1, 7)), 0);
  assert.equal(seasonOn('auto', at(2026, 11, 27)), 0);
  assert.equal(seasonOn('on', at(2026, 7, 1)), 1, 'settings saved by an older version still mean full');
  assert.equal(seasonOn('full', at(2026, 7, 1)), 1);
  assert.equal(seasonOn('subtle', at(2026, 7, 1)), 0.35);
  assert.equal(seasonOn('off', at(2026, 12, 24)), 0);
  const cfg = cfgLib.defaults('hu');
  const b = blockInfo({ lang: 'hu', theme: null, config: cfg, now: at(2026, 12, 20) });
  assert.equal(b.festive, true);
  assert.deepEqual(b.quotes, I18N.make('hu')('quotes.xmas'));
  assert.equal(blockInfo({ lang: 'en', theme: null, config: cfg, now: at(2026, 6, 1) }).festive, false);
});

test('friendly messages exist in both languages, with the app name and time', () => {
  for (const lang of ['en', 'hu']) {
    const t = I18N.make(lang);
    for (const k of ['appmsg.hide', 'appmsg.close', 'appmsg.xmas.hide', 'appmsg.xmas.close']) {
      const arr = t(k);
      assert.ok(Array.isArray(arr) && arr.length >= 3, `${lang} ${k}`);
      for (const line of arr) { assert.match(line, /\{app\}/); assert.match(line, /\{time\}/); }
    }
    for (const k of ['appmsg.always', 'appmsg.xmas.always']) for (const line of t(k)) { assert.match(line, /\{app\}/); assert.doesNotMatch(line, /\{time\}/); }
    assert.ok(t('quotes.xmas').length >= 4);
  }
  const en = Object.keys(I18N.STR.en);
  const hu = Object.keys(I18N.STR.hu);
  assert.deepEqual(en.filter((k) => !hu.includes(k)), []);
  assert.deepEqual(hu.filter((k) => !en.includes(k)), []);
});

test('Christmas tree: seasonal, drawable, never the "next unlock"', () => {
  assert.equal(GROW.BY_ID.xmas.season, 'xmas');
  assert.match(GROW.draw('xmas', 1, {}), /<svg/);
  assert.match(GROW.draw('xmas', 1, { mono: true }), /currentColor/);
  assert.notEqual(GROW.unlocked(0).next.id, 'xmas');
  assert.ok(!GROW.unlocked(0).open.includes('xmas'));
  assert.ok(GROW.unlocked(0, { season: true }).open.includes('xmas'));
});

test('settings: menus, blocked-app action, Christmas look, AI persona and leaderboard are sanitised', () => {
  const base = cfgLib.defaults('en');
  assert.equal(base.settings.appAction, 'smart');
  assert.equal(base.settings.season, 'auto');
  assert.deepEqual(base.settings.hiddenNav, []);
  assert.equal(base.settings.lbOn, false);
  const c = cfgLib.mergeEditable(base, { settings: {
    hiddenNav: ['stats', 'focus', 'settings', 'ranks', 'stats', '<x>'], appAction: 'nuke', season: 'on',
    aiName: '  Mici  ', aiTone: 'evil', aiAbout: 'x'.repeat(900), aiCity: '<b>Szeged</b>', lbName: 'A'.repeat(40), lbPublic: 'yes',
  } });
  assert.deepEqual(c.settings.hiddenNav, ['stats', 'ranks'], 'focus and settings can never be hidden');
  assert.equal(c.settings.appAction, 'smart');
  assert.equal(c.settings.season, 'on');
  assert.equal(c.settings.aiName, 'Mici');
  assert.equal(c.settings.aiTone, 'friendly');
  assert.ok(c.settings.aiAbout.length <= 600);
  assert.ok(!/[<>]/.test(c.settings.aiCity));
  assert.ok(c.settings.lbName.length <= 24);
  assert.equal(c.settings.lbPublic, false);
});

function aiCtx(lang = 'en') {
  let config = cfgLib.defaults(lang);
  const calls = [];
  return {
    lang,
    now: () => at(2026, 11, 27, 15, 5),
    config: () => config,
    stats: () => ({ totalHours: 0 }),
    applyConfigChange: (partial) => { config = cfgLib.mergeEditable(config, partial); return { ok: true }; },
    levels: () => ({ ...LEVELS.levelOf(900, lang), gems: LEVELS.gems({ sessions: 2 }, lang) }),
    weather: (place) => A.weather(async (url) => {
      calls.push(url);
      if (url.includes('geocoding')) return /Nowhere/.test(url) ? { results: [] } : { results: [{ name: 'Debrecen', country: 'Magyarország', latitude: 47.53, longitude: 21.63 }] };
      if (url.includes('geojs')) return { city: 'Szeged', country: 'Hungary', latitude: '46.25', longitude: '20.15' };
      return { current: { temperature_2m: 3.4, apparent_temperature: 0.6, weather_code: 71, wind_speed_10m: 12, precipitation: 0.2 },
        daily: { time: ['2026-11-27', '2026-11-28', '2026-11-29'], weather_code: [71, 3, 0], temperature_2m_max: [4, 5, 6], temperature_2m_min: [-1, 0, 1], precipitation_probability_max: [70, 20, 5] } };
    }, place, { lang, city: config.settings.aiCity }),
    calls,
  };
}

test('assistant: weather (with a city, from the connection, unknown place)', async () => {
  const ctx = aiCtx('hu');
  let r = await A.runTool(ctx, 'get_weather', { place: 'Debrecen' });
  assert.equal(r.ok, true);
  assert.equal(r.place, 'Debrecen, Magyarország');
  assert.equal(r.now.temp, 3.4);
  assert.equal(r.tomorrow.max, 5);
  assert.match(ctx.calls[0], /geocoding-api\.open-meteo\.com.*name=Debrecen/);
  assert.match(ctx.calls[1], /api\.open-meteo\.com\/v1\/forecast\?latitude=47\.53/);
  const line = A.weatherLine(r, true);
  assert.match(line, /Debrecen/);
  assert.match(line, /3 °C/);
  assert.match(line, /Holnap/);
  r = await A.runTool(ctx, 'get_weather', {});
  assert.equal(r.approximate, true);
  assert.match(r.place, /Szeged/);
  r = await A.runTool(ctx, 'get_weather', { place: 'Nowhere' });
  assert.equal(r.ok, false);
  assert.equal(A.weatherPlace('Milyen idő lesz holnap Budapesten?'), 'Budapest');
  assert.equal(A.weatherPlace('Győrben esik?'), 'Győr');
  assert.equal(A.weatherPlace("what's the weather in New York today"), 'New York');
  assert.equal(A.offline('hány fok van itt?', 'hu').calls[0].name, 'get_weather');
  assert.equal(A.offline('hány fok van itt?', 'hu').calls[0].input.place, '');
});

test('assistant: customise the app, remember notes, level, time', async () => {
  const ctx = aiCtx('en');
  let r = await A.runTool(ctx, 'customize_app', { hide_menu: ['stats', 'ranks'], season: 'off', assistant_name: 'Mochi', assistant_tone: 'coach', city: 'Szeged' });
  assert.equal(r.ok, true);
  assert.deepEqual(ctx.config().settings.hiddenNav, ['stats', 'ranks']);
  assert.equal(ctx.config().settings.season, 'off');
  assert.equal(ctx.config().settings.aiName, 'Mochi');
  assert.equal(ctx.config().settings.aiTone, 'coach');
  r = await A.runTool(ctx, 'customize_app', { show_menu: ['stats'] });
  assert.deepEqual(ctx.config().settings.hiddenNav, ['ranks']);
  await A.runTool(ctx, 'remember_about_me', { note: 'Exams in January' });
  await A.runTool(ctx, 'remember_about_me', { note: 'Plays guitar' });
  assert.equal(ctx.config().settings.aiAbout, 'Exams in January\nPlays guitar');
  await A.runTool(ctx, 'remember_about_me', { note: 'guitar', forget: true });
  assert.equal(ctx.config().settings.aiAbout, 'Exams in January');
  const p = A.systemPrompt(ctx);
  assert.match(p, /Mochi/);
  assert.match(p, /Exams in January/);
  assert.match(p, /Szeged/);
  r = await A.runTool(ctx, 'get_level', {});
  assert.equal(r.ok, true);
  assert.ok(r.level > 1 && r.gems.length > 5);
  r = await A.runTool(ctx, 'get_time', {});
  assert.equal(r.time, '15:05');
  assert.equal(A.offline('Christmas look off', 'en').calls[0].input.season, 'off');
  assert.deepEqual(A.offline('rejtsd el a statisztikát', 'hu').calls[0].input.hide_menu, ['stats']);
  assert.equal(A.offline('hányas szinten vagyok?', 'hu').calls[0].name, 'get_level');
});
