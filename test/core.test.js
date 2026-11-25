'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { scheduleWindow, nextStart, parseHM } = require('../src/core/schedule');
const { normalizeSite, expandHosts } = require('../src/core/domains');
const hosts = require('../src/core/hosts');
const engine = require('../src/core/engine');
const cfg = require('../src/core/config');
const stats = require('../src/core/stats');
const { Unlocker, makeChallenge } = require('../src/core/unlock');
const proc = require('../src/core/procmatch');
const helper = require('../src/core/helperScripts');

const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi);
// 2026-11-23 is a Monday
const MON = (h, mi) => at(2026, 11, 23, h, mi);

test('parseHM', () => {
  assert.equal(parseHM('09:30'), 570);
  assert.equal(parseHM('24:00'), 1440);
  assert.equal(parseHM('25:00'), null);
  assert.equal(parseHM('9:5'), null);
});

test('daytime schedule window', () => {
  const s = { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' };
  assert.equal(scheduleWindow(s, MON(8, 59)).active, false);
  const w = scheduleWindow(s, MON(9, 0));
  assert.equal(w.active, true);
  assert.equal(w.endsAt, MON(17, 0).getTime());
  assert.equal(scheduleWindow(s, MON(17, 0)).active, false);
  assert.equal(scheduleWindow(s, at(2026, 11, 22, 10)).active, false); // Sunday
});

test('overnight schedule window', () => {
  const s = { days: [1], start: '22:00', end: '07:00' }; // Monday night
  assert.equal(scheduleWindow(s, MON(23, 0)).active, true);
  assert.equal(scheduleWindow(s, MON(23, 0)).endsAt, at(2026, 11, 24, 7).getTime());
  assert.equal(scheduleWindow(s, at(2026, 11, 24, 6, 59)).active, true); // Tuesday morning belongs to Monday
  assert.equal(scheduleWindow(s, at(2026, 11, 24, 7, 0)).active, false);
  assert.equal(scheduleWindow(s, MON(6, 0)).active, false); // Sunday not selected
});

test('all-day schedule spans consecutive days', () => {
  const s = { days: [6, 0], start: '00:00', end: '00:00' };
  const w = scheduleWindow(s, at(2026, 11, 28, 15)); // Saturday
  assert.equal(w.active, true);
  assert.equal(w.endsAt, at(2026, 11, 30, 0).getTime()); // Monday 00:00
});

test('nextStart', () => {
  const s = { days: [1, 3], start: '09:00', end: '10:00' };
  assert.equal(nextStart(s, MON(9, 30)), at(2026, 11, 25, 9).getTime());
  assert.equal(nextStart(s, MON(8, 0)), MON(9, 0).getTime());
});

test('normalizeSite', () => {
  assert.equal(normalizeSite('https://www.YouTube.com/watch?v=1'), 'youtube.com');
  assert.equal(normalizeSite('reddit.com/r/funny'), 'reddit.com');
  assert.equal(normalizeSite('*.tiktok.com'), 'tiktok.com');
  assert.equal(normalizeSite('web.whatsapp.com'), 'web.whatsapp.com');
  assert.equal(normalizeSite('index.hu:443'), 'index.hu');
  assert.equal(normalizeSite('bücher.de'), 'xn--bcher-kva.de');
  assert.equal(normalizeSite('localhost'), null);
  assert.equal(normalizeSite('192.168.0.1'), null);
  assert.equal(normalizeSite('bad_domain.com'), null);
  assert.equal(normalizeSite('-bad.com'), null);
  assert.equal(normalizeSite(''), null);
});

test('expandHosts adds variants and extras', () => {
  const h = expandHosts(['youtube.com', 'bbc.co.uk', 'news.google.com']);
  for (const x of ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.bbc.co.uk', 'news.google.com']) assert.ok(h.includes(x), x);
  assert.ok(!h.includes('www.news.google.com'));
  assert.deepEqual(h, [...h].sort());
});

test('hosts section apply/strip is idempotent', () => {
  const original = '127.0.0.1 localhost\n::1 localhost\n';
  const withBlock = hosts.applySection(original, ['a.com', 'www.a.com']);
  assert.ok(withBlock.startsWith(original));
  assert.ok(withBlock.includes('0.0.0.0 a.com\n:: a.com\n'));
  assert.equal(hosts.applySection(withBlock, ['a.com', 'www.a.com']), withBlock);
  assert.equal(hosts.stripSection(withBlock), original);
  assert.equal(hosts.applySection(withBlock, []), original);
  assert.deepEqual([...hosts.sectionHosts(withBlock)].sort(), ['a.com', 'www.a.com']);
  assert.equal(hosts.buildSection(['evil.com 1.2.3.4', 'ok.com']).includes('evil'), false);
});

test('mac helper.sh mirrors the blocklist and rejects junk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-'));
  const hostsFile = path.join(dir, 'hosts');
  const rules = path.join(dir, 'blocklist.txt');
  const script = path.join(dir, 'helper.sh');
  fs.writeFileSync(script, helper.macHelperSh());
  const original = '##\n127.0.0.1\tlocalhost\n255.255.255.255\tbroadcasthost\n::1             localhost';
  fs.writeFileSync(hostsFile, original);
  const env = { ...process.env, HALYRA_HOSTS: hostsFile, HALYRA_RULES: rules, HALYRA_NOFLUSH: '1' };
  const run = () => execFileSync('/bin/sh', [script], { env });

  fs.writeFileSync(rules, hosts.blocklistFile(['b.com', 'a.com']) + '1.2.3.4 bank.com\n../etc\nUPPER.COM\n');
  run();
  const once = fs.readFileSync(hostsFile, 'utf8');
  assert.ok(once.startsWith(original + '\n'));
  assert.ok(once.includes('0.0.0.0 a.com\n:: a.com\n0.0.0.0 b.com\n:: b.com\n'));
  assert.ok(!once.includes('bank.com'));
  assert.ok(!once.includes('UPPER'));
  assert.equal(once, hosts.applySection(original, ['a.com', 'b.com']));

  run();
  assert.equal(fs.readFileSync(hostsFile, 'utf8'), once, 'idempotent');

  fs.writeFileSync(rules, hosts.blocklistFile([]));
  run();
  assert.equal(fs.readFileSync(hostsFile, 'utf8'), original + '\n');

  // expired blocklists are ignored, future ones applied
  fs.writeFileSync(rules, hosts.blocklistFile(['a.com'], Date.now() - 1000));
  run();
  assert.equal(fs.readFileSync(hostsFile, 'utf8'), original + '\n', 'expired list ignored');
  fs.writeFileSync(rules, hosts.blocklistFile(['a.com'], Date.now() + 3600000));
  run();
  assert.ok(fs.readFileSync(hostsFile, 'utf8').includes('0.0.0.0 a.com'), 'future expiry applied');
  assert.match(hosts.blocklistFile(['a.com'], 1700000000500), /# expires=1700000001\n/);

  // symlinked rules file is ignored
  fs.writeFileSync(path.join(dir, 'secret'), 'secret.example.com\n');
  fs.unlinkSync(rules);
  fs.symlinkSync(path.join(dir, 'secret'), rules);
  run();
  assert.ok(!fs.readFileSync(hostsFile, 'utf8').includes('secret'));
});

