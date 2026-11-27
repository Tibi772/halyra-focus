'use strict';
// Account + sync, daily limits, and the Supabase client against a local mock server.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const cfg = require('../src/core/config');
const engine = require('../src/core/engine');
const sync = require('../src/core/sync');
const statsLib = require('../src/core/stats');
const { CloudClient } = require('../src/main/cloud');

const base = () => cfg.defaults('en');
const NOW = new Date(2026, 10, 25, 14, 0, 0).getTime();

test('sync: payload carries lists/schedules/session but never PIN, AI key or stats', () => {
  const c = base();
  c.settings.pinHash = 'secret';
  c.settings.pinSalt = 'salt';
  c.settings.aiKeyEnc = 'enc:xyz';
  c.session = { startedAt: NOW, endsAt: NOW + 3600000, listIds: [c.lists[0].id], mode: 'patient', pomodoro: null };
  const p = sync.buildPayload(c, 'dev-a', NOW);
  const json = JSON.stringify(p);
  assert.equal(p.v, 1);
  assert.equal(p.lists.length, c.lists.length);
  assert.ok(p.session);
  assert.ok(!json.includes('secret') && !json.includes('enc:xyz') && !json.includes('pinHash'));
  // An expired session is not shipped.
  c.session.endsAt = NOW - 1000;
  assert.equal(sync.buildPayload(c, 'dev-a', NOW).session, null);
});

test('sync: remote lists and settings are applied when nothing is locked', () => {
  const local = base();
  const remote = base();
  remote.lists[0].sites.push('example.org');
  remote.settings.theme = 'crt';
  const p = sync.buildPayload(remote, 'dev-b', NOW);
  const r = sync.applyRemote(local, p, NOW);
  assert.equal(r.changed, true);
  assert.equal(r.keptLocal, false);
  assert.ok(r.config.lists[0].sites.includes('example.org'));
  assert.equal(r.config.settings.theme, 'crt');
});

test('sync: starting a block on another computer starts it here', () => {
  const local = base();
  const remote = JSON.parse(JSON.stringify(local));
  remote.session = { startedAt: NOW, endsAt: NOW + 25 * 60000, listIds: [remote.lists[0].id], mode: 'strict', pomodoro: null };
  remote.sessionChangedAt = NOW;
  const r = sync.applyRemote(local, sync.buildPayload(remote, 'dev-b', NOW), NOW + 1000);
  assert.ok(r.config.session);
  assert.equal(r.config.session.mode, 'strict');
  assert.ok(engine.evaluate(r.config, NOW + 2000).blocking);
});

test('sync: a locked block here cannot be ended or weakened from another device', () => {
  const local = base();
  local.session = { startedAt: NOW, endsAt: NOW + 3600000, listIds: [local.lists[0].id], mode: 'strict', pomodoro: null };
  local.sessionChangedAt = NOW;
  const remote = JSON.parse(JSON.stringify(local));
  remote.session = null; // "stopped" elsewhere
  remote.sessionChangedAt = NOW + 5000;
  remote.lists[0].sites = []; // and emptied the list
  const r = sync.applyRemote(local, sync.buildPayload(remote, 'dev-b', NOW + 5000), NOW + 6000);
  assert.equal(r.keptLocal, true);
  assert.ok(r.config.session, 'session kept');
  assert.ok(r.config.lists[0].sites.length > 0, 'list not emptied');
});

test('sync: a flexible block can be stopped from another device', () => {
  const local = base();
  local.session = { startedAt: NOW, endsAt: NOW + 3600000, listIds: [local.lists[0].id], mode: 'flexible', pomodoro: null };
  local.sessionChangedAt = NOW;
  const remote = JSON.parse(JSON.stringify(local));
  remote.session = null;
  remote.sessionChangedAt = NOW + 5000;
  const r = sync.applyRemote(local, sync.buildPayload(remote, 'dev-b', NOW + 5000), NOW + 6000);
  assert.equal(r.config.session, null);
});

