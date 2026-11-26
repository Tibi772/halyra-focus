'use strict';
// Always-on lists, earn-to-unlock lists, keyword blocking and SafeSearch.
const test = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../src/core/engine');
const cfg = require('../src/core/config');
const hosts = require('../src/core/hosts');
const rules = require('../src/core/blockrules');
const sync = require('../src/core/sync');
const { PRESETS } = require('../src/core/presets');
const plan = require('../src/mobile/plan');

const NOW = new Date(2026, 10, 26, 14, 0).getTime(); // Thursday afternoon
const H = 3600 * 1000;

function config(lists, extra = {}) {
  const d = cfg.defaults('en');
  return { ...d, lists: cfg.sanitizeLists(lists), schedules: [], session: null, ...extra };
}

const adult = { id: 'adult', name: 'Adult', sites: ['pornhub.com', 'xvideos.com'], keywords: ['porn', 'sex cam'], always: true, safe: true };
const games = { id: 'games', name: 'Games', sites: ['store.steampowered.com'], apps: [{ name: 'Steam', mac: ['Steam'], win: ['steam.exe'] }], earn: true };
const work = { id: 'work', name: 'Social', sites: ['reddit.com'] };

test('config keeps standing flags, keywords and sane earn ratio', () => {
  const [a, g, w] = cfg.sanitizeLists([adult, { ...games, always: true }, work]);
  assert.equal(a.always, true);
  assert.equal(a.safe, true);
  assert.deepEqual(a.keywords, ['porn', 'sex cam']);
  assert.equal(g.earn, true);
  assert.equal(g.always, false, 'earn wins over always — never both');
  assert.equal(w.always, false);
  assert.equal(w.earn, false);
  assert.deepEqual(cfg.cleanKeywords(['  PoRn ', 'ab', 'x'.repeat(41), 'ok<script>', 'Pornó', 'porn']), ['porn', 'pornó']);
  const n = cfg.normalizeLoaded({ ...config([games]), passes: { games: NOW + H, ghost: NOW + H }, settings: { earnRatio: 5 } }, 'en');
  assert.deepEqual(Object.keys(n.passes), ['games'], 'passes only for lists that exist');
  assert.equal(n.settings.earnRatio, 3, 'unknown ratio falls back to 1:3');
});

test('engine: always lists block with no focus running, focus semantics unchanged', () => {
  const c = config([adult, work]);
  const ev = engine.evaluate(c, NOW);
  assert.equal(ev.blocking, false, 'a standing list is not a focus block');
  assert.equal(ev.standing.any, true);
  assert.deepEqual(ev.standing.listIds, ['adult']);
  assert.ok(ev.standing.sites.includes('pornhub.com'));
  assert.ok(!ev.standing.sites.includes('reddit.com'));
  assert.equal(ev.standing.safe, true);
  const enf = engine.enforced(ev);
  assert.equal(enf.any, true);
  assert.equal(enf.expiresAt, null, 'never expires on its own');
  assert.ok(enf.keywords.includes('porn'));
  // With a focus session the two merge, and the focus end doesn't end the always list.
  const c2 = { ...c, session: { listIds: ['work'], startedAt: NOW - H, endsAt: NOW + H, mode: 'patient' } };
  const e2 = engine.enforced(engine.evaluate(c2, NOW));
  assert.ok(e2.sites.includes('reddit.com') && e2.sites.includes('pornhub.com'));
  assert.equal(e2.expiresAt, null);
});

test('engine: earn lists are blocked until a pass is spent, then come back', () => {
  const c = config([games]);
  let st = engine.standing(c, NOW);
  assert.deepEqual(st.listIds, ['games']);
  assert.ok(st.apps.some((a) => (a.win || []).includes('steam.exe')));
  const open = { ...c, passes: { games: NOW + 10 * 60 * 1000 } };
  st = engine.standing(open, NOW);
  assert.equal(st.any, false, 'open while the pass runs');
  assert.equal(st.nextPassEnd, NOW + 10 * 60 * 1000);
  assert.equal(engine.standing(open, NOW + 11 * 60 * 1000).any, true, 'locked again after');
});