function baseConfig() {
  const c = cfg.defaults('en');
  return c;
}

test('engine: session + schedule union, pomodoro phases', () => {
  const c = baseConfig();
  const social = c.lists.find((l) => l.presetId === 'social');
  const games = c.lists.find((l) => l.presetId === 'games');
  const now = MON(10, 0).getTime();
  c.session = { startedAt: now - 10 * 60000, endsAt: now + 50 * 60000, listIds: [games.id], mode: 'patient', pomodoro: null };
  c.schedules[0].enabled = true;
  c.schedules[0].listIds = [social.id];
  const ev = engine.evaluate(c, now);
  assert.equal(ev.blocking, true);
  assert.equal(ev.mode, 'patient');
  assert.ok(ev.sites.includes('reddit.com'));
  assert.ok(ev.sites.includes('roblox.com'));
  assert.ok(ev.apps.some((a) => a.name === 'Steam'));
  assert.equal(ev.sources.length, 2);

  // skip the schedule
  c.skips = { [c.schedules[0].id]: MON(17, 0).getTime() };
  assert.ok(!engine.evaluate(c, now).sites.includes('reddit.com'));

  // pomodoro: 25 work / 5 break
  c.session = { startedAt: now, endsAt: now + (2 * 30 - 5) * 60000, listIds: [games.id], mode: 'flexible', pomodoro: { work: 25, brk: 5, cycles: 2 } };
  assert.equal(engine.sessionState(c.session, now + 10 * 60000).phase, 'work');
  const br = engine.sessionState(c.session, now + 27 * 60000);
  assert.equal(br.phase, 'break');
  assert.equal(engine.evaluate(c, now + 27 * 60000).blocking, false);
  assert.equal(engine.sessionState(c.session, now + 31 * 60000).cycle, 2);
  assert.equal(engine.sessionState(c.session, now + 56 * 60000).ended, true);
});

