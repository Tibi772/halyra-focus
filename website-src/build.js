#!/usr/bin/env node
'use strict';
// Static site generator for the Halyra Focus website (no dependencies).
//   node website-src/build.js [outDir]
// Config: website-src/site.config.json, overridable with env vars:
//   GITHUB_REPOSITORY=owner/repo   (set automatically inside GitHub Actions)
//   SITE_DOMAIN=example.com        (your custom domain, if you bought one)
//   LINK_INDEX=1                   (link to …/index.html, for previewing from disk)
const fs = require('fs');
const path = require('path');
const { en, hu } = require('./content');

const SRC = __dirname;
const OUT = path.resolve(process.argv[2] || path.join(SRC, '..', 'website'));
const conf = JSON.parse(fs.readFileSync(path.join(SRC, 'site.config.json'), 'utf8'));
const repo = process.env.GITHUB_REPOSITORY || conf.repo;
const domain = (process.env.SITE_DOMAIN || conf.domain || '').trim();
const [owner, repoName] = repo.split('/');
const BASE = domain ? `https://${domain}` : `https://${owner.toLowerCase()}.github.io/${repoName}`;
const LINK_INDEX = process.env.LINK_INDEX === '1';
const VERSION = JSON.parse(fs.readFileSync(path.join(SRC, '..', 'package.json'), 'utf8')).version;
const TODAY = new Date().toISOString().slice(0, 10);
const DL = {
  mac: `https://github.com/${repo}/releases/latest/download/HalyraFocus-mac.dmg`,
  win: `https://github.com/${repo}/releases/latest/download/HalyraFocus-Setup.exe`,
  android: `https://github.com/${repo}/releases/latest/download/HalyraFocus-Android.apk`,
  releases: `https://github.com/${repo}/releases/latest`,
  source: `https://github.com/${repo}`,
};
const T = { en, hu };