test('engine: weakening a standing list is a reduction (PIN-protected)', () => {
  const c = config([adult, work]);
  const lists = (fn) => config(c.lists.map((l) => (l.id === 'adult' ? fn(l) : l)));
  assert.equal(engine.standingReduction(c, lists((l) => ({ ...l, always: false })), NOW), true);
  assert.equal(engine.standingReduction(c, lists((l) => ({ ...l, sites: ['pornhub.com'] })), NOW), true);
  assert.equal(engine.standingReduction(c, lists((l) => ({ ...l, keywords: ['porn'] })), NOW), true);
  assert.equal(engine.standingReduction(c, lists((l) => ({ ...l, safe: false })), NOW), true);
  assert.equal(engine.standingReduction(c, lists((l) => ({ ...l, sites: [...l.sites, 'onlyfans.com'] })), NOW), false, 'adding is fine');
  assert.equal(engine.standingReduction(c, config(c.lists.map((l) => (l.id === 'work' ? { ...l, sites: [] } : l))), NOW), false, 'normal lists are not standing');
  assert.equal(engine.standingReduction(config([games]), config([{ ...games, earn: false }]), NOW), true);
});

test('keyword blocking matches whole words and phrases only', () => {
  const kw = ['porn', 'sex cam', 'kaszinó'];
  assert.equal(rules.keywordHit('https://www.google.com/search?q=free+porn+videos', kw), 'porn');
  assert.equal(rules.keywordHit('https://duckduckgo.com/?q=Live%20Sex%20Cam%20chat', kw), 'sex cam');
  assert.equal(rules.keywordHit('Legjobb online KASZINÓ bónusz – Google Keresés', kw), 'kaszinó');
  assert.equal(rules.keywordHit('https://example.com/pornography-research', kw), null, 'no partial words');
  assert.equal(rules.keywordHit('Essex campus map', kw), null, '"sex cam" must not hit "Essex campus"');
  assert.equal(rules.keywordHit('anything', []), null);
});

test('presets: adult is always-on with SafeSearch, gambling carries keywords and apps', () => {
  const a = PRESETS.find((p) => p.id === 'adult');
  const g = PRESETS.find((p) => p.id === 'gambling');
  assert.ok(a && g);
  assert.equal(a.always, true);
  assert.equal(a.safe, true);
  assert.ok(a.sites.length > 40);
  assert.ok(a.keywords.includes('porn'));
  const l = cfg.presetToList(a, 'hu');
  assert.equal(l.always, true);
  assert.equal(l.safe, true);
  assert.ok(l.keywords.length > 5);
  assert.ok(g.keywords.length && g.apps.length);
  for (const p of PRESETS) for (const s of p.sites || []) assert.match(s, /^[a-z0-9.-]+\.[a-z]{2,}$/, `${p.id}: ${s}`);
});

test('hosts: SafeSearch lines and blocklist flag round-trip', () => {
  const lines = hosts.safeSearchLines();
  assert.ok(lines.includes('216.239.38.120 www.google.com'));
  assert.ok(lines.includes('216.239.38.120 www.google.hu'));
  assert.ok(lines.includes('216.239.38.120 www.youtube.com'));
  assert.ok(lines.includes('204.79.197.220 www.bing.com'));
  for (const l of lines) assert.match(l, /^[0-9a-f.:]+ [a-z0-9.-]+$/);
  const file = hosts.blocklistFile(['pornhub.com'], null, { safe: true });
  assert.ok(file.includes('# safesearch'));
  const back = hosts.parseBlocklist(file);
  assert.equal(back.safe, true);
  assert.deepEqual(back.hosts, ['pornhub.com']);
  assert.equal(hosts.parseBlocklist(hosts.blocklistFile(['pornhub.com'], null, {})).safe, false);
});