test('engine: reduction detection', () => {
  const c = baseConfig();
  const social = c.lists.find((l) => l.presetId === 'social');
  const now = MON(10, 0).getTime();
  c.session = { startedAt: now, endsAt: now + 3600000, listIds: [social.id], mode: 'strict', pomodoro: null };
  const removedSite = JSON.parse(JSON.stringify(c));
  removedSite.lists.find((l) => l.id === social.id).sites = social.sites.filter((s) => s !== 'reddit.com');
  assert.equal(engine.isReduction(c, removedSite, now), true);
  const added = JSON.parse(JSON.stringify(c));
  added.lists.find((l) => l.id === social.id).sites.push('example.com');
  assert.equal(engine.isReduction(c, added, now), false);
  const otherList = JSON.parse(JSON.stringify(c));
  otherList.lists.find((l) => l.presetId === 'games').sites = [];
  assert.equal(engine.isReduction(c, otherList, now), false);
  const deletedList = JSON.parse(JSON.stringify(c));
  deletedList.lists = deletedList.lists.filter((l) => l.id !== social.id);
  assert.equal(engine.isReduction(c, deletedList, now), true);
});

test('config: sanitize and normalize', () => {
  const c = baseConfig();
  const merged = cfg.mergeEditable(c, {
    lists: [{ id: 'x', name: 'Mine', sites: ['https://www.Foo.com/bar', 'foo.com', 'nope'], apps: [{ name: 'Evil', win: ['C:\\x.exe', 'ok.exe', 'noext'], mac: ['../x', 'Good'] }] }],
    schedules: [{ name: 'S', listIds: ['x', 'missing'], days: [1, 9, 1], start: 'zz', end: '18:00', mode: 'bogus' }],
    settings: { theme: 'crt', pinHash: 'hack', lang: 'xx', patientDelaySec: 999999 },
  });
  assert.deepEqual(merged.lists[0].sites, ['foo.com']);
  assert.deepEqual(merged.lists[0].apps[0].win, ['ok.exe']);
  assert.deepEqual(merged.lists[0].apps[0].mac, ['Good']);
  assert.deepEqual(merged.schedules[0].listIds, ['x']);
  assert.deepEqual(merged.schedules[0].days, [1]);
  assert.equal(merged.schedules[0].start, '09:00');
  assert.equal(merged.schedules[0].mode, 'flexible');
  assert.equal(merged.settings.theme, 'crt');
  assert.equal(merged.settings.pinHash, null);
  assert.equal(merged.settings.lang, 'auto');
  assert.equal(merged.settings.patientDelaySec, 3600);

  const loaded = cfg.normalizeLoaded(JSON.parse(JSON.stringify({ ...merged, session: { startedAt: 1, endsAt: 2, mode: 'strict', listIds: ['x'] } })), 'en');
  assert.equal(loaded.session.mode, 'strict');
  assert.equal(cfg.normalizeLoaded(null, 'hu').lists[0].name, 'Közösségi média');
});

test('pin hashing', () => {
  const { hash, salt } = cfg.hashPin('1234');
  const s = { pinHash: hash, pinSalt: salt };
  assert.equal(cfg.verifyPin(s, '1234'), true);
  assert.equal(cfg.verifyPin(s, '1235'), false);
  assert.equal(cfg.verifyPin({ pinHash: null }, ''), true);
});

test('stats summary and streak', () => {
  const st = stats.emptyStats();
  const now = MON(20, 0).getTime();
  for (let i = 1; i <= 3; i += 1) {
    const t = now - i * 86400000;
    for (let k = 0; k < 200; k += 1) stats.addFocus(st, t, 10); // 2000s ≈ 33 min
  }
  stats.addBlock(st, now, 'Steam');
  stats.addBlock(st, now, 'Steam');
  stats.addBlock(st, now, 'reddit.com');
  const s = stats.summarize(st, now);
  assert.equal(s.streak, 3);
  assert.equal(s.todayBlocks, 3);
  assert.equal(s.top[0].name, 'Steam');
  assert.equal(s.last7.length, 7);
  assert.equal(s.last7[6].day, stats.dayKey(now));
});