test('sync: older remote session decisions do not override newer local ones', () => {
  const local = base();
  local.session = { startedAt: NOW, endsAt: NOW + 3600000, listIds: [local.lists[0].id], mode: 'flexible', pomodoro: null };
  local.sessionChangedAt = NOW + 10000;
  const remote = JSON.parse(JSON.stringify(local));
  remote.session = null;
  remote.sessionChangedAt = NOW;
  const r = sync.applyRemote(local, sync.buildPayload(remote, 'dev-b', NOW), NOW + 11000);
  assert.ok(r.config.session);
});

test('limits: list is blocked until midnight once today’s usage reaches the limit', () => {
  const c = base();
  const list = c.lists[0];
  const merged = cfg.mergeEditable(c, { lists: c.lists.map((l, i) => (i === 0 ? { ...l, limitMin: 30, limitMode: 'patient' } : l)) });
  assert.equal(merged.lists[0].limitMin, 30);
  assert.equal(engine.evaluate(merged, NOW, { usage: { [list.id]: 29 * 60 } }).blocking, false);
  const ev = engine.evaluate(merged, NOW, { usage: { [list.id]: 30 * 60 } });
  assert.equal(ev.blocking, true);
  const src = ev.sources.find((s) => s.type === 'limit');
  assert.ok(src);
  assert.equal(src.endsAt, new Date(2026, 10, 26).getTime());
  // A granted skip lifts it.
  merged.skips = { [`limit:${list.id}`]: NOW + 60000 };
  assert.equal(engine.evaluate(merged, NOW, { usage: { [list.id]: 31 * 60 } }).blocking, false);
  // Removing a limit while it is active counts as a reduction (so locks apply).
  delete merged.skips;
  const weaker = cfg.mergeEditable(merged, { lists: merged.lists.map((l, i) => (i === 0 ? { ...l, limitMin: 0 } : l)) });
  assert.equal(engine.isReduction(merged, weaker, NOW, { usage: { [list.id]: 31 * 60 } }), true);
});

test('limits: usage accumulates per list per day and caps a single tick', () => {
  const s = { days: {} };
  statsLib.addUsage(s, NOW, 'a', 2);
  statsLib.addUsage(s, NOW, 'a', 500); // capped to 10s
  statsLib.addUsage(s, NOW, 'b', 3);
  assert.deepEqual(statsLib.usageToday(s, NOW), { a: 12, b: 3 });
  assert.deepEqual(statsLib.usageToday(s, NOW + 86400000), {});
});

// --------------------------------------------------------------- mock Supabase

