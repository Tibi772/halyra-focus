'use strict';
// Checks the LIVE website the way visitors see it: every page in the sitemap
// (+ web app, 404), all internal links and images, console errors, mobile layout,
// SEO tags, and that the download buttons return the real installer files.
// Usage: node tools/verify-site.js https://<user>.github.io/<repo>/ [outDir]
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const BASE = (process.argv[2] || '').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'site-check';
const VERSION = require('../package.json').version;
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 600) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${String(detail).slice(0, 300)}` : ''}`);
};
const sameOrigin = (u) => u.startsWith(BASE);

async function head(url) {
  // GET with an early abort: follows redirects like a browser, never downloads 200 MB.
  const ctl = new AbortController();
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctl.signal });
    const info = { status: r.status, url: r.url, type: r.headers.get('content-type') || '', len: Number(r.headers.get('content-length') || 0), disp: r.headers.get('content-disposition') || '' };
    ctl.abort();
    return info;
  } catch (e) { return { status: 0, error: e.message }; }
}

(async () => {
  // Wait for a fresh deploy to be visible (Pages can take a minute).
  let home = null;
  for (let i = 0; i < 20; i += 1) {
    home = await head(BASE);
    if (home.status === 200) break;
    await new Promise((r) => setTimeout(r, 15000));
  }
  check('Website is online', home && home.status === 200, `${BASE} → ${home && home.status}`);
  if (!home || home.status !== 200) return finish();

  // ---- pages to visit
  const sm = await (await fetch(`${BASE}sitemap.xml`)).text();
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const root = locs.reduce((a, b) => (b.length < a.length ? b : a), locs[0] || BASE); // the home page
  const pages = locs.map((u) => BASE + u.slice(root.length)).filter((u, i, a) => a.indexOf(u) === i);
  check('sitemap.xml uses the live address', root === BASE || process.env.LOCAL_TEST, root);
  check('sitemap.xml lists pages', pages.length >= 6, `${pages.length} pages`);
  const robots = await (await fetch(`${BASE}robots.txt`)).text();
  check('robots.txt points to the sitemap', /Sitemap:\s*https?:\/\//i.test(robots));

  const browser = await chromium.launch();
  const links = new Set();
  const images = new Set();
  const downloads = new Set();

  for (const url of pages) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => { if (sameOrigin(r.url()) && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    const res = await page.goto(url, { waitUntil: 'networkidle' });
    // scroll through so lazy images load
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    // Images in hidden tabs (themes) are lazy and never load on their own: make them eager and wait.
    await page.evaluate(() => Promise.race([
      Promise.all([...document.images].map((i) => { i.loading = 'eager'; return i.complete && i.naturalWidth ? 0 : new Promise((r) => { i.addEventListener('load', r); i.addEventListener('error', r); }); })),
      new Promise((r) => setTimeout(r, 15000)),
    ]));
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => ({
      title: document.title,
      desc: (document.querySelector('meta[name="description"]') || {}).content || '',
      canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '',
      h1: document.querySelectorAll('h1').length,
      lang: document.documentElement.lang,
      hreflang: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => l.hreflang),
      og: (document.querySelector('meta[property="og:image"]') || {}).content || '',
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { try { JSON.parse(s.textContent); return true; } catch (_) { return false; } }),
      brokenImgs: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
      imgs: [...document.images].map((i) => i.currentSrc || i.src),
      links: [...document.querySelectorAll('a[href]')].map((a) => a.href),
      version: (document.body.innerText.match(/v\d+\.\d+\.\d+/) || [''])[0],
    }));
    const short = url.replace(BASE, '/');
    check(`${short} loads (200)`, res && res.status() === 200, res && res.status());
    check(`${short} has title, description, canonical, one h1`, info.title && info.desc.length > 50 && info.canonical && info.h1 === 1, `${info.title} | h1=${info.h1}`);
    check(`${short} has no console errors or missing files`, errors.length === 0, errors.join(' ; '));
    check(`${short} all images load`, info.brokenImgs.length === 0, info.brokenImgs.join(' '));
    if (info.ld.length) check(`${short} structured data is valid JSON`, info.ld.every(Boolean));
    if (url === BASE || url === `${BASE}hu/`) {
      check(`${short} links its other language (hreflang)`, info.hreflang.includes('en') && info.hreflang.includes('hu'), info.hreflang.join(','));
      check(`${short} shows the current version v${VERSION}`, info.version === `v${VERSION}`, info.version);
      const scene = await page.evaluate(() => ({ labels: document.querySelectorAll('#city-labels .c-label').length, gl: Boolean(document.querySelector('.stage.is-3d')), eggs: Boolean(document.getElementById('egg-text')) }));
      check(`${short} hero scene runs (${scene.gl ? '3D' : '2D fallback'})`, scene.labels >= 6 && scene.eggs, JSON.stringify(scene));
      // The hero demos focus mode by itself until someone touches it: take over first.
      if (await page.getAttribute('#focus-toggle', 'aria-pressed') === 'true') await page.click('#focus-toggle');
      await page.click('#focus-toggle');
      await page.waitForTimeout(3000);
      const blocked = await page.evaluate(() => document.querySelectorAll('#city-labels .c-label.blocked').length);
      check(`${short} focus mode locks the distraction buildings`, blocked >= 4, `${blocked} locked`);
      if (info.og) images.add(info.og);
      await page.screenshot({ path: path.join(OUT, `desktop-${short.replace(/\W+/g, '_') || 'home'}.png`) });
    }
    info.links.forEach((l) => { if (/releases\/latest\/download\//.test(l)) downloads.add(l); else if (sameOrigin(l)) links.add(l.split('#')[0]); });
    info.imgs.forEach((i) => images.add(i));
    await ctx.close();
  }

  // ---- every internal link and image answers
  const bad = [];
  for (const l of links) { const r = await head(l); if (r.status !== 200) bad.push(`${r.status} ${l}`); }
  check(`All ${links.size} internal links work`, bad.length === 0, bad.join(' ; '));
  const badImg = [];
  for (const i of images) { if (!i || i.startsWith('data:')) continue; const r = await head(i); if (r.status !== 200 || !/image\//.test(r.type)) badImg.push(`${r.status} ${i}`); }
  check(`All ${images.size} images (incl. social preview) are served`, badImg.length === 0, badImg.join(' ; '));

  // ---- download buttons → real installer files, served as downloads
  const want = [['HalyraFocus-mac.dmg', 50], ['HalyraFocus-Setup.exe', 50], ['HalyraFocus-Android.apk', 0.2]];
  for (const [name, minMb] of want) {
    const url = [...downloads].find((d) => d.endsWith(name));
    check(`Download button for ${name} exists`, Boolean(url));
    if (!url) continue;
    const r = await head(url);
    const mb = Math.round((r.len / 1048576) * 10) / 10;
    check(`${name} downloads directly (file, ${mb} MB)`, r.status === 200 && r.len > minMb * 1048576 && (/attachment/i.test(r.disp || '') || /octet-stream|x-apple-diskimage|x-msdownload|x-msdos|android\.package-archive/i.test(r.type || '')), `${r.status} ${r.type || ''} ${(r.disp || r.error || '').slice(0, 80)}`);
  }
  try {
    const gh = (p) => fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${p}`, { headers: { authorization: `Bearer ${process.env.GH_TOKEN || ''}` } }).then((r) => r.json());
    const rel = await gh('releases/latest');
    if (rel.tag_name === `v${VERSION}`) check(`Latest release is v${VERSION}`, true, rel.tag_name);
    else {
      // Right after a version bump the website deploys in seconds, the installers take
      // a few minutes. If the build for this commit is still running, that's not an
      // error — the run that follows the build checks the release again.
      const runs = await gh(`actions/workflows/build.yml/runs?head_sha=${process.env.VERIFY_SHA || ''}&per_page=5`);
      const building = (runs.workflow_runs || []).some((r) => r.status !== 'completed');
      if (building) console.log(`NOTE  v${VERSION} installers are still being built (download buttons serve ${rel.tag_name} until then) — checked again after the build`);
      else check(`Latest release is v${VERSION}`, false, rel.tag_name);
    }
  } catch (e) { check(`Latest release is v${VERSION}`, false, e.message); }

  // ---- phones
  for (const [dev, url] of [['iPhone 13', BASE], ['iPhone 13', `${BASE}hu/`], ['Pixel 7', `${BASE}hu/`]]) {
    const ctx = await browser.newContext({ ...devices[dev] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      note: [...document.querySelectorAll('.mobile-note')].some((n) => getComputedStyle(n).display !== 'none'),
      androidFirst: (() => { const b = document.querySelector('.cta .btn[data-dl="android"]'); return b ? getComputedStyle(b).order === '-2' : false; })(),
      signin: (() => { const n = document.querySelector('.btn.signin'); return n ? getComputedStyle(n).display !== 'none' : false; })(),
      appLink: (document.querySelector('.ios-note a') || {}).href || '',
    }));
    const short = `${dev} ${url.replace(BASE, '/')}`;
    check(`${short}: no sideways scrolling`, m.overflow <= 1, `${m.overflow}px`);
    check(`${short}: phone note + sign-in button visible`, m.note && m.signin, JSON.stringify(m));
    if (/Pixel/.test(dev)) check(`${short}: Android download comes first`, m.androidFirst, JSON.stringify(m));
    else check(`${short}: iPhone note links to the web app`, /\/app\/?/.test(m.appLink), JSON.stringify(m));
    check(`${short}: no script errors`, errors.length === 0, errors.join(' ; '));
    await page.screenshot({ path: path.join(OUT, `mobile-${dev.replace(/\W+/g, '')}-${url.replace(BASE, '').replace(/\W+/g, '_') || 'en'}.png`), fullPage: false });
    await ctx.close();
  }

  // ---- web app
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'hu-HU' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => { if (sameOrigin(r.url()) && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    const res = await page.goto(`${BASE}app/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const w = await page.evaluate(() => ({ text: document.body.innerText, dl: [...document.querySelectorAll('a[download]')].map((a) => a.href), cfg: window.HALYRA_CFG || null }));
    check('Web app loads (200) without errors', res.status() === 200 && errors.length === 0, errors.join(' ; '));
    const configured = Boolean(w.cfg && w.cfg.url);
    check(configured ? 'Web app shows the sign-in form' : 'Web app explains accounts are coming (not configured yet)', configured ? /Belépés|Sign in/.test(w.text) : /hamarosan|coming/i.test(w.text));
    check('Web app download buttons point to the installers', w.dl.some((d) => d.endsWith('.dmg')) && w.dl.some((d) => d.endsWith('.exe')) && w.dl.some((d) => d.endsWith('.apk')), w.dl.join(' '));
    const man = await (await fetch(`${BASE}app/manifest.webmanifest`)).json().catch(() => null);
    check('Web app can be installed to the home screen (manifest + icons)', man && man.icons && man.icons.length >= 2 && man.display === 'standalone');
    if (man) for (const ic of man.icons) { const r = await head(new URL(ic.src, `${BASE}app/`).href); check(`Web app icon ${ic.sizes}`, r.status === 200, r.status); }
    check('Web app offline support (service worker) is served', (await head(`${BASE}app/sw.js`)).status === 200);
    await page.screenshot({ path: path.join(OUT, 'webapp.png') });
    await ctx.close();
  }

  // ---- 404
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const res = await page.goto(`${BASE}this-page-does-not-exist/`);
    const txt = await page.evaluate(() => document.body.innerText);
    const robotsMeta = await page.evaluate(() => (document.querySelector('meta[name="robots"]') || {}).content || '');
    check('Unknown pages show the 404 page (not indexed)', res.status() === 404 && txt.length > 20 && /noindex/.test(robotsMeta), `${res.status()} ${robotsMeta}`);
    await ctx.close();
  }

  await browser.close();
  finish();
})().catch((e) => { check('Site check crashed', false, e.stack); finish(); });

function finish() {
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ base: BASE, version: VERSION, ok: failed.length === 0, results }, null, 2));
  console.log(failed.length ? `\nSITE CHECK: ${failed.length} FAILED of ${results.length}` : `\nSITE CHECK: ALL PASSED (${results.length}/${results.length})`);
  process.exit(failed.length ? 1 : 0);
}