test('sync: passes travel, the latest future one wins, unknown lists are ignored', () => {
  const local = { ...config([games]), passes: { games: NOW + 5 * 60 * 1000 } };
  const payload = sync.buildPayload(local, 'dev-a', NOW);
  assert.deepEqual(payload.passes, local.passes);
  const remote = { ...payload, passes: { games: NOW + 20 * 60 * 1000, ghost: NOW + H } };
  const r = sync.applyRemote(local, remote, NOW);
  assert.equal(r.config.passes.games, NOW + 20 * 60 * 1000);
  assert.equal(r.config.passes.ghost, undefined);
  assert.equal(r.changed, true);
  const older = sync.applyRemote(r.config, { ...payload, passes: { games: NOW + 60 * 1000 } }, NOW);
  assert.equal(older.config.passes.games, NOW + 20 * 60 * 1000, 'an older pass never shortens a newer one');
  const expired = sync.applyRemote(local, { ...payload, passes: { games: NOW - 1 } }, NOW);
  assert.equal(expired.config.passes.games, NOW + 5 * 60 * 1000);
});

test('android plan: always lists last past the horizon, without an end time', () => {
  const c = config([adult]);
  const p = plan.buildPlan(c, NOW);
  assert.ok(p.windows.length >= 1);
  const last = p.windows[p.windows.length - 1];
  assert.equal(last.to, plan.FOREVER);
  assert.equal(last.standing, true);
  assert.equal(last.safe, true);
  assert.ok(last.domains.includes('pornhub.com') && last.domains.includes('www.pornhub.com'));
  const a = plan.activeAt(p, NOW + 400 * 24 * H);
  assert.ok(a.domains.includes('pornhub.com'));
  assert.equal(a.safe, true);
  assert.equal(a.endsAt, null);
  assert.equal(a.mode, null);
  assert.ok(JSON.stringify(p).length < 200000);
});

test('android plan: earn pass opens a gap, focus adds its own window on top', () => {
  const c = { ...config([games, work]), passes: { games: NOW + 30 * 60 * 1000 },
    session: { listIds: ['work'], startedAt: NOW - H, endsAt: NOW + H, mode: 'strict' } };
  const p = plan.buildPlan(c, NOW);
  const at = (t) => plan.activeAt(p, t);
  const now = at(NOW + 60 * 1000);
  assert.ok(now.domains.includes('reddit.com'));
  assert.ok(!now.domains.includes('store.steampowered.com'), 'games open during the pass');
  assert.equal(now.mode, 'strict');
  assert.equal(now.endsAt, NOW + H);
  const later = at(NOW + 40 * 60 * 1000);
  assert.ok(later.domains.includes('store.steampowered.com'), 'locked again after the pass');
  assert.ok(later.domains.includes('reddit.com'));
  const after = at(NOW + 2 * H);
  assert.ok(after.domains.includes('store.steampowered.com'));
  assert.ok(!after.domains.includes('reddit.com'), 'focus is over');
  assert.equal(after.endsAt, null);
});

test('cool-down: weakening waits, then a 24 h window opens and closes', () => {
  const c = { ...config([adult]), settings: { ...cfg.defaults('en').settings, coolDownH: 24 } };
  assert.equal(engine.coolDown(c, NOW).state, 'idle');
  const lower = { ...c, settings: { ...c.settings, coolDownH: 1 } };
  assert.equal(engine.standingWeakening(c, lower, NOW), true, 'a shorter cool-down is a weakening too');
  assert.equal(engine.standingWeakening(c, { ...c, settings: { ...c.settings, coolDownH: 72 } }, NOW), false);
  const waiting = { ...c, unlockAt: NOW + 24 * H };
  assert.equal(engine.coolDown(waiting, NOW).state, 'waiting');
  assert.equal(engine.coolDown(waiting, NOW + 25 * H).state, 'open');
  assert.equal(engine.coolDown(waiting, NOW + 25 * H).closes, NOW + 48 * H);
  assert.equal(engine.coolDown(waiting, NOW + 49 * H).state, 'idle');
  assert.equal(engine.coolDown(config([adult]), NOW).state, 'off');
  const n = cfg.normalizeLoaded({ ...waiting, settings: { ...waiting.settings, coolDownH: 5 } }, 'en');
  assert.equal(n.unlockAt, NOW + 24 * H);
  assert.equal(n.settings.coolDownH, 0, 'only 0/1/24/72');
});