function mockSupabase() {
  const users = new Map(); // email -> {id, password, confirmed}
  const tokens = new Map(); // access -> userId
  const refresh = new Map(); // refresh -> userId
  const rows = new Map(); // userId -> row
  let n = 0;
  const issue = (u) => {
    n += 1;
    const access = `acc-${n}`;
    const ref = `ref-${n}`;
    tokens.set(access, u.id);
    refresh.set(ref, u.id);
    return { access_token: access, refresh_token: ref, expires_in: 3600, user: { id: u.id, email: u.email } };
  };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const send = (code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(data === undefined ? '' : JSON.stringify(data)); };
      if (req.headers.apikey !== 'anon') return send(401, { message: 'No API key' });
      const url = new URL(req.url, 'http://x');
      const json = body ? JSON.parse(body) : {};
      if (url.pathname === '/auth/v1/signup') {
        if (users.has(json.email)) return send(422, { msg: 'User already registered' });
        if (String(json.password).length < 8) return send(422, { msg: 'Password should be at least 8 characters' });
        const u = { id: `u${users.size + 1}`, email: json.email, password: json.password, confirmed: true };
        users.set(json.email, u);
        return send(200, issue(u));
      }
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
        const u = users.get(json.email);
        if (!u || u.password !== json.password) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
        return send(200, issue(u));
      }
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
        const id = refresh.get(json.refresh_token);
        if (!id) return send(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
        refresh.delete(json.refresh_token);
        return send(200, issue([...users.values()].find((u) => u.id === id)));
      }
      if (url.pathname === '/auth/v1/recover') return send(200, {});
      const uid = tokens.get(String(req.headers.authorization || '').replace('Bearer ', ''));
      if (url.pathname === '/rest/v1/halyra_sync') {
        if (!uid) return send(401, { message: 'JWT expired' });
        if (req.method === 'GET') {
          const want = (url.searchParams.get('user_id') || '').replace('eq.', '');
          const cols = (url.searchParams.get('select') || 'data,device,updated_at').split(',');
          const pickCols = (r) => Object.fromEntries(cols.map((c) => [c, r[c]]));
          return send(200, want === uid && rows.has(uid) ? [pickCols(rows.get(uid))] : []); // RLS: only own row
        }
        if (req.method === 'POST') {
          for (const r of json) {
            if (r.user_id !== uid) return send(403, { message: 'new row violates row-level security policy' });
            rows.set(uid, { data: r.data, device: r.device, updated_at: r.updated_at });
          }
          return send(201);
        }
      }
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        if (!uid) return send(401, { message: 'JWT expired' });
        const fn = url.pathname.slice('/rest/v1/rpc/'.length);
        calls.push({ fn, uid, args: json });
        if (fn === 'halyra_lb_create_group') return send(200, [{ id: 'g1', name: json.p_name, code: 'ABC123' }]);
        if (fn === 'halyra_lb_join') return json.p_code === 'ABC123' ? send(200, [{ id: 'g1', name: 'Club', code: 'ABC123' }]) : send(400, { message: 'group not found' });
        if (fn === 'halyra_lb_board') return send(200, [{ rank: 1, name: 'Anna', emoji: '🦊', week_minutes: 120, level: 4, streak: 2, me: true }]);
        if (fn === 'halyra_lb_groups_mine') return send(200, [{ id: 'g1', name: 'Club', code: 'ABC123', members: 2, owner: true }]);
        return send(200, null);
      }
      return send(404, { message: 'not found' });
    });
  });
  const calls = [];
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}`, rows, refresh, calls })));
}

const memStore = () => { let s = null; return { load: () => s, save: (v) => { s = v; }, peek: () => s }; };

test('cloud: not configured → clear error, nothing breaks', async () => {
  const c = new CloudClient({ url: '', anonKey: '' }, memStore());
  assert.equal(c.enabled(), false);
  await assert.rejects(c.signIn('a@b.c', 'password1'), (e) => e.code === 'notConfigured');
});

test('cloud: sign up, push, sign in on a second device, pull, refresh, errors', async () => {
  const mock = await mockSupabase();
  try {
    const storeA = memStore();
    const a = new CloudClient({ url: mock.url, anonKey: 'anon' }, storeA);
    assert.equal(a.enabled(), true);
    await assert.rejects(a.signUp('me@example.com', 'short'), (e) => e.code === 'weakPassword');
    assert.deepEqual(await a.signUp('me@example.com', 'correct-horse'), { signedIn: true });
    assert.equal(a.email(), 'me@example.com');
    assert.ok(storeA.peek().refresh_token, 'session persisted');
    await assert.rejects(a.signUp('me@example.com', 'correct-horse'), (e) => e.code === 'exists');
    assert.equal(await a.pull(), null);
    const payload = sync.buildPayload(base(), 'dev-a', NOW);
    const at = await a.push(payload, 'dev-a');
    assert.match(at, /^\d{4}-\d\d-\d\dT/, 'push tells which stamp it wrote');
    const meta = await a.pullMeta();
    assert.deepEqual(Object.keys(meta).sort(), ['device', 'updated_at'], 'the poll downloads only the stamp');
    assert.equal(meta.updated_at, at);

    // leaderboard calls go to the right functions with the right argument names
    await a.lbReport({ name: 'Anna', emoji: '🦊', public: true, weekStart: '2026-11-23', weekMinutes: 120.4, totalMinutes: 900, level: 4, streak: 2 });
    const rep = mock.calls.find((c) => c.fn === 'halyra_lb_report');
    assert.deepEqual(rep.args, { p_name: 'Anna', p_emoji: '🦊', p_public: true, p_week_start: '2026-11-23', p_week_minutes: 120, p_total: 900, p_level: 4, p_streak: 2 });
    assert.equal((await a.lbCreateGroup('Club')).code, 'ABC123');
    assert.equal((await a.lbJoin('ABC123')).id, 'g1');
    await assert.rejects(a.lbJoin('NOPE00'));
    assert.equal((await a.lbBoard('group', 'g1'))[0].me, true);
    assert.deepEqual(mock.calls.find((c) => c.fn === 'halyra_lb_board').args, { p_scope: 'group', p_group: 'g1' });
    assert.equal((await a.lbGroups())[0].members, 2);

    const b = new CloudClient({ url: mock.url, anonKey: 'anon' }, memStore());
    await assert.rejects(b.signIn('me@example.com', 'wrong-password'), (e) => e.code === 'badLogin');
    await b.signIn('me@example.com', 'correct-horse');
    const row = await b.pull();
    assert.equal(row.device, 'dev-a');
    assert.equal(row.data.lists.length, payload.lists.length);

    // Expired access token → refresh transparently.
    b.session.expires_at = Math.floor(Date.now() / 1000) - 10;
    const before = b.session.access_token;
    assert.ok(await b.pull());
    assert.notEqual(b.session.access_token, before);

    // Revoked refresh token → signed out with an auth-type error.
    b.session.expires_at = 0;
    mock.refresh.clear();
    await assert.rejects(b.pull());
    assert.equal(b.signedIn(), false);

    // A session survives an app restart via the store.
    const a2 = new CloudClient({ url: mock.url, anonKey: 'anon' }, { load: () => storeA.peek(), save: () => {} });
    assert.equal(a2.signedIn(), true);
    assert.equal((await a2.pull()).device, 'dev-a');
    a.signOut();
    assert.equal(storeA.peek(), null);
  } finally {
    mock.server.close();
  }
});

test('web usage: front tab URL and Windows window titles are matched to list sites', () => {
  const web = require('../src/core/webusage');
  assert.equal(web.hostOf('https://www.youtube.com/watch?v=1'), 'youtube.com');
  assert.equal(web.hostOf('chrome://newtab'), '');
  assert.equal(web.stem('bbc.co.uk'), 'bbc');
  assert.equal(web.stem('web.whatsapp.com'), 'whatsapp');
  const sites = ['youtube.com', 'reddit.com', 'x.com'];
  assert.equal(web.pageMatches({ host: 'm.youtube.com' }, sites), true);
  assert.equal(web.pageMatches({ host: 'notyoutube.com' }, sites), false);
  const csv = [
    '"chrome.exe","4242","Console","1","312,000 K","Running","PC\\\\anna","0:01:02","(3) YouTube - Google Chrome"',
    '"Code.exe","100","Console","1","200,000 K","Running","PC\\\\anna","0:00:10","youtube-dl.js - Visual Studio Code"',
    '"msedge.exe","77","Console","1","100,000 K","Running","PC\\\\anna","0:00:01","N/A"',
  ].join('\r\n');
  const titles = web.parseWinTitles(csv);
  assert.deepEqual(titles, ['(3) YouTube - Google Chrome']);
  assert.equal(web.pageMatches({ titles }, sites), true);
  assert.equal(web.pageMatches({ titles: ['Inbox - Gmail - Google Chrome'] }, sites), false, 'short stems like "x" never match titles');
  assert.equal(web.pageMatches(null, sites), false);
});
