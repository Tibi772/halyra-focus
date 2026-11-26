'use strict';
// Grow while you focus: art, unlocks, records, and syncing the forest across devices.
const test = require('node:test');
const assert = require('node:assert/strict');
const GROW = require('../src/shared/grow');
const statsLib = require('../src/core/stats');
const sync = require('../src/core/sync');
const cfgLib = require('../src/core/config');

test('every item draws at every stage without broken numbers', () => {
  for (const c of GROW.CATALOG) {
    for (const p of [0, 0.05, 0.2, 0.33, 0.5, 0.71, 0.9, 0.96, 1]) {
      for (const mono of [false, true]) {
        const svg = GROW.draw(c.id, p, { mono, minutes: 50 });
        assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
        assert.ok(!/NaN|undefined|Infinity/.test(svg), `${c.id} @${p} mono=${mono}`);
      }
    }
    assert.ok(!/NaN|undefined/.test(GROW.draw(c.id, 1, { dead: true })), `${c.id} dead`);
  }
  const land = GROW.landscape(GROW.CATALOG.map((c, i) => ({ i: c.id, ok: i % 4 !== 0, m: 30 })));
  assert.ok(!/NaN|undefined/.test(land));
  assert.ok(!/NaN|undefined/.test(GROW.landscape([{ i: 'oak', ok: true, m: 10 }], { wide: false, mono: true })));
});

test('unlocks follow total focus hours', () => {
  assert.deepEqual(GROW.unlocked(0).open.sort(), ['hut', 'house', 'oak', 'pine'].sort());
  assert.equal(GROW.unlocked(0).next.unlockH, 1);
  assert.equal(GROW.unlocked(1000).next, null);
});

test('grown items are recorded once per session (no doubles across devices)', () => {
  const st = statsLib.emptyStats();
  assert.equal(statsLib.addGrown(st, { id: 111, t: 5, i: 'oak', m: 50, ok: true }), true);
  assert.equal(statsLib.addGrown(st, { id: 111, t: 6, i: 'oak', m: 50, ok: true }), false);
  statsLib.addGrown(st, { id: 222, t: 7, i: 'house', m: 12, ok: false });
  const g = statsLib.summarize(st, Date.now()).garden;
  assert.equal(g.grown, 1);
  assert.equal(g.withered, 1);
  assert.equal(g.items.length, 2);
});

test('settings and session keep the grow choice; unknown items fall back', () => {
  const c = cfgLib.normalizeLoaded({ settings: { growItem: 'castle', growOn: true }, session: { startedAt: 1, endsAt: 2, listIds: [], mode: 'flexible', grow: 'rocket' } }, 'en');
  assert.equal(c.settings.growItem, 'castle');
  assert.equal(c.session.grow, 'rocket');
  const bad = cfgLib.normalizeLoaded({ settings: { growItem: '<script>' }, session: { startedAt: 1, endsAt: 2, grow: 'nope' } }, 'en');
  assert.equal(bad.settings.growItem, 'oak');
  assert.equal(bad.session.grow, null);
  assert.ok(sync.SYNC_SETTINGS.includes('growItem'));
});

test('stats + forest of all devices merge for the totals', () => {
  const now = new Date(2026, 10, 26, 15).getTime();
  const a = statsLib.emptyStats();
  const b = statsLib.emptyStats();
  for (let i = 0; i < 6 * 30; i += 1) statsLib.addFocus(a, now, 10); // 30 min
  for (let i = 0; i < 6 * 45; i += 1) statsLib.addFocus(b, now, 10); // 45 min
  statsLib.addBlock(b, now, 'youtube.com');
  statsLib.addGrown(a, { id: 1, t: now - 1000, i: 'oak', m: 30, ok: true });
  statsLib.addGrown(b, { id: 1, t: now - 1000, i: 'oak', m: 30, ok: true }); // same session synced to both
  statsLib.addGrown(b, { id: 2, t: now - 500, i: 'house', m: 45, ok: true });
  const entry = sync.deviceEntry(b, now, { name: 'Laptop', platform: 'win32' });
  assert.ok(JSON.stringify(entry).length < 50000);
  const row = sync.buildPayload(cfgLib.defaults('en'), 'dev-b', now, { 'dev-b': entry, old: { at: now - 200 * 86400000, days: {} } });
  const others = sync.otherDevices(row, 'dev-a', now);
  assert.deepEqual(Object.keys(others), ['dev-b'], 'stale devices dropped');
  const sum = statsLib.summarize(sync.mergeStats(a, others), now);
  assert.equal(sum.todayMinutes, 75);
  assert.equal(sum.todayBlocks, 1);
  assert.equal(sum.garden.grown, 2);
  assert.equal(Object.keys(sync.otherDevices(row, 'dev-b', now)).length, 0, 'own entry is not "other"');
});

test('weekly summary covers the previous Monday–Sunday', () => {
  const st = statsLib.emptyStats();
  const wed = new Date(2026, 10, 25, 15).getTime(); // Wednesday
  const lastTue = new Date(2026, 10, 17, 10).getTime(); // Tuesday
  for (let i = 0; i < 6 * 90; i += 1) statsLib.addFocus(st, lastTue, 10);
  statsLib.addSession(st, lastTue);
  statsLib.addGrown(st, { id: 9, t: lastTue + 3600000, i: 'oak', m: 90, ok: true });
  for (let i = 0; i < 6 * 30; i += 1) statsLib.addFocus(st, wed, 10); // this week: not counted
  const w = statsLib.lastWeek(st, wed);
  assert.equal(w.key, '2026-11-23');
  assert.equal(w.minutes, 90);
  assert.equal(w.sessions, 1);
  assert.equal(w.grown, 1);
  assert.equal(w.bestDay.weekday, 2);
});

test('the feeds preset is part-of-site rules only', () => {
  const { PRESETS } = require('../src/core/presets');
  const feeds = PRESETS.find((p) => p.id === 'feeds');
  const rules = require('../src/core/blockrules');
  assert.ok(feeds.paths.every((p) => rules.normalizePathRule(p) === p), 'all normalized');
  const list = cfgLib.presetToList(feeds, 'en');
  assert.deepEqual(list.paths, feeds.paths);
  assert.equal(rules.urlBlocked('https://www.youtube.com/shorts/abc', { hosts: [], paths: list.paths }), 'youtube.com/shorts');
  assert.equal(rules.urlBlocked('https://www.youtube.com/watch?v=x', { hosts: [], paths: list.paths }), null);
});