test('assistant: protection, keywords and earned minutes go through the same rules', async () => {
  const assistant = require('../src/core/assistant');
  let c = config([adult, games, work]);
  let wallet = 12;
  const ctx = {
    lang: 'en', now: () => NOW, config: () => c, evaluate: () => engine.evaluate(c, NOW), stats: () => ({ last7: [], streak: 0, totalHours: 0 }),
    cleanKeywords: cfg.cleanKeywords, wallet: () => wallet,
    applyConfigChange: (p) => {
      const next = cfg.mergeEditable(c, p);
      if (engine.standingWeakening(c, next, NOW)) return { ok: false, error: 'cooldown' };
      c = next; return { ok: true };
    },
    spendEarned: (id, m) => { if (m > wallet) return { ok: false, error: 'balance' }; wallet -= m; c = { ...c, passes: { ...c.passes, [id]: NOW + m * 60000 } }; return { ok: true }; },
  };
  let r = await assistant.runTool(ctx, 'set_list_protection', { list: 'Social', kind: 'always', safe_search: true });
  assert.equal(r.ok, true);
  assert.equal(c.lists.find((l) => l.id === 'work').always, true);
  r = await assistant.runTool(ctx, 'set_list_protection', { list: 'Adult', kind: 'normal' });
  assert.equal(r.ok, false);
  assert.match(r.error, /Cool-down/);
  r = await assistant.runTool(ctx, 'block_keywords', { keywords: ['casino', 'x'], list: 'Games' });
  assert.deepEqual(r.added, ['casino']);
  r = await assistant.runTool(ctx, 'spend_earned_minutes', { list: 'Games', minutes: 30 });
  assert.equal(r.ok, false);
  r = await assistant.runTool(ctx, 'spend_earned_minutes', { list: 'Games', minutes: 10 });
  assert.equal(r.ok, true);
  assert.equal(r.earnedMinutesLeft, 2);
  const st = assistant.status({ ...ctx, helperInstalled: () => true });
  assert.equal(st.lists.find((l) => l.name === 'Games').kind, 'earn');
  assert.equal(st.lists.find((l) => l.name === 'Adult').safeSearch, true);
  assert.ok(assistant.TOOLS.some((t) => t.name === 'set_list_protection'));
});

test('sync: the website cannot loosen always-on lists behind a PIN or a cool-down', () => {
  const local = config([adult, work]);
  const loosened = cfg.mergeEditable(local, { lists: local.lists.map((l) => (l.id === 'adult' ? { ...l, always: false } : l)) });
  const fromWeb = { ...sync.buildPayload(loosened, 'web-abc', NOW), device: 'web-abc' };
  assert.equal(sync.applyRemote(local, fromWeb, NOW, { pinSet: true }).config.lists.find((l) => l.id === 'adult').always, true);
  assert.equal(sync.applyRemote(local, fromWeb, NOW, { pinSet: false }).config.lists.find((l) => l.id === 'adult').always, false, 'no PIN, no cool-down: user choice');
  const cooled = { ...local, settings: { ...local.settings, coolDownH: 24 } };
  const fromMac = { ...sync.buildPayload(loosened, 'mac-1', NOW), device: 'mac-1' };
  assert.equal(sync.applyRemote(cooled, fromMac, NOW).config.lists.find((l) => l.id === 'adult').always, true, 'cool-down holds');
  // The other device waited out the countdown: its unlock travels, and the change is accepted.
  const opened = { ...fromMac, unlockAt: NOW - H, unlockChangedAt: NOW - 25 * H };
  const r = sync.applyRemote(cooled, opened, NOW);
  assert.equal(r.config.unlockAt, NOW - H);
  assert.equal(r.config.lists.find((l) => l.id === 'adult').always, false);
  // Adding sites from anywhere is always fine.
  const added = cfg.mergeEditable(local, { lists: local.lists.map((l) => (l.id === 'adult' ? { ...l, sites: [...l.sites, 'onlyfans.com'] } : l)) });
  const r2 = sync.applyRemote(cooled, { ...sync.buildPayload(added, 'web-abc', NOW), device: 'web-abc' }, NOW, { pinSet: true });
  assert.ok(r2.config.lists.find((l) => l.id === 'adult').sites.includes('onlyfans.com'));
});
