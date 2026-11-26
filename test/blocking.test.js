'use strict';
// Website rules beyond whole domains + the local block page + helper file format.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const vm = require('vm');
const rules = require('../src/core/blockrules');
const hosts = require('../src/core/hosts');
const engine = require('../src/core/engine');
const cfgLib = require('../src/core/config');
const helper = require('../src/core/helperScripts');
const browsers = require('../src/main/browsers');
const blockserver = require('../src/main/blockserver');

test('part-of-site rules normalize', () => {
  assert.equal(rules.normalizePathRule('https://www.YouTube.com/shorts/?x=1'), 'youtube.com/shorts');
  assert.equal(rules.normalizePathRule('reddit.com/r/all/'), 'reddit.com/r/all');
  assert.equal(rules.normalizePathRule('youtube.com'), null);
  assert.equal(rules.normalizePathRule('youtube.com/'), null);
  assert.equal(rules.normalizePathRule('not a site/x'), null);
});

test('urlBlocked: hosts, parts, allowlist', () => {
  const r = { hosts: ['reddit.com'], paths: ['youtube.com/shorts'], allow: null };
  assert.equal(rules.urlBlocked('https://old.reddit.com/r/x', r), 'old.reddit.com');
  assert.equal(rules.urlBlocked('https://www.youtube.com/shorts/abc', r), 'youtube.com/shorts');
  assert.equal(rules.urlBlocked('https://www.youtube.com/shorts', r), 'youtube.com/shorts');
  assert.equal(rules.urlBlocked('https://www.youtube.com/shortsx', r), null);
  assert.equal(rules.urlBlocked('https://www.youtube.com/watch?v=1', r), null);
  assert.equal(rules.urlBlocked('http://127.0.0.1:47321/blocked', r), null);
  assert.equal(rules.urlBlocked('chrome://settings', r), null);
  const a = { hosts: [], paths: [], allow: ['wikipedia.org'] };
  assert.equal(rules.urlBlocked('https://en.wikipedia.org/wiki/X', a), null);
  assert.equal(rules.urlBlocked('https://news.ycombinator.com/', a), 'news.ycombinator.com');
});

test('engine: paths, allow-only lists keep blocking their apps', () => {
  const config = cfgLib.normalizeLoaded({
    lists: [
      { id: 'a', name: 'A', emoji: '⛔', sites: ['reddit.com'], paths: ['youtube.com/shorts'], apps: [] },
      { id: 'b', name: 'B', emoji: '📚', sites: ['wikipedia.org'], allowOnly: true, apps: [{ name: 'Discord', mac: ['Discord'], win: ['Discord.exe'] }] },
    ],
  }, 'en');
  const now = Date.now();
  config.session = { startedAt: now, endsAt: now + 60000, listIds: ['a', 'b'], mode: 'flexible' };
  const ev = engine.evaluate(config, now, {});
  assert.deepEqual(ev.sites, ['reddit.com']);
  assert.deepEqual(ev.paths, ['youtube.com/shorts']);
  assert.deepEqual(ev.allow, ['wikipedia.org']);
  assert.equal(ev.apps.length, 1);
  config.lists[1].sites = [];
  assert.equal(engine.evaluate(config, now, {}).allow, null, 'empty allow-only list blocks nothing extra');
});

test('blocklist file carries parts + allowlist for the helper', () => {
  const f = hosts.blocklistFile(['youtube.com', 'www.youtube.com', 'bad host'], Date.now() + 60000, { paths: ['youtube.com/shorts', "evil.com/'x"], allow: [] });
  const b = hosts.parseBlocklist(f);
  assert.deepEqual(b.hosts, ['www.youtube.com', 'youtube.com']);
  assert.deepEqual(b.paths, ['youtube.com/shorts']);
  assert.deepEqual(hosts.policyFromBlocklist(b).block, ['youtube.com', 'youtube.com/shorts']);
  const al = hosts.policyFromBlocklist(hosts.parseBlocklist(hosts.blocklistFile([], Date.now() + 1000, { allow: ['wikipedia.org'] })));
  assert.deepEqual(al.block, ['*']);
  assert.ok(al.allow.includes('wikipedia.org') && al.allow.includes('127.0.0.1'));
  // Old helpers only read plain domain lines: the extra lines are comments.
  for (const l of f.split('\n')) if (l && !hosts.DOMAIN_RE.test(l)) assert.ok(l.startsWith('#'), l);
});

test('Windows helper script contains the policy sync and its version', () => {
  const ps = helper.winHelperPs1();
  assert.match(ps, /halyra-helper-version: 8/);
  assert.match(ps, /ForceGoogleSafeSearch/);
  assert.match(ps, /ForceYouTubeRestrict/);
  assert.match(ps, /URLBlocklist/);
  assert.match(ps, /URLAllowlist/);
  assert.ok(!ps.includes('${'), 'no unresolved template placeholders');
  assert.ok(!/\$pid\b/i.test(browsers.WIN_WATCHER), 'watcher must not assign to $PID');
});

test('the macOS tab sweep runs the shared matcher (self-contained)', () => {
  const ctx = { JSON, encodeURIComponent, Set };
  vm.createContext(ctx);
  vm.runInContext(browsers.JXA_SWEEP, ctx);
  assert.equal(ctx.urlBlocked('https://m.youtube.com/shorts/1', { hosts: new Set(), paths: ['youtube.com/shorts'], allow: null }), 'youtube.com/shorts');
  assert.deepEqual(browsers.titleStems(['youtube.com', 'x.com', 'bbc.co.uk', 'web.whatsapp.com']), ['whatsapp', 'youtube']);
});

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: d })); }).on('error', reject);
  });
}

test('local block page server', async () => {
  let seen = null;
  const s = blockserver.start({ root: path.join(__dirname, '..', 'src', 'renderer'), ports: [47391, 47392], data: (q) => { seen = q; return { blocked: true, endsAt: 1, mode: 'strict' }; } });
  for (let i = 0; i < 50 && !s.url; i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(s.url, 'listening');
  const page = await get(`${s.url}?site=reddit.com&u=https%3A%2F%2Freddit.com%2F`);
  assert.equal(page.status, 200);
  assert.match(page.body, /block\.js/);
  const st = await get(`http://127.0.0.1:${s.port}/state.json?site=reddit.com&u=https%3A%2F%2Freddit.com%2F`);
  assert.equal(JSON.parse(st.body).mode, 'strict');
  assert.equal(seen.site, 'reddit.com');
  assert.equal(seen.u, 'https://reddit.com/');
  assert.equal((await get(`http://127.0.0.1:${s.port}/block.js`)).status, 200);
  assert.equal((await get(`http://127.0.0.1:${s.port}/../main/main.js`)).status, 404);
  assert.equal((await get(`http://127.0.0.1:${s.port}/app.js`)).status, 404);
  s.close();
});
