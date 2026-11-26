'use strict';
// Web app (phone) end-to-end test against a mock Supabase: sign-in, start a locked
// block, extend it, edit a list, schedules/account tabs, and that the desktop app
// accepts what the web app wrote. Usage: node tools/test-webapp.js <built-site-dir> [outDir]
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const R = require('path').join(__dirname, '..');
const cfg = require(R + '/src/core/config'); const sync = require(R + '/src/core/sync'); const engine = require(R + '/src/core/engine');
const SITE = process.argv[2];
const OUT = process.argv[3] || 'webapp-test';
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const users = new Map(); const tokens = new Map(); const rows = new Map(); let n = 0;
const issue = (u) => { n++; tokens.set('acc' + n, u.id); return { access_token: 'acc' + n, refresh_token: 'ref' + n, expires_in: 3600, user: { id: u.id, email: u.email } }; };
users.set('anna@halyra.app', { id: 'u1', email: 'anna@halyra.app', password: 'correct-horse' });
const desktop = cfg.defaults('hu');
desktop.lists[0].limitMin = 45;
desktop.schedules[0].enabled = true;
const statsLib = require(R + '/src/core/stats');
const macStats = statsLib.emptyStats(); const winStats = statsLib.emptyStats();
for (let d = 0; d < 7; d += 1) for (let i = 0; i < 6 * (30 + d * 10); i += 1) statsLib.addFocus(macStats, Date.now() - d * 86400000, 10);
for (let i = 0; i < 6 * 40; i += 1) statsLib.addFocus(winStats, Date.now(), 10);
['oak', 'pine', 'house', 'cherry', 'windmill', 'oak'].forEach((it, k) => statsLib.addGrown(k % 2 ? winStats : macStats, { id: 100 + k, t: Date.now() - k * 3600000, i: it, m: 50, ok: k !== 3 }));
const devices = { 'dev-mac': sync.deviceEntry(macStats, Date.now(), { name: 'MacBook', platform: 'darwin' }), 'dev-win': sync.deviceEntry(winStats, Date.now(), { name: 'PC', platform: 'win32' }) };
rows.set('u1', { data: sync.buildPayload(desktop, 'dev-mac', Date.now() - 120000, devices), device: 'dev-mac', updated_at: new Date(Date.now() - 120000).toISOString() });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type, prefer', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const sb = http.createServer((req, res) => {
  let body = ''; req.on('data', (d) => body += d); req.on('end', () => {
    const send = (c, d) => { res.writeHead(c, { 'content-type': 'application/json', ...cors }); res.end(d === undefined ? '' : JSON.stringify(d)); };
    if (req.method === 'OPTIONS') return send(204);
    const url = new URL(req.url, 'http://x'); const j = body ? JSON.parse(body) : {};
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') { const u = users.get(j.email); if (!u || u.password !== j.password) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }); return send(200, issue(u)); }
    if (url.pathname === '/auth/v1/signup') return send(200, { id: 'x', email: j.email });
    const uid = tokens.get(String(req.headers.authorization || '').replace('Bearer ', ''));
    if (url.pathname === '/rest/v1/halyra_sync') {
      if (!uid) return send(401, { message: 'JWT' });
      if (req.method === 'GET') return send(200, rows.has(uid) ? [rows.get(uid)] : []);
      for (const r of j) rows.set(uid, { data: r.data, device: r.device, updated_at: r.updated_at });
      return send(201);
    }
    send(404, {});
  });
});
function staticServer(sbUrl) {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/app/config.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(`window.HALYRA_CFG=${JSON.stringify({ url: sbUrl, anonKey: sbUrl ? 'anon' : '', dl: { mac: '#mac', win: '#win' }, home: '../' })};`); }
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(SITE, p);
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
}
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
(async () => {
  const sbPort = await listen(sb);
  const web = staticServer(`http://127.0.0.1:${sbPort}`); const webPort = await listen(web);
  const off = staticServer(''); const offPort = await listen(off);
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'hu-HU', isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/status of 400/.test(m.text())) errs.push(m.text()); }); // 400 = the intentional wrong-password attempt
  const ok = (name, cond) => { if (!cond) failed += 1; console.log(cond ? 'PASS' : 'FAIL', name); };
  // not configured
  await p.goto(`http://127.0.0.1:${offPort}/app/`); await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/0-notready.png' });
  ok('not-configured notice', (await p.textContent('body')).includes('hamarosan'));
  // configured
  await p.goto(`http://127.0.0.1:${webPort}/app/`); await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/1-login.png' });
  await p.fill('input[type=email]', 'anna@halyra.app'); await p.fill('input[type=password]', 'wrong-pass');
  await p.click('text=Belépés'); await p.waitForTimeout(400);
  ok('bad login message', (await p.textContent('#toast')).includes('Hibás'));
  await p.fill('input[type=password]', 'correct-horse'); await p.click('text=Belépés'); await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/2-focus.png' });
  ok('focus view after login', (await p.textContent('body')).includes('Fókusz indítása mindenhol'));
  await p.click('.mode >> text=Zárolt'); await p.click('text=Fókusz indítása mindenhol'); await p.waitForTimeout(700);
  const r1 = rows.get('u1');
  ok('session written to sync row', r1.data.session && r1.data.session.mode === 'strict' && r1.device.startsWith('web-'));
  // desktop picks it up
  const applied = sync.applyRemote(desktop, r1.data, Date.now());
  ok('desktop applies web-started session', applied.config.session && engine.evaluate(applied.config, Date.now()).blocking);
  await p.evaluate(() => { document.getElementById('toast').className = ''; }); await p.waitForTimeout(300); await p.screenshot({ path: OUT + '/3-running.png' });
  ok('no stop button for locked', !(await p.$('text=Leállítás')));
  await p.click('text=+15 perc'); await p.waitForTimeout(600);
  ok('extended +15', rows.get('u1').data.session.endsAt - r1.data.session.endsAt >= 0 && Math.round((rows.get('u1').data.session.endsAt - rows.get('u1').data.session.startedAt) / 60000) === 65);
  // lists
  await p.click('.tabs >> text=Listák'); await p.waitForTimeout(300);
  const all = await p.$$('.list-h'); const LI = all.length - 1; const second = all[LI]; await second.click(); await p.waitForTimeout(300);
  await p.fill('.list input', 'https://www.Example.org/path'); await p.click('.list >> text=Hozzáad'); await p.waitForTimeout(600);
  const listId = rows.get('u1').data.lists[LI].id;
  ok('site added from web', rows.get('u1').data.lists[LI].sites.includes('example.org'));
  await p.screenshot({ path: OUT + '/4-lists.png', fullPage: false });
  // locked list: no remove buttons
  await p.click('.list-h >> nth=0'); await p.waitForTimeout(300);
  ok('locked list shows note', (await p.textContent('body')).includes('zárolt tiltás használja'));
  await p.screenshot({ path: OUT + '/4b-locked-list.png' });
  // stats of all devices + the forest; picking what grows syncs to the computers
  await p.click('.tabs >> text=Statisztika'); await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + '/4c-stats.png', fullPage: true });
  const stTxt = await p.textContent('body');
  ok('stats tab merges devices', stTxt.includes('eszközöd együtt (2)') && !!(await p.$('.forest .land svg')));
  ok('forest shows grown and withered', stTxt.includes('5 felnőtt') && stTxt.includes('1 elszáradt'));
  await p.click('.grow[title="Fenyő"]'); await p.waitForTimeout(700);
  ok('grow choice saved from web', rows.get('u1').data.settings.growItem === 'pine' && rows.get('u1').data.devices && rows.get('u1').data.devices['dev-mac']);
  ok('desktop takes the grow choice', sync.applyRemote(desktop, rows.get('u1').data, Date.now()).config.settings.growItem === 'pine');
  await p.click('.tabs >> text=Időzítés'); await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/5-sched.png' });
  const before = rows.get('u1').data.schedules[0].enabled;
  await p.click('.switch >> nth=0'); await p.waitForTimeout(700);
  ok('schedule toggled from web', rows.get('u1').data.schedules[0].enabled === !before);
  await p.click('.tabs >> text=Fiók'); await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/6-account.png' });
  ok('account tab shows last computer sync', (await p.textContent('body')).includes('perce'));
  // flexible block: can be stopped from the phone
  rows.get('u1').data.session = null;
  await p.click('.tabs >> text=Fókusz'); await p.click('text=Frissítés').catch(() => {});
  await p.click('.tabs >> text=Fiók'); await p.click('text=Frissítés'); await p.waitForTimeout(500);
  await p.click('.tabs >> text=Fókusz'); await p.waitForTimeout(300);
  await p.click('.mode >> text=Laza'); await p.click('text=Fókusz indítása mindenhol'); await p.waitForTimeout(700);
  ok('flexible block started', rows.get('u1').data.session && rows.get('u1').data.session.mode === 'flexible');
  await p.click('text=Leállítás'); await p.waitForTimeout(700);
  ok('flexible block stopped from phone', rows.get('u1').data.session === null);
  const stopApplied = sync.applyRemote({ ...desktop, session: { startedAt: Date.now() - 1000, endsAt: Date.now() + 600000, listIds: [desktop.lists[0].id], mode: 'flexible', pomodoro: null }, sessionChangedAt: Date.now() - 1000 }, rows.get('u1').data, Date.now());
  ok('desktop accepts the stop of a flexible block', stopApplied.config.session === null);
  // sign out returns to the login screen and forgets the session
  await p.click('.tabs >> text=Fiók'); await p.click('text=Kijelentkezés'); await p.waitForTimeout(300);
  ok('sign out returns to login', !!(await p.$('input[type=password]')) && (await p.evaluate(() => localStorage.getItem('halyra.auth'))) === null);
  await p.fill('input[type=email]', 'anna@halyra.app'); await p.fill('input[type=password]', 'correct-horse'); await p.click('button:has-text("Belépés")'); await p.waitForTimeout(700);
  // English
  await p.click('.lang >> text=EN'); await p.click('.tabs >> text=Focus'); await p.waitForTimeout(300);
  await p.evaluate(() => { document.getElementById('toast').className = ''; }); await p.waitForTimeout(300); await p.screenshot({ path: OUT + '/7-en.png' });
  ok('no page errors', errs.length === 0); if (errs.length) console.log(errs);
  await b.close(); sb.close(); web.close(); off.close();
  console.log(failed ? `WEB APP TEST: ${failed} FAILED` : 'WEB APP TEST: ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
