'use strict';
// Halyra AI: offline command understanding + the app tools it uses (with a fake app).
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/core/assistant');
const cfgLib = require('../src/core/config');
const engine = require('../src/core/engine');
const statsLib = require('../src/core/stats');
const blockrules = require('../src/core/blockrules');
const { normalizeSite } = require('../src/core/domains');

function fakeApp(lang = 'en') {
  let config = cfgLib.defaults(lang);
  const now = () => Date.now();
  const ctx = {
    lang,
    now,
    config: () => config,
    evaluate: () => engine.evaluate(config, now()),
    stats: () => ({ ...statsLib.summarize(statsLib.emptyStats(), now()), devices: 1 }),
    startSession: ({ listIds, minutes, mode, pomodoro, goal }) => {
      if (config.session && config.session.endsAt > now()) return { ok: false, error: 'active' };
      const m = pomodoro ? (pomodoro.cycles || 1) * ((pomodoro.work || 25) + (pomodoro.brk || 5)) : minutes;
      config = { ...config, session: { startedAt: now(), endsAt: now() + m * 60000, listIds, mode, pomodoro: pomodoro || null, goal: goal || '', grow: 'oak' } };
      return { ok: true };
    },
    stopAll: () => { config = { ...config, session: null }; },
    extendSession: (m) => { if (!config.session) return { ok: false }; config.session.endsAt += m * 60000; return { ok: true }; },
    applyConfigChange: (partial) => {
      const cand = cfgLib.mergeEditable(config, partial);
      const ev = engine.evaluate(config, now());
      if (ev.sources.length && engine.isReduction(config, cand, now()) && ev.mode !== 'flexible') return { ok: false, error: 'locked' };
      config = cand;
      return { ok: true };
    },
    normalizeRule: (raw) => { const p = blockrules.normalizePathRule(raw); if (p) return { path: p }; const s = normalizeSite(raw); return s ? { site: s } : null; },
    knownApps: () => [{ name: 'Discord', mac: ['Discord'], win: ['Discord.exe'] }, { name: 'Steam', mac: ['Steam'], win: ['steam.exe'] }],
    helperInstalled: () => true,
  };
  return ctx;
}

test('offline: understands common commands in English and Hungarian', () => {
  let o = A.offline('block youtube.com/shorts and reddit for 2 hours strict', 'en');
  assert.equal(o.calls[0].name, 'block_sites');
  assert.deepEqual(o.calls[0].input.sites.sort(), ['reddit.com', 'youtube.com/shorts']);
  assert.equal(o.calls[1].name, 'start_focus');
  assert.equal(o.calls[1].input.minutes, 120);
  assert.equal(o.calls[1].input.mode, 'strict');
  o = A.offline('Indíts 50 perc fókuszt szigorúan', 'hu');
  assert.equal(o.calls[0].name, 'start_focus');
  assert.equal(o.calls[0].input.minutes, 50);
  assert.equal(o.calls[0].input.mode, 'strict');
  o = A.offline('Tiltsd le a tiktokot másfél órára', 'hu');
  assert.equal(o.calls[0].name, 'block_sites');
  assert.deepEqual(o.calls[0].input.sites, ['tiktok.com']);
  assert.equal(A.offline('mennyit fókuszáltam ezen a héten?', 'hu').calls[0].name, 'get_stats');
  assert.equal(A.offline('növessz fenyőt', 'hu').calls[0].input.item, 'pine');
  assert.equal(A.offline('what is the capital of France?', 'en').handled, false);
  assert.equal(A.parseMinutes(' fel ora '), 30);
  assert.equal(A.parseMinutes(' 1,5 ora '), 90);
});

test('tools: block sites, start, extend, lists, schedules, limits', async () => {
  const ctx = fakeApp('en');
  let r = await A.runTool(ctx, 'block_sites', { sites: ['https://www.youtube.com/shorts/', 'reddit.com', 'not a site'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.invalid, ['not a site']);
  const list = ctx.config().lists.find((l) => l.name === 'Blocked by AI');
  assert.deepEqual(list.sites, ['reddit.com']);
  assert.deepEqual(list.paths, ['youtube.com/shorts']);
  r = await A.runTool(ctx, 'start_focus', { minutes: 30, lists: ['blocked by ai', 'Social media'], mode: 'patient' });
  assert.equal(r.ok, true);
  assert.equal(ctx.config().session.mode, 'patient');
  assert.equal(ctx.config().session.listIds.length, 2);
  assert.equal((await A.runTool(ctx, 'start_focus', { minutes: 10 })).ok, false, 'already running');
  assert.equal((await A.runTool(ctx, 'extend_focus', { minutes: 15 })).ok, true);
  // a patient block can't be stopped or weakened by the AI
  const stop = await A.runTool(ctx, 'stop_focus', {});
  assert.equal(stop.ok, false);
  assert.match(stop.error, /patient/);
  const un = await A.runTool(ctx, 'unblock_sites', { sites: ['reddit.com'] });
  assert.equal(un.ok, false);
  assert.ok(ctx.config().lists.find((l) => l.name === 'Blocked by AI').sites.includes('reddit.com'));
  // adding more is always fine
  assert.equal((await A.runTool(ctx, 'block_apps', { apps: ['discord', 'Nonexistent App'], list: 'Blocked by AI' })).ok, true);
  r = await A.runTool(ctx, 'create_list', { name: 'Exam', emoji: '📚', sites: ['wikipedia.org', 'docs.google.com'], allow_only: true });
  assert.equal(r.ok, true);
  assert.equal(ctx.config().lists.find((l) => l.name === 'Exam').allowOnly, true);
  r = await A.runTool(ctx, 'create_schedule', { name: 'Mornings', days: [1, 2, 3, 4, 5], start: '9:00', end: '12:00', lists: ['Exam'], mode: 'strict' });
  assert.equal(r.ok, true);
  assert.equal(ctx.config().schedules.find((s) => s.name === 'Mornings').start, '09:00');
  assert.equal((await A.runTool(ctx, 'set_daily_limit', { list: 'Games', minutes: 45 })).ok, true);
  assert.equal((await A.runTool(ctx, 'set_grow', { item: 'castle' })).ok, false, 'castle is locked at 0 h');
  assert.equal((await A.runTool(ctx, 'set_grow', { item: 'pine' })).ok, true);
  const st = await A.runTool(ctx, 'get_status', {});
  assert.ok(st.blocking && st.lists.length >= 6);
  assert.ok(A.TOOLS.every((t) => t.name && t.input_schema && t.input_schema.type === 'object'));
});

test('flexible blocks can be stopped by the AI', async () => {
  const ctx = fakeApp('hu');
  await A.runTool(ctx, 'start_focus', { minutes: 20, mode: 'flexible' });
  assert.equal((await A.runTool(ctx, 'stop_focus', {})).ok, true);
  assert.equal(ctx.config().session, null);
  const reply = A.offlineReply('hu', [{ name: 'stop_focus', result: { ok: true } }]);
  assert.match(reply, /Leállítva/);
});