test('unlocker modes', () => {
  let t = 0;
  const u = new Unlocker({ now: () => t, rng: () => 0.5 });
  const opts = { patientDelaySec: 60, emergencyDelaySec: 300, challengeLength: 20 };
  assert.equal(u.request('flexible', opts).status, 'ready');
  assert.equal(u.confirm('flexible'), true);

  const w = u.request('patient', opts);
  assert.equal(w.status, 'wait');
  assert.equal(u.confirm('patient'), false);
  t = 60000;
  assert.equal(u.confirm('patient'), true);
  t = 0;
  u.request('patient', opts);
  t = 60000 + 121000;
  assert.equal(u.confirm('patient'), false, 'expired');

  t = 0;
  assert.equal(u.request('strict', opts).status, 'locked');
  const e = u.emergency(opts);
  assert.equal(e.challenge.replace(/ /g, '').length, 20);
  t = 299000;
  assert.equal(u.confirm('strict', { challenge: e.challenge }), false, 'too early');
  t = 300000;
  assert.equal(u.confirm('strict', { challenge: 'wrong' }), false);
  assert.equal(u.confirm('strict', { challenge: e.challenge }), true);
  assert.match(makeChallenge(12), /^\S{6} \S{6}$/);
});

test('process parsing and matching', () => {
  const mac = proc.parseMacPs('  101 /Applications/Discord.app/Contents/MacOS/Discord\n  102 /Applications/Discord.app/Contents/Frameworks/Discord Helper (Renderer).app/Contents/MacOS/Discord Helper (Renderer)\n  200 /Applications/Epic Games Launcher.app/Contents/MacOS/EpicGamesLauncher\n  300 /System/Library/CoreServices/Finder.app/Contents/MacOS/Finder\n  400 /Applications/Halyra Focus.app/Contents/MacOS/Halyra Focus\n');
  const apps = [{ name: 'Discord', mac: ['Discord'], win: ['Discord.exe'] }, { name: 'Epic', mac: ['Epic Games Launcher'], win: [] }, { name: 'Finder', mac: ['Finder'], win: ['explorer.exe'] }, { name: 'Self', mac: ['Halyra Focus'], win: [] }];
  const hits = proc.matchMac(mac, apps, { selfPath: '/Applications/Halyra Focus.app' });
  assert.deepEqual(hits.map((h) => h.pid), [101, 102, 200]);

  const win = proc.parseTasklist('"System Idle Process","0","Services","0","8 K"\r\n"Discord.exe","5512","Console","1","95,000 K"\r\n"explorer.exe","4000","Console","1","1 K"\r\n"steam.exe","77","Console","1","1 K"\r\n');
  const wh = proc.matchWin(win, [...apps, { name: 'Steam', win: ['Steam.exe'] }], { selfExe: 'Halyra Focus.exe' });
  assert.deepEqual(wh.map((h) => h.pid), [5512, 77]);
  assert.deepEqual(proc.parseCsvLine('"a,b","c""d",e'), ['a,b', 'c"d', 'e']);
});

test('elevation command quoting', () => {
  const ps = helper.winElevateCommand("C:\\Users\\O'Brien Doe\\Temp\\install.ps1");
  assert.ok(ps.includes("O''Brien Doe"));
  const as = helper.macElevateAppleScript('/tmp/a "b"/install.sh', ['john'], 'Need "access"');
  assert.ok(as.includes('quoted form of "/tmp/a \\"b\\"/install.sh"'));
  assert.ok(as.includes('with administrator privileges'));
  assert.ok(helper.macPlist().includes('<string>/Library/Application Support/HalyraFocus/helper.sh</string>'));
});