const PAGES = [
  { id: 'home', lang: 'en', path: '/' },
  { id: 'home', lang: 'hu', path: '/hu/' },
  { id: 'guide-mac', lang: 'en', path: '/guides/block-apps-on-mac/' },
  { id: 'guide-mac', lang: 'hu', path: '/hu/utmutato/appok-tiltasa-macen/' },
  { id: 'guide-win', lang: 'en', path: '/guides/block-websites-on-windows/' },
  { id: 'guide-win', lang: 'hu', path: '/hu/utmutato/weboldalak-tiltasa-windowson/' },
  { id: 'privacy', lang: 'en', path: '/privacy/' },
  { id: 'privacy', lang: 'hu', path: '/hu/adatvedelem/' },
];
const find = (id, lang) => PAGES.find((p) => p.id === id && p.lang === lang);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s) => String(s).replace(/<[^>]+>/g, '');
const depth = (p) => p.split('/').filter(Boolean).length;
function link(from, to) {
  const up = '../'.repeat(depth(from));
  let target = to.replace(/^\//, '');
  if (LINK_INDEX && (target === '' || target.endsWith('/'))) target += 'index.html';
  return (up + target) || './';
}
const asset = (from, file) => `${'../'.repeat(depth(from))}assets/${file}`;
const appLink = (page) => `${'../'.repeat(depth(page.path))}app/${LINK_INDEX ? 'index.html' : ''}`;

const ICON = {
  dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
  hourglass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 2h4M12 14l3-3"/><circle cx="12" cy="14" r="8"/></svg>',
  logo: '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lgx" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc85e"/><stop offset="1" stop-color="#ff6a2f"/></linearGradient></defs><circle cx="16" cy="16" r="11" fill="none" stroke="url(#lgx)" stroke-width="4" stroke-dasharray="52 80" stroke-linecap="round" transform="rotate(-45 16 16)"/><circle cx="16" cy="16" r="4.2" fill="url(#lgx)"/></svg>',
};

// ------------------------------------------------------------------ layout

function head(page, t, { title, desc, type = 'website', jsonld = [] }) {
  const url = BASE + page.path;
  const alt = PAGES.filter((p) => p.id === page.id);
  const og = `${BASE}/assets/og-${page.lang}.png`;
  return `<!doctype html>
<html lang="${page.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
${alt.map((p) => `<link rel="alternate" hreflang="${p.lang}" href="${BASE + p.path}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${BASE + (find(page.id, 'en') || page).path}">
<meta name="theme-color" content="#07090f">
<meta name="color-scheme" content="dark">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Halyra Focus">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(t.meta.ogAlt)}">
<meta property="og:locale" content="${page.lang === 'hu' ? 'hu_HU' : 'en_US'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${og}">
<link rel="icon" href="${asset(page.path, 'favicon.svg')}" type="image/svg+xml">
<link rel="icon" href="${asset(page.path, 'favicon-32.png')}" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${asset(page.path, 'apple-touch-icon.png')}">
<link rel="manifest" href="${link(page.path, '/site.webmanifest').replace(/index\.html$/, '')}">
<link rel="preload" href="${asset(page.path, 'fonts/Inter-SemiBold.woff')}" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="${asset(page.path, 'site.css')}?v=${VERSION}">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>`;
}

function nav(page, t, solid) {
  const other = PAGES.find((p) => p.id === page.id && p.lang !== page.lang);
  const home = link(page.path, find('home', page.lang).path);
  const enP = page.lang === 'en' ? page : other;
  const huP = page.lang === 'hu' ? page : other;
  const sec = (id) => (page.id === 'home' ? `#${id}` : `${home}#${id}`);
  return `<a class="skip" href="#main">${t.nav.skip}</a>
<header class="nav${solid ? ' solid' : ''}" id="nav">
  <div class="wrap nav-in">
    <a class="logo" href="${home}" aria-label="Halyra Focus">${ICON.logo}<span>Halyra Focus<small>${page.lang === 'hu' ? 'App- és oldalblokkoló' : 'App & site blocker'}</small></span></a>
    <nav class="nav-links" aria-label="Main">
      <a href="${sec('features')}">${t.nav.features}</a><a href="${sec('modes')}">${t.nav.modes}</a><a href="${sec('themes')}">${t.nav.themes}</a><a href="${sec('faq')}">${t.nav.faq}</a>
    </nav>
    <div class="nav-right">
      <div class="lang" role="group" aria-label="${t.footer.language}">
        <a href="${link(page.path, enP.path)}" hreflang="en" lang="en" class="${page.lang === 'en' ? 'on' : ''}">EN</a>
        <a href="${link(page.path, huP.path)}" hreflang="hu" lang="hu" class="${page.lang === 'hu' ? 'on' : ''}">HU</a>
      </div>
      <a class="btn sm ghost signin" href="${appLink(page)}">${t.nav.signin}</a>
      <a class="btn pill sm" href="${sec('download')}">${t.nav.download}</a>
    </div>
  </div>
</header>`;
}

function footer(page, t) {
  const L = (id) => link(page.path, find(id, page.lang).path);
  const home = L('home');
  const sec = (id) => (page.id === 'home' ? `#${id}` : `${home}#${id}`);
  return `<footer>
  <div class="wrap foot">
    <div style="max-width:320px">
      <a class="logo" href="${home}">${ICON.logo}<span>Halyra Focus</span></a>
      <p style="margin:14px 0 0">${t.footer.tagline}</p>
      <p style="margin:10px 0 0;color:var(--faint)">v${VERSION} · MIT</p>
    </div>
    <nav aria-label="Footer">
      <div><b>${t.footer.product}</b><a href="${sec('features')}">${t.nav.features}</a><a href="${sec('themes')}">${t.nav.themes}</a><a href="${sec('faq')}">${t.nav.faq}</a><a href="${sec('download')}">${t.nav.download}</a></div>
      <div><b>${t.footer.guides}</b><a href="${L('guide-mac')}">${esc(t.guides.mac.h1)}</a><a href="${L('guide-win')}">${esc(t.guides.win.h1)}</a></div>
      <div><b>${t.footer.legal}</b><a href="${L('privacy')}">${t.footer.privacy}</a><a href="${DL.source}" rel="noopener">${t.footer.source}</a></div>
      <div><b>${t.footer.language}</b><a href="${link(page.path, find(page.id, 'en').path)}" hreflang="en">English</a><a href="${link(page.path, find(page.id, 'hu').path)}" hreflang="hu">Magyar</a></div>
    </nav>
  </div>
</footer>
<script>(function(){var n=document.getElementById('nav');function f(){n.classList.toggle('scrolled',scrollY>20)}addEventListener('scroll',f,{passive:true});f();}());</script>`;
}

function dlButtons(t, glow) {
  return `<a class="btn ${glow ? 'glow' : 'pill'}" data-dl="mac" href="${DL.mac}">${ICON.dl}<span class="two">${t.hero.mac}<span class="sub">${t.hero.macSub}</span></span></a>
<a class="btn" data-dl="win" href="${DL.win}">${ICON.dl}<span class="two">${t.hero.win}<span class="sub">${t.hero.winSub}</span></span></a>
<a class="btn" data-dl="android" href="${DL.android}">${ICON.dl}<span class="two">${t.hero.android}<span class="sub">${t.hero.androidSub}</span></span></a>`;
}

function shot(page, name, alt, eager) {
  return `<div class="shot"><div class="bar"><i></i><i></i><i></i></div><img src="${asset(page.path, `shots/${name}-${page.lang}.webp`)}" alt="${esc(alt)}" width="1680" height="1140" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></div>`;
}

// ------------------------------------------------------------------ pages

function homePage(page) {
  const t = T[page.lang];
  const softwareLd = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Halyra Focus',
    operatingSystem: 'macOS 12+, Windows 10, Windows 11, Android 8+', applicationCategory: 'UtilitiesApplication',
    description: t.meta.desc, softwareVersion: VERSION, downloadUrl: DL.releases, url: BASE + page.path,
    image: `${BASE}/assets/icon-512.png`, screenshot: `${BASE}/assets/shots/focus-${page.lang}.webp`, inLanguage: ['en', 'hu'],
    offers: { '@type': 'Offer', price: '0', priceCurrency: page.lang === 'hu' ? 'HUF' : 'USD' },
    publisher: { '@type': 'Organization', name: 'Halyra' }, license: 'https://opensource.org/licenses/MIT',
  };
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: t.faq.items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  const siteLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Halyra Focus', url: `${BASE}/`, inLanguage: page.lang };
  const modeIcons = ['unlock', 'hourglass', 'lock'];
  const themeShots = { midnight: 'focus', daylight: 'theme-daylight', crt: 'theme-crt', onebit: 'theme-onebit', vapor: 'theme-vapor', custom: 'theme-custom' };

  return `${head(page, t, { title: t.meta.title, desc: t.meta.desc, jsonld: [softwareLd, faqLd, siteLd] })}
<body>
${nav(page, t)}
<main id="main">
<section class="hero">
  <div class="wrap">
    <div class="hero-grid">
      <div>
        <div class="eyebrow"><span class="px">v${VERSION}</span> ${t.hero.eyebrow}</div>
        <h1>${t.hero.h1}</h1>
        <p class="lede">${t.hero.lede}</p>
        <p class="mobile-note ios-note"><span>${t.hero.mobile.replace('{{app}}', appLink(page))}</span></p><p class="mobile-note android-note"><span>${t.hero.androidNote}</span></p>
        <div class="cta">${dlButtons(t, true)}</div>
        <p class="hero-note">${t.hero.note}</p>
      </div>
      <div class="stage" data-labels='${esc(JSON.stringify(t.hero.labels))}'>
        <canvas id="city" role="img" aria-label="${esc(t.hero.canvasLabel)}"></canvas>
        <div id="city-labels" aria-hidden="true"></div>
        <div class="city-overlay" id="city-overlay" aria-hidden="true"><div class="ic">${ICON.lock}</div><div><b>${t.hero.overlayT}</b><span>${t.hero.overlayS}</span></div></div>
        <div class="stage-ui">
          <button class="toggle" id="focus-toggle" aria-pressed="false">${t.hero.toggle} <span class="st-off">${t.hero.off}</span><span class="st-on">${t.hero.on}</span><span class="sw" aria-hidden="true"></span></button>
          <span class="timer-pill" aria-hidden="true">${ICON.timer}<span id="city-timer">25:00</span></span>
        </div>
      </div>
    </div>
    <div class="stats">${t.hero.stats.map(([n, l]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('')}</div>
  </div>
</section>

<section class="sec" id="asks">
  <div class="wrap">
    <div class="sec-head reveal"><div class="eyebrow">${t.asks.eyebrow}</div><h2>${t.asks.h2}</h2><p>${t.asks.p}</p></div>
    <div class="grid g2 asks">${t.asks.items.map(([q, a]) => `<div class="card reveal"><div class="ask-q">${q}</div><div class="ask-a">${ICON.check}<span>${a}</span></div></div>`).join('')}</div>
  </div>
</section>

<section class="sec" id="features" style="padding-top:40px">
  <div class="wrap">
    <div class="sec-head reveal"><div class="eyebrow">${t.features.eyebrow}</div><h2>${t.features.h2}</h2><p>${t.features.p}</p></div>
    <div class="feature-rows">
      ${t.features.rows.map((r, i) => `<div class="frow${i % 2 ? ' flip' : ''} reveal">
        <div class="ftext"><div class="k">${r.k}</div><h3>${r.h}</h3><p>${r.p}</p><ul class="ticks">${r.ticks.map((x) => `<li>${ICON.check}<span>${x}</span></li>`).join('')}</ul></div>
        ${shot(page, r.img, `${r.k} — Halyra Focus`, i === 0)}
      </div>`).join('\n')}
    </div>
    <div class="grid g3" style="margin-top:110px">${t.features.extras.map(([h, p]) => `<div class="card reveal"><h3>${h}</h3><p>${p}</p></div>`).join('')}</div>
  </div>
</section>

<section class="sec" id="modes">
  <div class="wrap">
    <div class="sec-head center reveal"><div class="eyebrow">${t.modes.eyebrow}</div><h2>${t.modes.h2}</h2><p>${t.modes.p}</p></div>
    <div class="modes">${t.modes.items.map(([h, p], i) => `<div class="card mode${i === 0 ? ' hl' : ''} reveal">${i === 0 ? `<span class="def">${t.modes.def}</span>` : ''}<div class="ic">${ICON[modeIcons[i]]}</div><h3>${h}</h3><p>${p}</p><div class="lvl">${[0, 1, 2].map((k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div></div>`).join('')}</div>
  </div>
</section>

<section class="sec" id="themes">
  <div class="wrap" data-tabs data-active="midnight">
    <div class="sec-head center reveal"><div class="eyebrow">${t.themes.eyebrow}</div><h2>${t.themes.h2}</h2><p>${t.themes.p}</p></div>
    <div class="themes-tabs" role="tablist">${Object.entries(t.themes.names).map(([k, n], i) => `<button role="tab" data-tab="${k}" class="${i === 0 ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="panes reveal">${Object.keys(t.themes.names).map((k, i) => `<div class="pane${i === 0 ? ' on' : ''}" data-pane="${k}">${shot(page, themeShots[k], `${t.themes.names[k]} — Halyra Focus`)}</div>`).join('')}</div>
  </div>
</section>

<section class="sec" id="how">
  <div class="wrap">
    <div class="sec-head reveal"><div class="eyebrow">${t.how.eyebrow}</div><h2>${t.how.h2}</h2></div>
    <div class="grid g3 steps">${t.how.steps.map(([h, p]) => `<div class="card step reveal"><h3>${h}</h3><p>${p}</p></div>`).join('')}</div>
  </div>
</section>

<section class="sec" id="compare" style="padding-top:20px">
  <div class="wrap">
    <div class="sec-head reveal"><div class="eyebrow">${t.cmp.eyebrow}</div><h2>${t.cmp.h2}</h2></div>
    <div class="reveal" style="overflow-x:auto"><table class="cmp">
      <thead><tr>${t.cmp.cols.map((c, i) => `<th scope="col"${i === 1 ? ' class="us"' : ''}>${c}</th>`).join('')}</tr></thead>
      <tbody>${t.cmp.rows.map((r) => `<tr>${r.map((c, i) => {
        const v = c === 'Y' ? `<span class="y">✓</span>` : c === 'N' ? `<span class="n">✕</span>` : c;
        return i === 0 ? `<th scope="row">${v}</th>` : `<td${i === 1 ? ' class="us"' : ''}>${v}</td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <p style="color:var(--faint);font-size:13px;margin-top:14px">${t.cmp.note}</p>
  </div>
</section>

<section class="sec" id="faq">
  <div class="wrap">
    <div class="sec-head center reveal"><div class="eyebrow">${t.faq.eyebrow}</div><h2>${t.faq.h2}</h2></div>
    <div class="faq">${t.faq.items.map(([q, a]) => `<details><summary>${q}</summary><div class="a"><p>${a}</p></div></details>`).join('')}</div>
  </div>
</section>

<section class="final" id="download">
  <div class="wrap">
    <div class="reveal">
      <div style="width:84px;height:84px;margin:0 auto 26px"><img src="${asset(page.path, 'icon-512.png')}" alt="" width="84" height="84"></div>
      <h2 style="max-width:820px;margin:0 auto 16px">${t.final.h2}</h2>
      <p style="color:var(--muted);font-size:18px;margin:0 0 34px">${t.final.p}</p>
      <p class="mobile-note ios-note"><span>${t.hero.mobile.replace('{{app}}', appLink(page))}</span></p><p class="mobile-note android-note"><span>${t.hero.androidNote}</span></p>
      <div class="cta">${dlButtons(t, true)}</div>
      <p style="margin-top:18px"><a href="${DL.releases}" style="color:var(--muted);font-size:14px" rel="noopener">${t.final.all} →</a></p>
    </div>
    <div class="install-notes">
      <div class="card"><h3>${t.final.macT}</h3><ol>${t.final.mac.map((x) => `<li>${x}</li>`).join('')}</ol></div>
      <div class="card"><h3>${t.final.winT}</h3><ol>${t.final.win.map((x) => `<li>${x}</li>`).join('')}</ol></div>
      <div class="card"><h3>${t.final.androidT}</h3><ol>${t.final.android.map((x) => `<li>${x}</li>`).join('')}</ol></div>
    </div>
    <p style="color:var(--faint);font-size:13px;margin-top:18px">${t.final.why}</p>
  </div>
</section>
</main>
${footer(page, t)}
<script src="${asset(page.path, 'site.js')}?v=${VERSION}" defer></script>
</body>
</html>
`;
}

function articlePage(page, data, crumbs) {
  const t = T[page.lang];
  const home = link(page.path, find('home', page.lang).path);
  const ld = [{
    '@context': 'https://schema.org', '@type': page.id === 'privacy' ? 'WebPage' : 'Article', headline: data.h1, description: data.desc,
    inLanguage: page.lang, url: BASE + page.path, dateModified: TODAY, publisher: { '@type': 'Organization', name: 'Halyra' },
    ...(page.id === 'privacy' ? {} : { image: `${BASE}/assets/og-${page.lang}.png`, author: { '@type': 'Organization', name: 'Halyra' } }),
  }, {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Halyra Focus', item: `${BASE}${find('home', page.lang).path}` },
      { '@type': 'ListItem', position: 2, name: data.h1, item: BASE + page.path },
    ],
  }];
  const body = data.body.replace(/\{\{home\}\}/g, home);
  return `${head(page, t, { title: data.title, desc: data.desc, type: 'article', jsonld: ld })}
<body>
${nav(page, t, true)}
<main id="main" class="article">
  <div class="wrap">
    <div class="crumbs"><a href="${home}">Halyra Focus</a> / ${crumbs}</div>
    <h1>${data.h1}</h1>
    ${body}
  </div>
</main>
${footer(page, t)}
</body>
</html>
`;
}

function notFoundPage() {
  const page = { id: '404', lang: 'en', path: '/' };
  const t = en;
  // 404.html is served at any depth, so resolve every relative URL from the site root.
  const basePath = new URL(`${BASE}/`).pathname;
  return `${head(page, t, { title: t.notFound.title, desc: t.meta.desc }).replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<base href="${basePath}">\n<meta name="robots" content="noindex">`)}
<body>
${nav({ ...page, id: 'home' }, t, true)}
<main id="main" class="article" style="text-align:center;min-height:70vh">
  <div class="wrap"><div style="font-family:var(--pixel);color:var(--accent);font-size:22px">404</div><h1>${t.notFound.h1}</h1><p>${t.notFound.p}</p>
  <p><a class="btn pill" href="./">${t.notFound.back}</a> <a class="btn" href="hu/">Magyar főoldal</a></p></div>
</main>
</body>
</html>
`;
}

// ------------------------------------------------------------------ write

function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(SRC, 'assets'), path.join(OUT, 'assets'), { recursive: true });

for (const page of PAGES) {
  const t = T[page.lang];
  let html;
  if (page.id === 'home') html = homePage(page);
  else if (page.id === 'privacy') html = articlePage(page, t.privacy, t.footer.privacy);
  else if (page.id === 'guide-mac') html = articlePage(page, t.guides.mac, t.guides.label);
  else if (page.id === 'guide-win') html = articlePage(page, t.guides.win, t.guides.label);
  write(path.join(page.path, 'index.html'), html);
}
write('404.html', notFoundPage());
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PAGES.map((p) => `  <url>
    <loc>${BASE + p.path}</loc>
    <lastmod>${TODAY}</lastmod>
${PAGES.filter((x) => x.id === p.id).map((x) => `    <xhtml:link rel="alternate" hreflang="${x.lang}" href="${BASE + x.path}"/>`).join('\n')}
    <priority>${p.id === 'home' ? '1.0' : '0.7'}</priority>
  </url>`).join('\n')}
</urlset>
`);
write('site.webmanifest', JSON.stringify({
  name: 'Halyra Focus', short_name: 'Halyra Focus', start_url: '.', display: 'standalone', background_color: '#07090f', theme_color: '#07090f',
  icons: [{ src: 'assets/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'assets/icon-512.png', sizes: '512x512', type: 'image/png' }],
}, null, 2));
// ---- web app (phone & browser companion), same account as the desktop app
const CLOUD = (() => { try { return JSON.parse(fs.readFileSync(path.join(SRC, '..', 'src', 'shared', 'cloud.json'), 'utf8')); } catch (_) { return {}; } })();
fs.cpSync(path.join(SRC, 'app'), path.join(OUT, 'app'), { recursive: true });
write('app/config.js', `window.HALYRA_CFG = ${JSON.stringify({ url: CLOUD.url || '', anonKey: CLOUD.anonKey || '', dl: { mac: DL.mac, win: DL.win, android: DL.android }, home: LINK_INDEX ? '../index.html' : '../', version: VERSION })};\n`);
write('app/manifest.webmanifest', JSON.stringify({
  name: 'Halyra Focus', short_name: 'Halyra', description: 'Start focus blocks on all your computers from your phone.', start_url: './', scope: './', display: 'standalone',
  background_color: '#07090f', theme_color: '#07090f',
  icons: [{ src: '../assets/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '../assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
}, null, 2));
write('.nojekyll', '');
if (domain) write('CNAME', `${domain}\n`);
console.log(`Built ${PAGES.length + 1} pages → ${OUT}\nBase URL: ${BASE}\nDownloads: ${DL.mac}`);
