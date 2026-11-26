'use strict';
// End-to-end self-test of the *packaged* app on a real Mac / Windows machine.
// Run:  "Halyra Focus" --selftest   (CI does this on GitHub's macOS & Windows runners)
// It drives the real app: UI, themes, app blocking (opens a test app and checks it
// gets closed), website blocking through the privileged helper (checks DNS and a
// real connection), stopping, and helper removal. Results → results.json + screenshots.
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const { spawn } = require('child_process');
const bt = require('./selftest-browser');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout, step = 400) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await fn()) return true; } catch (_) { /* keep waiting */ }
    await sleep(step);
  }
  return false;
}

function tryConnect(host, port) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 6000 });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error', () => resolve(false));
  });
}

async function lookupAll(host) {
  try { return (await dns.lookup(host, { all: true })).map((a) => a.address); } catch (e) { return [`ERR ${e.code || e.message}`]; }
}

module.exports = async function selftest(ctx) {
  const out = ctx.outDir;
  fs.mkdirSync(out, { recursive: true });
  const checks = [];
  const log = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 2000) });
    console.log(`[selftest] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  };
  const win = () => ctx.win();
  const js = (code) => win().webContents.executeJavaScript(code, true);
  // Screenshots are evidence, not checks: a GPU-less CI runner can't always capture
  // transparent always-on-top windows, so a capture error is reported, never failed.
  const shot = async (name, w = win()) => {
    try {
      await sleep(350);
      const img = await w.webContents.capturePage();
      fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG());
    } catch (e) { console.log(`[selftest] note  screenshot ${name} not captured (${e.message})`); }
  };
  const isMac = process.platform === 'darwin';
  const BLOCK_SITE = 'example.org';
  const isWin = process.platform === 'win32';
  const PART = 'example.com/halyra-selftest'; // part-of-site rule (hosts can't do this, the browser layer must)
  let br = null;
  const TEST_APP = isMac ? { name: 'TestApp', mac: ['Chess'], win: [] } : { name: 'TestApp', mac: [], win: ['notepad.exe'] };

  try {
    // ---------------------------------------------------------------- UI
    const loaded = await waitFor(() => js("document.querySelectorAll('.nav-btn').length === 5"), 30000);
    let why = '';
    if (!loaded) {
      let dom = '';
      try { dom = await js("(document.readyState + ' | api=' + typeof window.api + ' | ' + document.body.innerHTML.slice(0, 600))"); } catch (e) { dom = `executeJavaScript failed: ${e.message}`; }
      why = `${dom}\n--- renderer log ---\n${(ctx.rendererLog ? ctx.rendererLog() : []).join('\n')}`;
    }
    log('UI loads (sidebar with 5 sections)', loaded, why);
    if (!loaded) throw new Error('UI did not load — see renderer log above');
    await sleep(700);
    log('First-run onboarding appears', await js("!!document.querySelector('.ob-steps')"));
    await shot('01-onboarding');
    await ctx.setConfig({ settings: { onboarded: true } });
    await js("document.querySelectorAll('.modal-back').forEach((m) => m.remove()); true");

    const views = ['focus', 'lists', 'schedules', 'stats', 'settings'];
    for (let i = 0; i < views.length; i += 1) {
      await js(`document.querySelectorAll('.nav-btn')[${i}].click(); true`);
      await sleep(400);
      const ok = await js("!!document.querySelector('.view .view-title') && document.querySelector('.view').children[0].children.length > 0");
      log(`View renders: ${views[i]}`, ok);
      await shot(`02-view-${views[i]}`);
    }
    await js("document.querySelectorAll('.nav-btn')[0].click(); true");
    for (const theme of ['daylight', 'crt', 'onebit', 'vapor', 'midnight']) {
      const r = await ctx.setConfig({ settings: { theme } });
      await sleep(300);
      const applied = await js(`document.body.dataset.theme === '${theme}'`);
      log(`Theme applies: ${theme}`, r.ok && applied);
      if (theme !== 'midnight') await shot(`03-theme-${theme}`);
    }
    const r1 = await ctx.setConfig({ settings: { lang: 'hu' } });
    await sleep(300);
    log('Language switch to Hungarian', r1.ok && (await js("document.querySelector('.nav-btn').textContent.includes('Fókusz')")));
    await shot('04-hungarian');
    await ctx.setConfig({ settings: { lang: 'en' } });

    // ---------------------------------------------------------------- website blocking helper
    const inst = await ctx.platform.installHelper('selftest', { nonInteractive: true });
    log('Website-blocking helper installs', inst.ok, inst.error || '');
    log('Helper reported as installed', ctx.platform.helperInstalled());
    log('Helper is the current version', !ctx.platform.helperOutdated(), `v${ctx.platform.helperVersion()}`);

    // ---------------------------------------------------------------- a real browser, open before the block starts
    if (isWin) await sleep(4000); // the helper prepares the browser policy keys
    br = await bt.launch({ headless: isWin, url: isMac ? `https://${PART}/open-before` : 'about:blank' });
    log('Test browser starts', !br.error, br.error || br.name);
    if (br.error) br = null;
    if (br && isMac) await sleep(4000);

    // ---------------------------------------------------------------- start a block
    const before = await lookupAll(BLOCK_SITE);
    log(`${BLOCK_SITE} resolves normally before blocking`, before.some((a) => a !== '0.0.0.0' && a !== '::' && !a.startsWith('ERR')), before.join(' '));
    const list = { id: 'selftest', name: 'Selftest', emoji: '🧪', sites: [BLOCK_SITE], paths: [PART], apps: [TEST_APP] };
    await ctx.setConfig({ lists: [...ctx.config().lists, list] });
    const started = ctx.startSession({ listIds: ['selftest'], minutes: 15, mode: 'flexible' });
    log('Focus session starts', started.ok);
    await sleep(500);
    await shot('05-focus-active');

    // website blocked?
    const inHosts = await waitFor(() => fs.readFileSync(ctx.platform.hostsPath(), 'utf8').includes(`0.0.0.0 ${BLOCK_SITE}`), 30000);
    log('Blocked site written to the hosts file by the helper', inHosts);
    // macOS answers 0.0.0.0 / ::, Windows answers "no such host" for 0.0.0.0 hosts entries — both mean blocked.
    const blockedDns = await waitFor(async () => (await lookupAll(BLOCK_SITE)).every((a) => a === '0.0.0.0' || a === '::' || /^ERR (ENOENT|ENOTFOUND|EAI_NONAME|ENODATA)/.test(a)), 20000, 800);
    log(`${BLOCK_SITE} no longer resolves to its real address while blocked`, blockedDns, (await lookupAll(BLOCK_SITE)).join(' '));
    log(`Connection to ${BLOCK_SITE}:443 fails while blocked`, !(await tryConnect(BLOCK_SITE, 443)));
    log('UI shows website blocking as active', await waitFor(() => js("!!document.querySelector('.okline')"), 20000));

    // ---------------------------------------------------------------- browser level
    if (br && isWin) {
      const key = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge\\URLBlocklist';
      const pol = await waitFor(async () => (await bt.regList(key)).includes(PART), 20000, 1000);
      log('Browser policy written for Edge / Chrome / Brave', pol, (await bt.regList(key)).join(' '));
      let v = {};
      const blockedNav = await waitFor(async () => {
        v = await bt.visit(br, `https://${PART}/page`, 3000);
        return /BLOCKED_BY_ADMINISTRATOR|blocked/i.test(`${v.text || ''} ${v.title || ''}`);
      }, 45000, 500);
      log('Part of a site is blocked in a real browser that was already open', blockedNav, JSON.stringify(v));
      await bt.screenshot(br, path.join(out, '08-browser-part-blocked.png'));
      const other = await bt.visit(br, 'https://example.com/', 4000);
      log('The rest of that site still opens', /Example Domain/i.test(`${other.text || ''} ${other.title || ''}`), JSON.stringify(other));
    }
    if (br && isMac) {
      let tabs = [];
      const redirected = await waitFor(async () => {
        tabs = await bt.pages(br);
        return tabs.some((t) => /^http:\/\/127\.0\.0\.1:\d+\/blocked/.test(t.url));
      }, 40000, 1000);
      const gs = ctx.browserState() || {};
      const detail = JSON.stringify({ tabs: tabs.map((t) => t.url), guard: gs });
      if (!redirected && ((gs.denied || []).length || (gs.waiting || []).length)) {
        console.log(`[selftest] note  browser control not permitted on this machine (${[...(gs.denied || []), ...(gs.waiting || [])].join(', ')}) — tab check skipped. ${detail}`);
      } else {
        log('A tab that was already open is sent to the block page', redirected, detail);
        if (redirected) {
          const cdp = await bt.attach(br, (t) => /\/blocked/.test(t.url));
          let shown = null;
          if (cdp) {
            await waitFor(async () => { shown = await cdp.eval("(document.getElementById('app') || {}).textContent"); return Boolean(shown); }, 10000, 500);
            cdp.close();
          }
          log('Block page shows the blocked site', shown === PART, String(shown));
          await bt.screenshot(br, path.join(out, '08-browser-block-page.png'), (t) => /\/blocked/.test(t.url));
        }
      }
    }

    // app blocked?
    const statsBefore = ctx.blockCount(TEST_APP.name);
    const child = isMac
      ? spawn('/usr/bin/open', ['-a', 'Chess'], { stdio: 'ignore' })
      : spawn('notepad.exe', [], { detached: true, stdio: 'ignore' });
    child.on('error', (e) => log('Test app could be launched', false, e.message));
    child.unref();
    const seen = await waitFor(async () => ctx.blockCount(TEST_APP.name) > statsBefore, 25000, 300);
    log(`Blocked app (${isMac ? 'Chess' : 'Notepad'}) is detected and closed`, seen);
    const gone = await waitFor(async () => (await ctx.platform.findBlocked([TEST_APP])).length === 0, 15000);
    log('Blocked app is no longer running', gone);
    log('Block banner window was shown', Boolean(ctx.overlay()));
    await shot('06-block-banner', ctx.overlay() || win());

    // ---------------------------------------------------------------- stop
    ctx.stopAll();
    const cleaned = await waitFor(() => !fs.readFileSync(ctx.platform.hostsPath(), 'utf8').includes(BLOCK_SITE), 30000);
    log('Stopping removes the site from the hosts file', cleaned);
    const back = await waitFor(async () => (await lookupAll(BLOCK_SITE)).some((a) => a !== '0.0.0.0' && a !== '::' && !a.startsWith('ERR')), 20000, 800);
    log(`${BLOCK_SITE} resolves normally again after stopping`, back, (await lookupAll(BLOCK_SITE)).join(' '));
    if (isWin) {
      const key = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge\\URLBlocklist';
      log('Stopping removes the browser policy entries', await waitFor(async () => !(await bt.regList(key)).includes(PART), 20000, 1000), (await bt.regList(key)).join(' '));
    }
    if (br) {
      let again = {};
      const open = await waitFor(async () => {
        again = await bt.visit(br, `https://${PART}/page`, 2500);
        return /Example Domain|404|Not Found/i.test(`${again.text || ''} ${again.title || ''}`) && !/blocked/i.test(again.text || '');
      }, 60000, 500);
      log('The part of the site opens again after stopping', open, JSON.stringify(again).slice(0, 300));
      if (!open && isWin) {
        const pol = await bt.visit(br, 'edge://policy/', 3000);
        console.log(`[selftest] note  edge://policy says: ${String(pol.text || '').replace(/\s+/g, ' ').slice(0, 900)}`);
        console.log(`[selftest] note  registry: ${(await bt.regList('HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge\\URLBlocklist')).join(' ') || '(none)'}`);
      }
    }

    // ---------------------------------------------------------------- locked mode
    ctx.startSession({ listIds: ['selftest'], minutes: 5, mode: 'strict' });
    const r = await ctx.unlockRequest();
    log('Locked mode refuses a normal stop', r.status === 'locked');
    log('Locked mode refuses quitting', ctx.tryQuitDry() === false);
    const removal = await ctx.setConfig({ lists: ctx.config().lists.filter((l) => l.id !== 'selftest') });
    log('Locked mode refuses deleting the active list', !removal.ok && removal.error === 'locked');
    await shot('07-locked');
    ctx.forceClearSession();

    // ---------------------------------------------------------------- daily limits & browser probe
    let probe = 'n/a';
    try { probe = JSON.stringify(await ctx.platform.activeWebPage()); log('Browser probe for daily limits runs without errors', true, probe); } catch (e) { log('Browser probe for daily limits runs without errors', false, e.message); }
    const cfgNow = ctx.config();
    const limRes = await ctx.setConfig({ lists: cfgNow.lists.map((l) => (l.id === 'selftest' ? { ...l, limitMin: 15 } : l)) });
    log('Daily limit can be set on a list', limRes.ok && ctx.config().lists.find((l) => l.id === 'selftest').limitMin === 15);
    await js("document.querySelectorAll('.nav-btn')[4].click(); true");
    await sleep(400);
    log('Account card renders in Settings', await js("document.body.innerText.length > 0 && !!document.querySelector('.view .card')"));
    await js("document.querySelectorAll('.nav-btn')[0].click(); true");
    await sleep(300);
    log('Focus sounds card renders', await js("!!document.querySelector('.sound-bar')"));
    log('What grows during focus can be chosen', await js("!!document.querySelector('[data-fid=grow-change]') && !!document.querySelector('.ring-grow svg')"));

    // ---------------------------------------------------------------- Halyra AI (offline mode on CI: no key)
    await js("document.querySelector('[data-fid=ai-open]').click(); true");
    const chatOk = await waitFor(() => js("!!document.querySelector('.chat-panel textarea')"), 8000);
    await js("(() => { const i = document.querySelector('[data-fid=chat-in]'); i.value = 'How much did I focus this week?'; i.dispatchEvent(new Event('input')); document.querySelector('[data-fid=chat-send]').click(); return true; })()");
    const replied = await waitFor(() => js("[...document.querySelectorAll('.msg.ai .bubble')].some((b) => /\\d/.test(b.textContent))"), 20000, 500);
    log('Halyra AI opens and answers', chatOk && replied, await js("(document.querySelector('.chat-msgs') || {}).innerText || ''"));
    await shot('09-halyra-ai');
    await js("(() => { const b = document.querySelector('.chat-back'); if (b) b.click(); return true; })()");
    await js("document.querySelectorAll('.nav-btn')[3].click(); true");
    await sleep(500);
    log('Forest & city card renders in Stats', await js("!!document.querySelector('.card.garden')"));
    await shot('10-stats-forest');
    await js("document.querySelectorAll('.nav-btn')[0].click(); true");

    // ---------------------------------------------------------------- remove helper
    const un = await ctx.platform.uninstallHelper('selftest', { nonInteractive: true });
    log('Helper uninstalls cleanly', un.ok && !ctx.platform.helperInstalled());
    log('Hosts file has no leftover section', !fs.readFileSync(ctx.platform.hostsPath(), 'utf8').includes('HalyraFocus'));
  } catch (e) {
    log('Self-test crashed', false, e && e.stack);
  } finally {
    bt.close(br);
  }

  const ok = checks.length > 0 && checks.every((c) => c.ok);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ ok, platform: process.platform, arch: process.arch, version: ctx.version, checks }, null, 2));
  console.log(`[selftest] ${ok ? 'ALL PASSED' : 'FAILURES'} (${checks.filter((c) => c.ok).length}/${checks.length})`);
  return ok;
};