test('style engine: readable themes from any text', () => {
  const sg = require('../src/core/stylegen');
  const samples = ['neon tokiói éjszaka', 'Erdei nyugalom', 'barbie', 'Mátrix', 'arany luxus', 'gameboy', 'tengerparti naplemente', 'minimal fekete-fehér', 'qwerty zxcv', '', '🔥🔥🔥'];
  for (const s of samples) {
    const th = sg.generate(s);
    const c = th.colors;
    assert.ok(sg.contrast(c.text, c.bg) >= 7, `text contrast for ${s}`);
    assert.ok(sg.contrast(c.muted, c.bg) >= 4.5, `muted contrast for ${s}`);
    assert.ok(sg.contrast(c.accent, c.bg) >= 3, `accent contrast for ${s}`);
    assert.ok(sg.contrast(c.accentInk, c.accent) >= 4.5, `button text contrast for ${s}`);
    assert.ok(sg.contrast(c.btnInk, c.btn) >= 7, `primary button contrast for ${s}`);
    assert.ok(sg.EFFECTS.includes(th.effect) && sg.FONTS.includes(th.font));
  }
  assert.equal(sg.generate('Mátrix hacker').font, 'mono');
  assert.equal(sg.generate('gameboy').font, 'pixel');
  assert.equal(sg.generate('barbie').mode, 'light');
  assert.equal(sg.generate('űrbéli galaxis').effect, 'stars');
  assert.notEqual(sg.generate('erdő', 0).colors.accent, sg.generate('erdő', 3).colors.accent, 'variations differ');
  // AI-style spec with unreadable colours gets fixed
  const fixed = sg.fromSpec({ mode: 'dark', bg: '#101010', text: '#151515', accent: '#121212', accent2: '#111111' });
  assert.ok(sg.contrast(fixed.colors.text, fixed.colors.bg) >= 7);
  assert.ok(sg.contrast(fixed.colors.accent, fixed.colors.bg) >= 3);
  // sanitize rejects junk, keeps good themes
  assert.equal(sg.sanitizeTheme({ colors: { bg: 'red' } }), null);
  const kept = sg.sanitizeTheme(sg.generate('ocean'));
  assert.ok(kept && kept.colors.bg);
  assert.ok(sg.cssVars(kept)['--accent']);
});

test('coach: suggestions, firm lines, insights', () => {
  const coach = require('../src/core/coach');
  assert.equal(coach.suggestSetup('Vizsgára tanulok', 'hu').profile, 'study');
  assert.equal(coach.suggestSetup('coding my game', 'en').profile, 'code');
  assert.equal(coach.suggestSetup('szakdolgozatot írok', 'hu').mode, 'strict');
  assert.equal(coach.suggestSetup('vagyok itt', 'hu').profile, 'default', 'common word "vagyok" must not trigger a profile');
  assert.equal(coach.suggestSetup('', 'en').profile, 'default');
  assert.match(coach.coachLine({ leftMs: 3 * 60000, totalMs: 50 * 60000 }, 'en'), /3 min/);
  assert.match(coach.coachLine({ leftMs: 10 * 60000, totalMs: 50 * 60000 }, 'hu'), /80%/);
  assert.match(coach.coachLine({ leftMs: 30 * 60000, totalMs: 50 * 60000, goal: 'Thesis' }, 'en'), /Thesis/);
  assert.match(coach.coachLine({ leftMs: 30 * 60000, totalMs: 50 * 60000, streak: 4, todayMin: 5 }, 'hu'), /4 napos/);

  const c = cfg.defaults('en');
  const st = stats.emptyStats();
  const now = MON(20, 0).getTime();
  for (let d = 0; d < 5; d += 1) for (let i = 0; i < 2; i += 1) stats.addBlock(st, new Date(2026, 10, 23 - d, 21, 10).getTime(), 'Steam');
  const ins = coach.insights(st, c, now, 'en');
  const peak = ins.find((x) => x.id === 'peak');
  assert.ok(peak, 'peak-hour insight');
  assert.equal(peak.action.type, 'createSchedule');
  assert.equal(peak.action.schedule.listIds[0], c.lists.find((l) => l.presetId === 'games').id);
  assert.ok(ins.find((x) => x.id === 'noschedule'));
});

test('config keeps custom themes and validates theme choice', () => {
  const sg = require('../src/core/stylegen');
  const base = cfg.defaults('en');
  const th = sg.generate('neon');
  const m = cfg.mergeEditable(base, { customThemes: [th, { junk: true }], settings: { theme: `custom:${th.id}`, aiKeyEnc: 'hack' } });
  assert.equal(m.customThemes.length, 1);
  assert.equal(m.settings.theme, `custom:${th.id}`);
  assert.equal(m.settings.aiKeyEnc, null, 'AI key cannot be set through setConfig');
  const gone = cfg.mergeEditable(m, { customThemes: [] });
  assert.equal(gone.settings.theme, 'midnight', 'deleted custom theme falls back');
  const loaded = cfg.normalizeLoaded(JSON.parse(JSON.stringify({ ...m, settings: { ...m.settings, aiKeyEnc: 'enc:abc' }, session: { startedAt: 1, endsAt: 2, mode: 'flexible', listIds: [], goal: 'x'.repeat(200) } })), 'en');
  assert.equal(loaded.settings.aiKeyEnc, 'enc:abc');
  assert.equal(loaded.customThemes.length, 1);
  assert.equal(loaded.session.goal.length, 80);
});
